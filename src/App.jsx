import React, { useState, useMemo } from "react";
import { Upload, CheckCircle2, XCircle, Download, Square, FileSpreadsheet } from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:3001"; const BRANDS = ["Sunlight", "Sunsilk", "Surf Excel", "Lifebuoy", "Knorr", "Rin", "Glow & Lovely", "Dove", "Rafhan", "Clear"];

const STATUS_META = {
  done: { label: "DONE", color: "#4ADE80", icon: CheckCircle2 },
  failed: { label: "FAILED", color: "#F87171", icon: XCircle },
};

function formatBytes(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  const [jobId, setJobId] = useState(null);
  const [urlColumn, setUrlColumn] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | running | done | cancelled | error
  const [rowsMap, setRowsMap] = useState({}); // keyed by rowIdx — supports live in-place updates
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const rows = useMemo(() => Object.values(rowsMap).sort((a, b) => b.rowIdx - a.rowIdx), [rowsMap]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.status === "done").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const brandCounts = {};
    rows.forEach((r) => (r.brands || []).forEach((b) => (brandCounts[b] = (brandCounts[b] || 0) + 1)));
    return { done, failed, brandCounts };
  }, [rows]);

  function upsertRow(rowIdx, patch) {
    setRowsMap((prev) => ({ ...prev, [rowIdx]: { ...(prev[rowIdx] || { rowIdx }), ...patch } }));
  }

  async function startUpload(file) {
    setPhase("running");
    setRowsMap({});
    setProgress({ processed: 0, total: 0 });
    setErrorMsg("");
    setStatusMsg("Validating spreadsheet...");

    const form = new FormData();
    form.append("file", file);
    if (urlColumn.trim()) form.append("urlColumn", urlColumn.trim());

    const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.error || "Upload failed.");
      setPhase("error");
      return;
    }

    setJobId(data.jobId);
    setStatusMsg(`Processing ${data.validUrlCount} images from column "${data.urlColumn}"...`);
    subscribeToEvents(data.jobId);
  }

  function subscribeToEvents(id) {
    const es = new EventSource(`${API_BASE}/api/jobs/${id}/events`);

    es.onmessage = (msg) => {
      const evt = JSON.parse(msg.data);

      if (evt.type === "start") setProgress({ processed: 0, total: evt.total });

      if (evt.type === "row_done") {
        upsertRow(evt.rowIdx, {
          url: evt.url,
          size: evt.size,
          status: evt.status,
          timeSec: evt.timeSec,
          brands: evt.status === "failed" ? [] : undefined, // leave existing brands alone if already set
        });
        setProgress({ processed: evt.processedCount, total: evt.totalCount });
      }

      if (evt.type === "brands_ready") {
        upsertRow(evt.rowIdx, { brands: evt.brands });
      }

      if (evt.type === "chunk_saved") {
        setStatusMsg(`Checkpoint saved — chunk ${evt.chunkIndex}/${evt.totalChunks}`);
      }

      if (evt.type === "done") {
        setPhase(evt.cancelled ? "cancelled" : "done");
        setStatusMsg(evt.cancelled ? "Cancelled — partial results saved." : `All done. ${evt.failedCount} failed after all attempts.`);
        es.close();
      }

      if (evt.type === "error") {
        setErrorMsg(evt.message);
        setPhase("error");
        es.close();
      }
    };
  }

  async function handleCancel() {
    if (!jobId) return;
    await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, { method: "POST" });
    setStatusMsg("Cancelling — finishing current batch, then saving partial results...");
  }

  function handleDownload() {
    if (jobId) window.open(`${API_BASE}/api/jobs/${jobId}/download`, "_blank");
  }

  async function useSampleFile() {
    const res = await fetch(`${API_BASE}/api/sample-file`);
    const blob = await res.blob();
    startUpload(new File([blob], "sample-15-images.xlsx", { type: blob.type }));
  }

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        .app {
          min-height: 100vh; width: 100%;
          background: #0B0D0C;
          background-image: linear-gradient(#151816 1px, transparent 1px), linear-gradient(90deg, #151816 1px, transparent 1px);
          background-size: 32px 32px;
          color: #E7EAE5; font-family: 'IBM Plex Mono', monospace;
          padding: 24px 32px 48px;
        }
        .shell { width: 100%; }
        @media (max-width: 640px) { .app { padding: 16px 14px 32px; } }

        .topbar { border-bottom: 1px solid #23271F; padding-bottom: 20px; margin-bottom: 24px; }
        .brand-mark { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.02em; color: #F4F6F1; display: flex; align-items: center; gap: 10px; }
        .brand-mark .dot { width: 10px; height: 10px; border-radius: 50%; background: #9FE870; box-shadow: 0 0 12px #9FE87088; }

        .controls-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
        .key-input, .col-input {
          background: #10120F; border: 1px solid #23271F; border-radius: 4px; padding: 9px 12px;
          color: #C9D0C3; font-family: inherit; font-size: 12px;
        }
        .key-input { flex: 2; min-width: 220px; }
        .col-input { flex: 1; min-width: 160px; }
        .key-input::placeholder, .col-input::placeholder { color: #4B5445; }
        .btn { font-family: inherit; font-size: 12px; font-weight: 600; padding: 9px 16px; border-radius: 4px; border: 1px solid #23271F; background: #12140F; color: #C9D0C3; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: border-color 0.15s; }
        .btn:hover { border-color: #9FE870; color: #9FE870; }
        .btn.primary { background: #17301E; border-color: #244A2E; color: #9FE870; }
        .btn.danger:hover { border-color: #F87171; color: #F87171; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .dropzone { border: 1px dashed #34392E; border-radius: 4px; padding: 32px 20px; text-align: center; margin: 24px 0; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .dropzone.over { border-color: #9FE870; background: #10140D; }
        .dropzone-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; margin-bottom: 4px; }
        .dropzone-sub { font-size: 12px; color: #6B7566; }

        .error-banner { border: 1px solid #4A2424; background: #1A0F0F; color: #F87171; border-radius: 4px; padding: 12px 16px; font-size: 12.5px; margin-bottom: 20px; }

        .status-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: #10120F; border: 1px solid #23271F; border-radius: 4px; padding: 14px 16px; margin-bottom: 20px; }
        .status-text { font-size: 12.5px; color: #B7C0B2; }
        .progress-track { flex: 1; min-width: 140px; height: 6px; background: #1B1F17; border-radius: 3px; overflow: hidden; margin: 0 14px; }
        .progress-fill { height: 100%; background: #9FE870; transition: width 0.3s ease; }
        .progress-count { font-size: 12px; color: #9FE870; font-weight: 600; white-space: nowrap; }

        .table-wrap { border: 1px solid #23271F; border-radius: 4px; overflow: auto; max-height: 480px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 560px; }
        thead th { position: sticky; top: 0; text-align: left; font-family: 'Space Grotesk', sans-serif; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: #7C8577; padding: 10px 14px; background: #12140F; border-bottom: 1px solid #23271F; white-space: nowrap; }
        tbody td { padding: 9px 14px; border-bottom: 1px solid #181B15; color: #C9D0C3; }
        tbody tr:hover { background: #12150F; }
        .url-cell { color: #8B9686; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; }
        .time-cell.slow { color: #FBBF24; font-weight: 600; }
        .brand-tag { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #17301E; color: #9FE870; border: 1px solid #244A2E; margin: 1px 3px 1px 0; }
        .no-brands { color: #4B5445; font-style: italic; }
        .pending-cell { color: #4B5445; }

        .footer-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 20px; }
        @media (max-width: 640px) { .footer-grid { grid-template-columns: 1fr; } .controls-row { flex-direction: column; align-items: stretch; } }
        .panel { border: 1px solid #23271F; border-radius: 4px; padding: 16px 18px; background: #10120F; }
        .panel-title { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 600; color: #9CA79A; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
        .brand-freq-row { display: flex; align-items: center; gap: 10px; font-size: 12px; margin-bottom: 8px; }
        .brand-freq-name { width: 100px; color: #B7C0B2; flex-shrink: 0; }
        .brand-freq-bar-track { flex: 1; height: 4px; background: #1B1F17; border-radius: 2px; overflow: hidden; }
        .brand-freq-bar-fill { height: 100%; background: #9FE870; border-radius: 2px; transition: width 0.3s; }
        .brand-freq-val { width: 18px; text-align: right; color: #7C8577; }
        .summary-num { font-family: 'Space Grotesk', sans-serif; font-size: 30px; font-weight: 700; color: #F4F6F1; }
        .summary-label { font-size: 11px; color: #7C8577; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .summary-row { display: flex; gap: 28px; }

        .page-footer { text-align: center; font-size: 11px; color: #565F51; padding-top: 12px; border-top: 1px solid #181B15; }
      `}</style>

      <div className="shell">
        <div className="topbar">
          <div className="brand-mark"><span className="dot" /> BrandTrace</div>
          <div className="controls-row">
            <input className="col-input" placeholder='Image URL column (default: "Photo Taken")'
              value={urlColumn} onChange={(e) => setUrlColumn(e.target.value)} disabled={phase === "running"} />
            <button className="btn" onClick={useSampleFile} disabled={phase === "running"}>
              <FileSpreadsheet size={14} /> Try sample file (15 images)
            </button>
          </div>
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        {phase !== "running" && (
          <div className={`dropzone ${dragOver ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) startUpload(f); }}
            onClick={() => document.getElementById("file-input").click()}>
            <input id="file-input" type="file" accept=".xlsx" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && startUpload(e.target.files[0])} />
            <Upload size={20} strokeWidth={1.5} style={{ color: "#566150", marginBottom: 8 }} />
            <div className="dropzone-title">Drop your spreadsheet here</div>
            <div className="dropzone-sub">.xlsx with an image URL column (default: "Photo Taken")</div>
          </div>
        )}

        {phase !== "idle" && !errorMsg && (
          <div className="status-bar">
            <span className="status-text">{statusMsg}</span>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} /></div>
            <span className="progress-count">{progress.processed}/{progress.total} · {progress.total - progress.processed} remaining</span>
            {phase === "running" && <button className="btn danger" onClick={handleCancel}><Square size={12} /> Cancel</button>}
            {(phase === "done" || phase === "cancelled") && <button className="btn primary" onClick={handleDownload}><Download size={13} /> Download results</button>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Image</th><th>Size</th><th>Time</th><th>Status</th><th>Brands identified</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.failed;
                  const Icon = meta.icon;
                  return (
                    <tr key={r.rowIdx}>
                      <td className="url-cell">{r.url}</td>
                      <td>{formatBytes(r.size)}</td>
                      <td>{r.timeSec}s</td>
                      <td><span className="status-pill" style={{ color: meta.color }}><Icon size={12} /> {meta.label}</span></td>
                      <td>
                        {r.brands === undefined
                          ? <span className="pending-cell">cleaning...</span>
                          : r.brands.length
                            ? r.brands.map((b, i) => <span className="brand-tag" key={i}>{b}</span>)
                            : <span className="no-brands">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="footer-grid">
            <div className="panel">
              <div className="panel-title">Brand frequency</div>
              {BRANDS.map((b) => {
                const count = stats.brandCounts[b] || 0;
                const max = Math.max(1, ...Object.values(stats.brandCounts));
                return (
                  <div className="brand-freq-row" key={b}>
                    <span className="brand-freq-name">{b}</span>
                    <div className="brand-freq-bar-track"><div className="brand-freq-bar-fill" style={{ width: `${(count / max) * 100}%` }} /></div>
                    <span className="brand-freq-val">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="panel">
              <div className="panel-title">Summary</div>
              <div className="summary-row">
                <div><div className="summary-num">{stats.done}</div><div className="summary-label">Done</div></div>
                <div><div className="summary-num" style={{ color: stats.failed ? "#F87171" : "#F4F6F1" }}>{stats.failed}</div><div className="summary-label">Failed</div></div>
              </div>
            </div>
          </div>
        )}

        <div className="page-footer">Powered by OCR.space and Gemini.</div>
      </div>
    </div>
  );
}