"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_WEIGHTS, DIMENSIONS, LEVELS, dimensionLabel, type DimensionKey } from "@/lib/dimensions";
import {
  DEFAULT_MUST_HAVE_THRESHOLD,
  rankCandidates,
  type RankedCandidate,
  type ScoredCandidate,
  type Weights,
} from "@/lib/ranking";
import type { ParsedRequirement } from "@/lib/requirements";
import type { DimensionResult, RequirementResult } from "@/lib/scorer/types";
import { Chip, Meter, RequirementTrack, Ring, TrackLegend, requirementCounts } from "./viz";

interface ApiCandidate {
  resumeId: number;
  name: string;
  fileName: string;
  charCount: number;
  text: string;
  dimensions: DimensionResult[];
  requirements: RequirementResult[];
  model: string;
  latencyMs: number;
  truncated: boolean;
}

interface ApiPayload {
  run: {
    id: number;
    status: "running" | "done" | "failed" | "cancelled";
    total: number;
    completed: number;
    failed: number;
    scorerId: string;
    error: string | null;
  };
  role: { id: number; title: string; requirementsText: string };
  requirements: ParsedRequirement[];
  candidates: ApiCandidate[];
  extractionFailures: Array<{ fileName: string; name: string; error: string | null }>;
}

type Tab = "ranked" | "filtered" | "unreadable";

