package com.vertexai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vertexai.dto.ControlActionRequest;
import com.vertexai.dto.ScanRequest;
import com.vertexai.dto.ScanStatusResponse;
import com.vertexai.entity.Asset;
import com.vertexai.entity.ScanJob;
import com.vertexai.exception.BadRequestException;
import com.vertexai.exception.ResourceNotFoundException;
import com.vertexai.event.ScanStartedEvent;
import com.vertexai.repository.ScanJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
public class ScanService {

    private final ScanJobRepository scanJobRepository;
    private final AssetService assetService;
    private final PipelineOrchestrator pipelineOrchestrator;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    public ScanService(
            ScanJobRepository scanJobRepository,
            AssetService assetService,
            @Lazy PipelineOrchestrator pipelineOrchestrator,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper) {
        this.scanJobRepository = scanJobRepository;
        this.assetService = assetService;
        this.pipelineOrchestrator = pipelineOrchestrator;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ScanStatusResponse startScan(ScanRequest request) {
        log.info("Initiating scan request for asset ID: {}", request.getAssetId());

        Asset asset = assetService.getAssetEntityById(request.getAssetId());

        // Asset Authorization Gate (architecture_plan.md §7, §16)
        if (Boolean.FALSE.equals(asset.getIsAuthorized())) {
            log.warn("Scan blocked: Asset {} ({}) is NOT authorized for scanning", asset.getHostname(),
                    asset.getAssetId());
            throw new BadRequestException(
                    "Asset '" + asset.getHostname() + "' is not authorized for vulnerability scanning.");
        }

        String scannersUsed = String.join(",", request.getScanners());

        ScanJob scanJob = ScanJob.builder()
                .asset(asset)
                .status("RUNNING")
                .scannersUsed(scannersUsed)
                .build();

        ScanJob savedJob = scanJobRepository.save(scanJob);
        log.info("ScanJob created with ID: {} and status: RUNNING", savedJob.getScanId());

        // Trigger the Human-in-the-Loop AI pipeline only AFTER this transaction
        // commits.
        // Calling the @Async pipeline directly from inside this @Transactional method
        // raced
        // the commit: the worker thread could not see the scan_jobs row yet, so every
        // status write it attempted was silently dropped.
        int reportCount = request.getReports() != null ? request.getReports().size() : 0;
        log.info("Publishing ScanStartedEvent for scan {} ({} uploaded reports) — pipeline starts after commit",
                savedJob.getScanId(), reportCount);
        eventPublisher.publishEvent(new ScanStartedEvent(
                savedJob.getScanId(), asset, request.getScanners(), request.getReports()));

        return pipelineOrchestrator.buildStatusResponse(savedJob);
    }

    @Transactional(readOnly = true)
    public ScanStatusResponse getScanStatus(UUID scanId) {
        ScanJob scanJob = scanJobRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", scanId));

        return pipelineOrchestrator.buildStatusResponse(scanJob);
    }

    @Transactional(readOnly = true)
    public ScanStatusResponse getLatestScanStatus() {
        // Excludes the permanent seed/demo scan job — previously this used findAll()
        // + max(startedAt) with no such filter, so a fresh install with no real scans
        // yet would return the seed job's fabricated pipeline status as if it were a
        // genuine "latest scan", which is exactly the kind of stale/wrong data that
        // made pipeline state look inconsistent between sessions.
        return scanJobRepository.findLatestNonSeed()
                .map(pipelineOrchestrator::buildStatusResponse)
                .orElse(null);
    }

    /**
     * Agent 2's full per-finding dedup audit for this run — every input finding,
     * including ones merged away, with its group id, KEPT/REMOVED_* status, and a
     * reason. Empty list (not an error) when this scan hasn't reached Agent 2 yet, or
     * ran against a mocked agent client that doesn't populate dedup_detail.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getDedupReport(UUID scanId) {
        ScanJob scanJob = scanJobRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", scanId));
        if (scanJob.getDedupReportJson() == null || scanJob.getDedupReportJson().isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(scanJob.getDedupReportJson(), new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception e) {
            log.warn("Failed to parse dedup_report_json for scan {}: {}", scanId, e.getMessage());
            return List.of();
        }
    }

    private static final List<String> DEDUP_CSV_COLUMNS = List.of(
            "finding_id", "cve_id", "scanner_source", "target_host", "severity",
            "description", "duplicate_group_id", "duplicate_status", "reason");

    private static final List<String> DEDUP_CSV_HEADERS = List.of(
            "Finding ID", "CVE", "Scanner/Source", "Asset", "Severity",
            "Description", "Duplicate/Group ID", "Duplicate Status", "Reason for Removal/Retention");

    @Transactional(readOnly = true)
    public String getDedupReportCsv(UUID scanId) {
        List<Map<String, Object>> rows = getDedupReport(scanId);
        StringBuilder csv = new StringBuilder();
        csv.append(String.join(",", DEDUP_CSV_HEADERS)).append("\n");
        for (Map<String, Object> row : rows) {
            List<String> cells = new ArrayList<>();
            for (String col : DEDUP_CSV_COLUMNS) {
                Object v = row.get(col);
                cells.add(csvEscape(v != null ? v.toString() : ""));
            }
            csv.append(String.join(",", cells)).append("\n");
        }
        return csv.toString();
    }

    private String csvEscape(String value) {
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    public ScanStatusResponse handleControlAction(UUID scanId, ControlActionRequest controlRequest) {
        log.info("Received control action '{}' for scan ID: {}", controlRequest.getAction(), scanId);

        ScanJob scanJob = scanJobRepository.findById(scanId)
                .orElseThrow(() -> new ResourceNotFoundException("ScanJob", "id", scanId));

        return pipelineOrchestrator.handleControl(scanJob, controlRequest.getAction());
    }

    @Transactional
    public ScanStatusResponse uploadAndStartScan(UUID assetId, MultipartFile[] files, List<String> scanners) {
        log.info("Processing {} uploaded scan report files for asset ID: {}", files != null ? files.length : 0,
                assetId);

        List<ScanRequest.ReportEntry> reportEntries = new ArrayList<>();
        Set<String> detectedScanners = new HashSet<>();
        if (scanners != null) {
            detectedScanners.addAll(scanners);
        }

        if (files != null) {
            for (MultipartFile file : files) {
                if (file.isEmpty())
                    continue;
                String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
                log.info("📄 Processing uploaded file: {} ({} bytes)", file.getOriginalFilename(), file.getSize());

                String scannerType = null;
                if (filename.contains("nuclei") || filename.endsWith(".jsonl")) {
                    scannerType = "NUCLEI";
                } else if (filename.contains("openvas")) {
                    scannerType = "OPENVAS";
                } else if (filename.contains("nmap")) {
                    scannerType = "NMAP";
                } else if (filename.contains("zap")) {
                    scannerType = "OWASP_ZAP";
                }

                try {
                    String content = new String(file.getBytes(), StandardCharsets.UTF_8);

                    if (scannerType == null) {
                        // Filename gave no hint (e.g. "report.xml", "scan1.json") — fall back to
                        // sniffing the actual file content instead of defaulting blindly.
                        scannerType = detectScannerFromContent(content);
                        log.info("  ├─ Filename gave no scanner hint; content-sniffed as: {}", scannerType);
                    } else {
                        log.info("  ├─ Detected scanner from filename: {}", scannerType);
                    }
                    log.info("  ├─ Content length: {} bytes", content.length());
                    log.info("  └─ Content preview: {}...", content.substring(0, Math.min(100, content.length())));

                    reportEntries.add(ScanRequest.ReportEntry.builder()
                            .scannerType(scannerType)
                            .content(content)
                            .build());
                    detectedScanners.add(scannerType);
                } catch (IOException e) {
                    log.error("Failed to read uploaded file {}: {}", file.getOriginalFilename(), e.getMessage());
                    throw new BadRequestException("Failed to read uploaded file: " + file.getOriginalFilename());
                }
            }
        }

        log.info("✅ Successfully processed {} report entries", reportEntries.size());
        if (!reportEntries.isEmpty()) {
            log.info("  └─ First entry: scanner={}, content_length={}",
                    reportEntries.get(0).getScannerType(),
                    reportEntries.get(0).getContent().length());
        }

        if (detectedScanners.isEmpty()) {
            detectedScanners.addAll(List.of("NMAP", "NUCLEI", "OWASP_ZAP", "OPENVAS"));
        }

        ScanRequest request = ScanRequest.builder()
                .assetId(assetId)
                .scanners(new ArrayList<>(detectedScanners))
                .reports(reportEntries)
                .build();

        return startScan(request);
    }

    /**
     * Fallback scanner-type detection by sniffing file content instead of the
     * filename. Used only when the filename gives no hint (e.g. generic names
     * like "report.xml"/"export.json"), so misnamed uploads still route to the
     * correct Agent 1 parser instead of silently defaulting to OWASP_ZAP.
     */
    private String detectScannerFromContent(String content) {
        if (content == null || content.isBlank()) {
            return "OWASP_ZAP";
        }
        String sample = content.length() > 2000 ? content.substring(0, 2000) : content;
        String lower = sample.toLowerCase();

        // XML-based scanners: check root element / distinctive tags.
        if (lower.contains("<nmaprun")) {
            return "NMAP";
        }
        if (lower.contains("<report") && (lower.contains("openvas") || lower.contains("<nvt") || lower.contains("greenbone"))) {
            return "OPENVAS";
        }
        if (lower.contains("owasp zap") || lower.contains("<alerts>") || lower.contains("zap-core-help")) {
            return "OWASP_ZAP";
        }

        // JSON / JSONL scanners: check for distinctive keys.
        boolean looksLikeJson = sample.trim().startsWith("{") || sample.trim().startsWith("[");
        if (looksLikeJson) {
            if (lower.contains("\"template-id\"") || lower.contains("\"matched-at\"") || lower.contains("\"curl-command\"")) {
                return "NUCLEI";
            }
            if (lower.contains("\"site\"") && lower.contains("\"alerts\"")) {
                return "OWASP_ZAP";
            }
            // NDJSON (one JSON object per line) is characteristic of Nuclei output.
            if (content.trim().lines().count() > 1 && content.trim().lines().allMatch(l -> l.trim().startsWith("{"))) {
                return "NUCLEI";
            }
        }

        log.warn("Content-sniffing could not confidently identify scanner type; defaulting to OWASP_ZAP");
        return "OWASP_ZAP";
    }

}
