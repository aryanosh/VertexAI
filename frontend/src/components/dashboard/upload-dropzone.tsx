'use client';

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { usePipeline } from "@/lib/pipeline-context";
import type { ScanStatusResponse } from "@/types/contracts";

interface StagedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  status: "Staged" | "Uploading" | "Done" | "Failed";
  error?: string;
}

interface UploadDropzoneProps {
  onUploadSuccess?: (response: ScanStatusResponse) => void;
}

export function UploadDropzone({ onUploadSuccess }: UploadDropzoneProps) {
  // Push the upload result into app-wide pipeline state so the Threat Overview on the
  // dashboard route reflects it immediately, without requiring a tab switch.
  const { applyStatus, refresh, status: pipelineStatus, currentStage } = usePipeline();
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ScanStatusResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndStageFiles = (files: FileList | File[]) => {
    setErrorMessage(null);
    const newStaged: StagedFile[] = [];
    const rejected: string[] = [];

    Array.from(files).forEach((file) => {
      const name = file.name.toLowerCase();
      const isValidExt = name.endsWith(".json") || name.endsWith(".xml") || name.endsWith(".jsonl");

      if (isValidExt) {
        // Detect scanner format
        let type = "OWASP ZAP / JSON";
        if (name.includes("nuclei") || name.endsWith(".jsonl")) type = "Nuclei / JSONL";
        else if (name.includes("openvas")) type = "OpenVAS / XML";
        else if (name.includes("nmap")) type = "Nmap / XML";
        else if (name.endsWith(".xml")) type = "XML Report";

        newStaged.push({
          file,
          name: file.name,
          size: file.size,
          type,
          status: "Staged",
        });
      } else {
        rejected.push(file.name);
      }
    });

    if (rejected.length > 0) {
      setErrorMessage(
        `Rejected ${rejected.length} file(s) [${rejected.join(", ")}]. Only .json and .xml scanner report files are accepted.`
      );
    }

    if (newStaged.length > 0) {
      setStagedFiles((prev) => [...prev, ...newStaged]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndStageFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndStageFiles(e.target.files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    setErrorMessage(null);
    setStagedFiles((prev) => prev.map((f) => ({ ...f, status: "Uploading" })));

    try {
      // Use default authorized asset ID from database
      const defaultAssetId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      const filesToUpload = stagedFiles.map((f) => f.file);

      const response = await api.uploadScanReports(defaultAssetId, filesToUpload);
      setUploadResult(response);
      applyStatus(response);
      setStagedFiles((prev) => prev.map((f) => ({ ...f, status: "Done" })));
      onUploadSuccess?.(response);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Upload failed: ${msg}`);
      setStagedFiles((prev) => prev.map((f) => ({ ...f, status: "Failed" })));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="font-mono text-base font-bold text-slate-800 flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-brand" />
            Scanner Report Ingestion Box
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Drag and drop 2+ scanner reports (.json, .xml). Files are staged first — click Upload to submit to pipeline.
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 border border-slate-200">
          STAGING ACTIVE
        </span>
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${isDragging
          ? "border-brand bg-brand-soft/50 scale-[1.01]"
          : "border-slate-300 bg-slate-50/60 hover:border-brand hover:bg-slate-50"
          }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".json,.xml,.jsonl"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-brand shadow-xs mb-3">
          <UploadCloud className="h-6 w-6" />
        </div>

        <p className="font-mono text-sm font-bold text-slate-800 text-center">
          Drag & Drop scanner reports here, or <span className="text-brand underline">browse files</span>
        </p>
        <p className="text-xs text-slate-400 font-mono mt-1 text-center">
          Accepts: <strong className="text-slate-600">.json, .xml</strong> files only (OWASP ZAP, Nuclei, OpenVAS, Nmap)
        </p>
      </div>

      {/* Client-Side Validation Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-mono animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Staged Files List */}
      {stagedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs font-bold text-slate-700">
              Staged Files ({stagedFiles.length}) — Not yet uploaded
            </h3>
            <button
              onClick={() => setStagedFiles([])}
              className="text-[11px] font-mono text-slate-400 hover:text-rose-600"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stagedFiles.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <FileCode2 className="h-4 w-4 text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {Math.round(item.size / 1024)} KB · {item.type}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${item.status === "Done"
                      ? "bg-emerald-100 text-emerald-700"
                      : item.status === "Uploading"
                        ? "bg-amber-100 text-amber-700 animate-pulse"
                        : item.status === "Failed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {item.status}
                  </span>
                  {!isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(idx);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Explicit Upload Submit Button */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-sans">
              Click Upload to send staged files to the 4-agent parsing sandbox.
            </p>
            <button
              onClick={handleUploadSubmit}
              disabled={isUploading || stagedFiles.length === 0}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 font-mono text-xs font-bold text-white shadow-md hover:bg-brand/90 transition-all disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Uploading {stagedFiles.length} files...</span>
                </>
              ) : (
                <>
                  <span>Upload Staged Files ({stagedFiles.length})</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Upload Success Banner — reports LIVE pipeline state from the shared provider
          rather than asserting "Stage 1 Started" before the agent has actually run. */}
      {uploadResult && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-mono text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              Upload successful. Scan Job: <strong>{uploadResult.scan_id || uploadResult.scanId}</strong>
            </span>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 shrink-0">
            {pipelineStatus === "RUNNING"
              ? "Agents processing your files…"
              : pipelineStatus === "WAITING_FOR_HUMAN"
                ? `Gate ${currentStage} awaiting your review →`
                : `Pipeline status: ${pipelineStatus}`}
          </span>
        </div>
      )}
    </div>
  );
}
