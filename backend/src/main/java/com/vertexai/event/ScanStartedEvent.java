package com.vertexai.event;

import com.vertexai.dto.ScanRequest;
import com.vertexai.entity.Asset;

import java.util.List;
import java.util.UUID;

/**
 * Published by {@code ScanService.startScan} once a {@code ScanJob} row has been created.
 *
 * <p>This event exists to remove a real race condition. Previously {@code startScan} was
 * {@code @Transactional} and invoked the {@code @Async} pipeline directly, so the worker
 * thread could begin executing — and try to read the {@code scan_jobs} row — before the
 * caller's transaction had committed. The row was then invisible to the worker and every
 * subsequent status write was silently discarded by an {@code Optional.ifPresent(...)},
 * leaving the database stuck on {@code RUNNING} while the in-memory cache advanced.
 *
 * <p>{@code PipelineOrchestrator} consumes this event with
 * {@code @TransactionalEventListener(phase = AFTER_COMMIT)}, which guarantees the row is
 * committed and visible before any agent runs.
 */
public record ScanStartedEvent(
        UUID scanId,
        Asset asset,
        List<String> scanners,
        List<ScanRequest.ReportEntry> reports
) {
}
