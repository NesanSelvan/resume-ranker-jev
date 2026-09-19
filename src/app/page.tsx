"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { parseRequirements } from "@/lib/requirements";

interface ResumeRow {
  id: number;
  fileName: string;
  name: string;
  charCount: number;
  extractionStatus: string;
  extractionError: string | null;
  /** First few hundred characters of the extracted text, for the thumbnail. */
  preview: string;
}

interface ResumeDetail extends ResumeRow {
  mimeType: string;
  /** The whole extracted text — what the scorer reads. */
  text: string;
}

/**
 * Prefilled so the page is runnable on arrival. Matches the default title and the
 * synthetic corpus's ground truth, so loading the fixtures is a no-op overwrite.
 */
const SAMPLE_REQUIREMENTS = `# Senior Backend Engineer · Platform group · Berlin or remote within CET +/- 2
# Lines starting with ! are hard gates. Every other line is weighted, not pass/fail.
# Lines starting with # are notes and are never scored.

! 5+ years of professional backend engineering experience
! Production experience with Go or TypeScript/Node
! Hands-on Kubernetes in production, not only local development

Strong PostgreSQL skills including query optimisation and online schema migration
Experience designing and operating distributed systems at scale
Event streaming with Kafka or an equivalent broker
Observability tooling: metrics, tracing and structured logging
Owns services end to end, including production on-call
API design for internal consumers across REST, gRPC or GraphQL
Mentoring or technical leadership of other engineers
AWS or GCP cloud infrastructure
Terraform or comparable infrastructure-as-code
CI/CD, trunk-based development and automated testing discipline
A track record of measurable latency, throughput or cost improvements
Written communication: design documents and post-incident reviews`;