export default function Results({ runId }: { runId: number }) {
  const router = useRouter();
  const [data, setData] = useState<ApiPayload | null>(null);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [threshold, setThreshold] = useState(DEFAULT_MUST_HAVE_THRESHOLD);
  const [tab, setTab] = useState<Tab>("ranked");
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`);
    if (res.ok) setData((await res.json()) as ApiPayload);
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data?.run.status !== "running") return;
    const timer = setInterval(() => void load(), 1000);
    return () => clearInterval(timer);
  }, [data?.run.status, load]);

  // Re-ranking is pure arithmetic over stored dimensions — moving a weight
  // slider never re-scores anything.
  const { passed, filtered } = useMemo(() => {
    if (!data) return { passed: [], filtered: [] };
    const scored: ScoredCandidate[] = data.candidates.map((c) => ({
      resumeId: c.resumeId,
      name: c.name,
      fileName: c.fileName,
      dimensions: c.dimensions,
      requirements: c.requirements,
      model: c.model,
      truncated: c.truncated,
    }));
    return rankCandidates(scored, { weights, mustHaveThreshold: threshold });
  }, [data, weights, threshold]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setNotice(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch("/api/resumes", { method: "POST", body: form });
    const body = (await res.json()) as { results?: Array<{ status: string }> };
    const added = body.results?.filter((r) => r.status !== "duplicate").length ?? 0;
    setNotice(added > 0 ? `${added} added — start a new run to score them` : "Already in the corpus");
  };

  const startNewRun = async () => {
    if (!data) return;
    setNotice("Starting…");
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: data.role.id }),
    });
    const body = (await res.json()) as { runId?: number };
    if (body.runId) router.push(`/runs/${body.runId}`);
    else setNotice("Could not start a run");
  };

  const endRun = async () => {
    setNotice("Ending run…");
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    await load();
    setNotice("Run ended. Scores already computed are kept.");
  };

  if (!data) {
    return <main className="px-8 py-20 text-[13px] text-muted">Loading run {runId}…</main>;
  }

  const { run, role } = data;
  const running = run.status === "running";
  const sourceOf = (resumeId: number) => data.candidates.find((c) => c.resumeId === resumeId);
  const active = selected === null ? null : [...passed, ...filtered].find((c) => c.resumeId === selected) ?? null;
  const rows = tab === "ranked" ? passed : tab === "filtered" ? filtered : [];
  const done = run.completed + run.failed;
  const progress = run.total === 0 ? 1 : done / run.total;
  const mustHaveCount = data.requirements.filter((r) => r.mustHave).length;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-8 py-10">
      {/* ---------- header ---------- */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-8">
        <div>
          <Link href="/" className="text-[11px] uppercase tracking-[0.14em] text-faint hover:text-muted">
            ← Setup
          </Link>
          <h1 className="mt-2.5 text-[28px] font-medium leading-none tracking-tight">{role.title}</h1>
          <p className="mt-2.5 text-[12.5px] text-muted">
            {data.requirements.length} requirements · {mustHaveCount} must-have · scored by{" "}
            <span className="font-mono text-ink">{run.scorerId}</span>
          </p>
        </div>

        <div className="flex items-end gap-9">
          <Stat value={passed.length} label="ranked" />
          <Stat value={filtered.length} label="filtered out" tone={filtered.length ? "warn" : "muted"} />
          <Stat
            value={data.extractionFailures.length}
            label="unreadable"
            tone={data.extractionFailures.length ? "fail" : "muted"}
          />
        </div>
      </header>

      {/* ---------- controls ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
        <button
          onClick={() => fileInput.current?.click()}
          className="cursor-pointer rounded-md border border-line bg-panel px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-accent/60 hover:bg-raised"
        >
          Upload resumes
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />

        <button
          onClick={() => void startNewRun()}
          disabled={running}
          className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[var(--shadow-card)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start new run
        </button>

        {running && (
          <button
            onClick={() => void endRun()}
            className="cursor-pointer rounded-md border border-fail/40 bg-fail/5 px-3 py-1.5 text-[12.5px] font-medium text-fail transition-colors hover:bg-fail/10"
          >
            End run
          </button>
        )}

        <button
          onClick={() => setShowWeights((v) => !v)}
          className="cursor-pointer rounded-md border border-line bg-panel px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {showWeights ? "Hide weights" : "Adjust weights"}
        </button>

        <div className="ml-auto flex items-center gap-3 text-[12px]">
          {run.status === "cancelled" && <Chip tone="warn">ended early</Chip>}
          {run.status === "done" && !running && <Chip tone="pass">complete</Chip>}
          {notice && <span className="text-muted">{notice}</span>}
        </div>
      </div>

      {/* ---------- progress ---------- */}
      {running && (
        <div className="mb-6 rounded-xl border border-line bg-panel px-4 py-3.5 shadow-[var(--shadow-card)]">
          <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
            <span className="text-muted">Scoring resumes…</span>
            <span className="nums text-muted">
              {done} / {run.total}
            </span>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress * 100}%`, transition: "width 500ms ease" }}
            />
          </div>
        </div>
      )}

      {run.status === "failed" && (
        <div className="mb-6 rounded-xl border border-fail/30 bg-fail/8 px-4 py-3 text-[12.5px] text-fail">
          Run failed: {run.error}
        </div>
      )}

      {/* ---------- weights ---------- */}
      {showWeights && (
        <section className="mb-6 rounded-xl border border-line bg-panel px-5 py-4 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-faint">Weights</h2>
              <p className="mt-1 text-[11.5px] text-muted">
                Re-sorts instantly. Nothing is re-scored.
              </p>
            </div>
            <button
              onClick={() => {
                setWeights({ ...DEFAULT_WEIGHTS });
                setThreshold(DEFAULT_MUST_HAVE_THRESHOLD);
              }}
              className="text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-ink"
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-4 md:grid-cols-4 lg:grid-cols-8">
            {DIMENSIONS.map((d) => (
              <label key={d.key} className="block">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11.5px] text-muted">{d.label}</span>
                  <span className="nums text-[11px] text-faint">{weights[d.key].toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={weights[d.key]}
                  onChange={(e) => setWeights((w) => ({ ...w, [d.key]: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>
            ))}
            <label className="block">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11.5px] text-warn">Must-have gate</span>
                <span className="nums text-[11px] text-faint">{threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </section>
      )}

      {/* ---------- tabs ---------- */}
      <nav className="mb-4 flex gap-1.5 text-[12.5px]">
        {(
          [
            ["ranked", "Ranked", passed.length],
            ["filtered", "Filtered out", filtered.length],
            ["unreadable", "Unreadable", data.extractionFailures.length],
          ] as Array<[Tab, string, number]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-md border px-3.5 py-2 font-medium transition-colors ${
              tab === key
                ? "border-line bg-panel text-ink shadow-[var(--shadow-card)]"
                : "border-transparent text-muted hover:bg-panel hover:text-ink"
            }`}
          >
            {label} <span className="nums ml-1 text-faint">{count}</span>
          </button>
        ))}
      </nav>

      {tab === "unreadable" ? (
        <UnreadableList rows={data.extractionFailures} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel px-5 py-14 text-center text-[12.5px] text-faint shadow-[var(--shadow-card)]">
          {tab === "filtered" ? "Nobody failed a must-have." : "No ranked candidates yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <CandidateRow
              key={c.resumeId}
              candidate={c}
              threshold={threshold}
              selected={c.resumeId === selected}
              onSelect={() => setSelected(c.resumeId)}
            />
          ))}
        </ul>
      )}

      {active && (
        <Drawer
          candidate={active}
          source={sourceOf(active.resumeId)}
          threshold={threshold}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- bits ---- */

function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: number;
  label: string;
  tone?: "ink" | "muted" | "warn" | "fail";
}) {
  const color =
    tone === "warn" ? "text-warn" : tone === "fail" ? "text-fail" : tone === "muted" ? "text-faint" : "text-ink";
  return (
    <div className="text-right">
      <div className={`nums text-[34px] font-light leading-none tracking-tight ${color}`}>{value}</div>
      <div className="mt-2 text-[10.5px] uppercase tracking-[0.12em] text-faint">{label}</div>
    </div>
  );
}

function scoreTone(score: number) {
  if (score >= 70) return "pass" as const;
  if (score >= 45) return "warn" as const;
  return "fail" as const;
}

function CandidateRow({
  candidate: c,
  threshold,
  selected,
  onSelect,
}: {
  candidate: RankedCandidate;
  threshold: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const byKey = new Map(c.dimensions.map((d) => [d.key, d]));
  const counts = requirementCounts(c.requirements, threshold);
  return (
    <li>
      <button
        onClick={onSelect}
        className={`flex w-full cursor-pointer items-center gap-6 rounded-xl border bg-panel px-5 py-4 text-left shadow-[var(--shadow-card)] transition-[box-shadow,border-color] duration-200 ${
          selected
            ? "border-accent/60 shadow-[var(--shadow-card-hover)]"
            : "border-line hover:border-line hover:shadow-[var(--shadow-card-hover)]"
        }`}
      >
        <span className={`nums w-8 shrink-0 text-[15px] ${c.rank === 1 ? "text-accent" : "text-faint"}`}>
          {String(c.rank).padStart(2, "0")}
        </span>

        <span className="w-44 shrink-0">
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[14px] text-ink">{c.name}</span>
          <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-faint">
            {c.fileName}
          </span>
          <span className="mt-2 flex gap-1.5">
            {c.gatePassed ? (
              <Chip tone="pass">all must-haves</Chip>
            ) : (
              <Chip tone="fail">{c.failedMustHaves.length} missing</Chip>
            )}
            {c.needsReview && <Chip tone="warn">review</Chip>}
          </span>
        </span>

        <span className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-3">
          {DIMENSIONS.map((d) => {
            const dim = byKey.get(d.key);
            return (
              <Meter
                key={d.key}
                compact
                label={d.label}
                value={dim?.normalized ?? 0}
                detail={dim ? `${dim.raw.toFixed(1)}/${LEVELS - 1}` : "—"}
              />
            );
          })}
        </span>

        <span className="flex shrink-0 items-center gap-6">
          <span className="w-[140px]">
            <span className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[16px] font-medium leading-none">
                {counts.met}
                <span className="text-[11px] text-faint">/{counts.total}</span>
              </span>
              {counts.mustMissing > 0 && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-fail">
                  {counts.mustMissing} must
                </span>
              )}
            </span>
            <RequirementTrack requirements={c.requirements} threshold={threshold} height={13} />
            <span className="mt-1.5 block text-[9.5px] uppercase tracking-[0.1em] text-faint">
              requirements met
            </span>
          </span>
          <span className="text-center">
            <Ring value={c.composite / 100} size={62} stroke={5} tone={scoreTone(c.composite)}>
              <span className="nums text-[17px] font-light">{c.composite.toFixed(0)}</span>
            </Ring>
            <span className="mt-1.5 block text-[9.5px] uppercase tracking-[0.1em] text-faint">score</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function UnreadableList({ rows }: { rows: Array<{ fileName: string; name: string; error: string | null }> }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel px-5 py-14 text-center text-[12.5px] text-faint shadow-[var(--shadow-card)]">
        Every file extracted cleanly.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.fileName} className="rounded-xl border border-fail/30 bg-panel px-5 py-4 shadow-[var(--shadow-card)]">
          <div className="font-mono text-[12.5px] text-ink">{r.fileName}</div>
          <div className="mt-1.5 text-[12px] text-warn">{r.error ?? "Extraction failed"}</div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- drawer ---- */

function Drawer({
  candidate: c,
  source,
  threshold,
  onClose,
}: {
  candidate: RankedCandidate;
  source: ApiCandidate | undefined;
  threshold: number;
  onClose: () => void;
}) {
  const isPdf = c.fileName.toLowerCase().endsWith(".pdf");
  const drawerCounts = requirementCounts(c.requirements, threshold);
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    setPdfReady(false);
  }, [c.resumeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-[rgb(15_23_42/0.45)]" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-dvh w-full max-w-[1180px] flex-col border-l border-line bg-panel shadow-[var(--shadow-pop)]"
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-4">
            <Ring value={c.composite / 100} size={52} stroke={4} tone={scoreTone(c.composite)}>
              <span className="nums text-[15px] font-light">{c.composite.toFixed(0)}</span>
            </Ring>
            <div>
              <h2 className="text-[19px] font-medium leading-tight tracking-tight">{c.name}</h2>
              <p className="mt-0.5 font-mono text-[11px] text-faint">{c.fileName}</p>
            </div>
            <div className="ml-3 flex gap-1.5">
              {c.gatePassed ? <Chip tone="pass">all must-haves</Chip> : <Chip tone="fail">gated</Chip>}
              <Chip tone="muted">rank {c.rank}</Chip>
              {c.needsReview && <Chip tone="warn">review</Chip>}
            </div>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-md px-2 py-1 text-[15px] text-muted transition-colors hover:bg-raised hover:text-ink" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* analysis */}
          <div className="w-[440px] shrink-0 overflow-y-auto border-r border-line px-6 py-6">
            <h3 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-faint">Ratings</h3>
            <div className="mb-8 space-y-4">
              {c.dimensions.map((d) => (
                <div key={d.key}>
                  <Meter
                    label={dimensionLabel(d.key as DimensionKey)}
                    value={d.normalized}
                    detail={`${d.raw.toFixed(2)} / ${LEVELS - 1}`}
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex flex-1 gap-[2px]" title="probability per rubric level">
                      {Object.entries(d.probabilities).map(([level, p]) => (
                        <span
                          key={level}
                          className="h-[6px] flex-1 rounded-[2px] bg-bar"
                          style={{ opacity: Math.max(0.14, p) }}
                        />
                      ))}
                    </div>
                    <span className="nums shrink-0 text-[10px] text-faint">conf {d.confidence.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-faint">Requirements</h3>
            <div className="mb-5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[22px] font-light leading-none">
                  {drawerCounts.met}
                  <span className="text-[13px] text-faint"> of {drawerCounts.total} met</span>
                </span>
                {drawerCounts.mustMissing > 0 && (
                  <span className="text-[11px] font-medium uppercase tracking-wider text-fail">
                    {drawerCounts.mustMissing} must-have missing
                  </span>
                )}
              </div>
              <RequirementTrack requirements={c.requirements} threshold={threshold} height={22} />
              <div className="mt-3">
                <TrackLegend />
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Bars follow the order of the list below.
              </p>
            </div>

            <ul className="space-y-2.5">
              {c.requirements.map((r) => {
                const met = r.probability >= threshold;
                return (
                  <li key={r.idx}>
                    <div className="mb-1 flex items-start gap-2 text-[12px]">
                      <span className={`mt-[1px] shrink-0 ${met ? "text-pass" : r.mustHave ? "text-fail" : "text-faint"}`}>
                        {met ? "✓" : "✗"}
                      </span>
                      <span className={`flex-1 ${met ? "text-muted" : "text-ink"}`}>
                        {r.text}
                        {r.mustHave && <span className="ml-1.5 text-[9.5px] uppercase tracking-wider text-warn">must</span>}
                      </span>
                      <span className="nums shrink-0 text-faint">{r.probability.toFixed(2)}</span>
                    </div>
                    <div className="ml-5 h-[3px] overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${met ? "bg-pass" : r.mustHave ? "bg-fail" : "bg-faint"}`}
                        style={{ width: `${r.probability * 100}%`, opacity: 0.75 }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-7 border-t border-line-soft pt-4 text-[10.5px] text-faint">
              model <span className="font-mono">{c.model}</span>
              {source && (
                <>
                  {" "}
                  · {source.latencyMs}ms · {source.charCount.toLocaleString()} characters extracted
                </>
              )}
            </p>
          </div>

          {/* document */}
          <div className="flex min-w-0 flex-1 flex-col bg-raised">
            <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.14em] text-faint">
                {isPdf ? "Original document" : "Extracted text"}
              </span>
              <a
                href={`/api/resumes/${c.resumeId}/file`}
                target="_blank"
                rel="noreferrer"
                className="text-[11.5px] text-muted underline decoration-line underline-offset-4 hover:text-ink"
              >
                Open in new tab
              </a>
            </div>

            {isPdf ? (
              <div className="relative min-h-0 flex-1">
                {/* Chrome's PDF plugin paints a blank frame for a beat; cover it. */}
                {!pdfReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-raised text-[12px] text-faint">
                    Loading document…
                  </div>
                )}
                <iframe
                  title={c.fileName}
                  src={`/api/resumes/${c.resumeId}/file#toolbar=0&navpanes=0&view=FitH`}
                  onLoad={() => setPdfReady(true)}
                  className={`h-full w-full border-0 bg-white transition-opacity duration-200 ${
                    pdfReady ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-muted">
                  {source?.text ?? "unavailable"}
                </pre>
                <p className="mt-6 text-[11px] text-faint">
                  DOCX cannot render inline. This is what the scorer actually read.
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