export default function SetupPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Senior Backend Engineer");
  const [requirementsText, setRequirementsText] = useState(SAMPLE_REQUIREMENTS);
  const [rows, setRows] = useState<ResumeRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  /** Resumes the next run should skip. Nothing is removed — see the x button. */
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const toggleExcluded = (id: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** The resume open in the preview panel, and its full record once fetched. */
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ResumeDetail | null>(null);

  useEffect(() => {
    if (previewId === null) return;
    setPreview(null);
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/resumes/${previewId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { resume: ResumeDetail };
      if (!cancelled) setPreview(data.resume);
    })();

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreviewId(null);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [previewId]);

  /* Only fade the side that actually hides a chip, so an unscrolled rail has a
     crisp left edge instead of a permanently dimmed first name. */
  const [fades, setFades] = useState({ start: false, end: false });

  const measureRail = () => {
    const el = rail.current;
    if (!el) return;
    setFades({
      start: el.scrollLeft > 2,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };

  const refresh = async () => {
    const res = await fetch("/api/resumes");
    const data = (await res.json()) as { resumes: ResumeRow[] };
    setRows(data.resumes);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    measureRail();
    window.addEventListener("resize", measureRail);
    return () => window.removeEventListener("resize", measureRail);
  }, [rows]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(`Extracting ${list.length} file${list.length === 1 ? "" : "s"}…`);
    setError(null);
    const form = new FormData();
    for (const f of list) form.append("files", f);
    const res = await fetch("/api/resumes", { method: "POST", body: form });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Upload failed");
    await refresh();
    setBusy(null);
  };

  const seed = async () => {
    setBusy("Loading synthetic corpus…");
    setError(null);
    const res = await fetch("/api/resumes/seed", { method: "POST" });
    const data = (await res.json()) as { error?: string; requirementsText?: string };
    if (!res.ok) setError(data.error ?? "Seed failed");
    else if (
      data.requirementsText &&
      (!requirementsText.trim() || requirementsText.trim() === SAMPLE_REQUIREMENTS)
    ) {
      setRequirementsText(data.requirementsText);
    }
    await refresh();
    setBusy(null);
  };

  const start = async () => {
    setBusy("Starting run…");
    setError(null);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, requirementsText, resumeIds: included.map((r) => r.id) }),
    });
    const data = (await res.json()) as { runId?: number; error?: string };
    if (!res.ok || !data.runId) {
      setError(data.error ?? "Could not start run");
      setBusy(null);
      return;
    }
    router.push(`/runs/${data.runId}`);
  };

  const parsed = parseRequirements(requirementsText);
  const mustHaves = parsed.filter((r) => r.mustHave).length;
  const included = rows.filter((r) => r.extractionStatus === "ok" && !excluded.has(r.id));
  const ok = included.length;
  const failed = rows.filter((r) => r.extractionStatus !== "ok").length;
  const leftOut = rows.filter((r) => r.extractionStatus === "ok" && excluded.has(r.id)).length;
  const canRun = ok > 0 && parsed.length > 0 && busy === null;
  /* Split in half rather than interleaved: the top row reads straight through
     before the bottom one picks up. */
  const railRows = [rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-14">
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Resume ranker</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Rank a corpus against one role</h1>

        {rows.length > 0 && (
          <div className="mt-6">
            <div className="mb-2.5 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint">In the corpus</p>
              <span className="nums text-[11px] text-muted">
                {rows.length} people
                {leftOut > 0 && <span className="text-faint"> · {leftOut} left out</span>}
              </span>
            </div>
            {/* Two rows sharing one scroll container, so a chip in the top row and
                the one beneath it stay in the same column as you scroll. */}
            <div
              ref={rail}
              onScroll={measureRail}
              style={
                {
                  "--fade-start": fades.start ? "28px" : "0px",
                  "--fade-end": fades.end ? "28px" : "0px",
                } as CSSProperties
              }
              /* Vertical padding so the x buttons, which sit outside the tile
                 corner, are not clipped by the rail's own overflow. */
              className="rail -mx-2 px-2 pb-1 pt-2"
            >
              <div className="flex w-max flex-col gap-2">
                {railRows.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    {row.map((r) => (
                      <div key={r.id} className="relative shrink-0">
                      <button
                        onClick={() => setPreviewId(r.id)}
                        title={
                          r.extractionStatus === "ok"
                            ? `${r.fileName} · ${r.charCount.toLocaleString()} characters extracted`
                            : `${r.fileName} · ${r.extractionError ?? "extraction failed"}`
                        }
                        className={`group relative flex h-[168px] w-[124px] shrink-0 flex-col overflow-hidden rounded-md border bg-panel shadow-[var(--shadow-card)] transition-[border-color,box-shadow,opacity] ${
                          excluded.has(r.id)
                            ? "border-dashed border-line opacity-45"
                            : "border-line hover:border-accent hover:shadow-[var(--shadow-card-hover)]"
                        } cursor-pointer text-left`}
                      >

                        {/* The real first lines of the extracted text, set small. A
                            thumbnail of the actual page beats a generic file icon, and
                            a bad extraction is visible here without opening anything. */}
                        <span className="doc-preview min-h-0 flex-1 overflow-hidden px-2 pb-1 pt-2.5">
                          {r.extractionStatus === "ok" ? (
                            <span className="block whitespace-pre-wrap break-words text-[5.5px] leading-[1.5] text-muted">
                              {r.preview}
                            </span>
                          ) : (
                            <span className="block text-[8px] leading-snug text-faint">
                              No text could be extracted from this file.
                            </span>
                          )}
                        </span>

                        <span className="flex items-center gap-1.5 border-t border-line-soft bg-panel px-2 py-1.5">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-[2px] ${
                              r.extractionStatus === "ok" ? "bg-pass" : "bg-fail"
                            }`}
                          />
                          <span
                            className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-tight ${
                              r.extractionStatus === "ok" ? "" : "text-faint"
                            }`}
                          >
                            {r.extractionStatus === "ok" ? r.name : "Unreadable"}
                          </span>
                        </span>
                      </button>

                      {/* Excluding is a decision about this run, not about the file:
                          the row, the original upload and every score it earned in
                          earlier runs stay exactly where they are. */}
                      <button
                        onClick={() => toggleExcluded(r.id)}
                        aria-pressed={excluded.has(r.id)}
                        aria-label={
                          excluded.has(r.id)
                            ? `Put ${r.name} back in this run`
                            : `Leave ${r.name} out of this run`
                        }
                        title={
                          excluded.has(r.id) ? "Put back in this run" : "Leave out of this run"
                        }
                        className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border text-[13px] leading-none shadow-[var(--shadow-card)] transition-colors ${
                          excluded.has(r.id)
                            ? "border-accent bg-accent text-white"
                            : "border-line bg-panel text-faint hover:border-fail hover:text-fail"
                        }`}
                      >
                        {excluded.has(r.id) ? "↺" : "×"}
                      </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        {/* Requirements */}
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-faint">Role &amp; requirements</h2>
            <span className="nums text-[11px] text-muted">
              {parsed.length} line{parsed.length === 1 ? "" : "s"} · {mustHaves} must-have
            </span>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Role title"
            className="mb-3 w-full rounded-md border border-line bg-panel px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint hover:border-faint/60 focus:border-accent"
          />
          <textarea
            value={requirementsText}
            onChange={(e) => setRequirementsText(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={
              "One requirement per line.\nPrefix with ! to make it a must-have.\n\n! 5+ years backend experience\n! Hands-on Kubernetes in production\nStrong PostgreSQL skills"
            }
            className="w-full resize-y rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint hover:border-faint/60 focus:border-accent"
          />
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
            Each line becomes one typed yes/no question. Must-haves gate the ranking — candidates who
            fail one are separated out, never deleted.
          </p>
        </section>

        {/* Corpus */}
        <section className="flex flex-col rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-faint">Corpus</h2>
            {rows.length > 0 && (
              <span className="nums text-[11px] text-muted">
                {ok} ready
                {failed > 0 && <span className="text-warn"> · {failed} unreadable</span>}
              </span>
            )}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className="flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-raised px-4 py-8 text-center transition-colors hover:border-accent hover:bg-accent/5"
          >
            <p className="text-[13px]">Drop PDF or DOCX files here</p>
            <p className="mt-1 text-[12px] text-faint">or click to choose</p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </div>

          <button
            onClick={() => void seed()}
            className="mt-2.5 cursor-pointer self-start text-[12px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-accent"
          >
            Load the 60 synthetic test resumes
          </button>

        </section>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          disabled={!canRun}
          onClick={() => void start()}
          className="cursor-pointer rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-white shadow-[var(--shadow-card)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Rank {ok > 0 ? `${ok} candidates` : "candidates"}
        </button>
        {busy && <span className="text-[12.5px] text-muted">{busy}</span>}
        {error && <span className="text-[12.5px] text-fail">{error}</span>}
      </div>

      {/* Full preview, in the page. A PDF renders as itself; anything else shows
          the extracted text, which is what the scorer reads anyway. Nothing here
          downloads — the original is one explicit link away. */}
      {previewId !== null && (
        <div
          onClick={() => setPreviewId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={preview ? `${preview.name} resume` : "Resume preview"}
            className="flex h-full max-h-[880px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{preview?.name ?? "Loading…"}</p>
                <p className="nums mt-0.5 truncate text-[11px] text-faint">
                  {preview
                    ? preview.extractionStatus === "ok"
                      ? `${preview.fileName} · ${preview.charCount.toLocaleString()} characters extracted`
                      : `${preview.fileName} · ${preview.extractionError ?? "extraction failed"}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {preview && (
                  <a
                    href={`/api/resumes/${preview.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-accent"
                  >
                    Open original
                  </a>
                )}
                <button
                  onClick={() => setPreviewId(null)}
                  aria-label="Close preview"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line text-[14px] leading-none text-faint transition-colors hover:border-fail hover:text-fail"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-raised">
              {!preview ? (
                <p className="px-5 py-8 text-[12.5px] text-faint">Loading preview…</p>
              ) : preview.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/resumes/${preview.id}/file#toolbar=0&navpanes=0&view=FitH`}
                  title={`${preview.name} resume`}
                  className="h-full w-full border-0 bg-raised"
                />
              ) : (
                <div className="mx-auto my-6 w-full max-w-2xl rounded-md border border-line bg-panel px-8 py-7 shadow-[var(--shadow-card)]">
                  <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-faint">
                    Extracted text
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-ink">
                    {preview.text}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
