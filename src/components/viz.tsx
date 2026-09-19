"use client";

import type { RequirementResult } from "@/lib/scorer/types";

/* ---------------------------------------------------------------- Ring ---- */

/**
 * Circular progress. `value` is 0..1. The track sits behind a stroked arc, and
 * the arc starts at 12 o'clock because a score that begins at 3 o'clock reads
 * as an arbitrary slice rather than a filled gauge.
 */
export function Ring({
  value,
  size = 64,
  stroke = 5,
  children,
  tone = "accent",
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  tone?: "accent" | "pass" | "warn" | "fail" | "muted";
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const color = `var(--color-${tone === "accent" ? "accent" : tone})`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 420ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- Meter ---- */

/** Labelled horizontal progress bar. `value` is 0..1. */
export function Meter({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: number;
  detail?: string;
  compact?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="min-w-0">
      <div className={`mb-1 flex items-baseline justify-between gap-2 ${compact ? "text-[10.5px]" : "text-[12px]"}`}>
        <span className="truncate text-muted">{label}</span>
        <span className="nums shrink-0 text-faint">{detail ?? pct.toFixed(0)}</span>
      </div>
      <div className={`w-full overflow-hidden rounded-full bg-line ${compact ? "h-[4px]" : "h-[6px]"}`}>
        <div
          className="h-full rounded-full bg-bar"
          style={{ width: `${pct}%`, transition: "width 420ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------- RequirementTrack ---- */

export interface TrackCounts {
  met: number;
  total: number;
  mustMissing: number;
}

export function requirementCounts(requirements: RequirementResult[], threshold: number): TrackCounts {
  return {
    met: requirements.filter((r) => r.probability >= threshold).length,
    total: requirements.length,
    mustMissing: requirements.filter((r) => r.mustHave && r.probability < threshold).length,
  };
}

/**
 * One segment per requirement, left to right in the order they were written.
 *
 * This replaced a segmented donut. Part-to-whole in a ring is only legible to
 * about six segments; at ten the arcs were the same length and the reader could
 * not count them. A straight track is countable, and it keeps the list order so
 * segment N lines up with requirement N in the list beneath it.
 *
 * Three encodings, so colour is never doing the work alone:
 *   colour  — met / must-have missing / optional unmet
 *   height  — must-haves are full height, optional ones are shorter
 *   opacity — how confident the probability was
 */
export function RequirementTrack({
  requirements,
  threshold,
  height = 12,
  title,
}: {
  requirements: RequirementResult[];
  threshold: number;
  height?: number;
  title?: boolean;
}) {
  if (requirements.length === 0) {
    return <div className="text-[11px] text-faint">No requirements</div>;
  }
  return (
    <div className="flex w-full items-end gap-[2px]" style={{ height }}>
      {requirements.map((r) => {
        const met = r.probability >= threshold;
        const color = met ? "bg-pass" : r.mustHave ? "bg-fail" : "bg-line";
        return (
          <div
            key={r.idx}
            className={`min-w-0 flex-1 rounded-[2px] ${color}`}
            style={{
              height: r.mustHave ? "100%" : "64%",
              opacity: met ? 0.5 + 0.5 * r.probability : r.mustHave ? 0.85 : 1,
            }}
            title={
              title === false
                ? undefined
                : `${r.text} — ${r.probability.toFixed(2)}${r.mustHave ? " (must-have)" : ""}`
            }
          />
        );
      })}
    </div>
  );
}

export function TrackLegend() {
  const items = [
    ["bg-pass", "met"],
    ["bg-fail", "must-have missing"],
    ["bg-line", "optional, unmet"],
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-muted">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-2">
          <span className={`h-[9px] w-[5px] rounded-[2px] ${color}`} />
          {label}
        </span>
      ))}
      <span className="text-faint">Taller bars are must-haves.</span>
    </div>
  );
}

/* ---------------------------------------------------------------- Chip ---- */

export function Chip({
  tone = "muted",
  children,
}: {
  tone?: "pass" | "warn" | "fail" | "muted" | "accent";
  children: React.ReactNode;
}) {
  // Tinted fills rather than bare outlines: on a white surface an outline-only
  // chip disappears, and these carry a word as well as a colour.
  const map = {
    pass: "border-pass/25 bg-pass/8 text-pass",
    warn: "border-warn/25 bg-warn/8 text-warn",
    fail: "border-fail/25 bg-fail/8 text-fail",
    accent: "border-accent/25 bg-accent/8 text-accent",
    muted: "border-line bg-raised text-muted",
  } as const;
  return (
    <span
      className={`rounded border px-1.5 py-[2px] text-[10px] font-medium uppercase tracking-wider ${map[tone]}`}
    >
      {children}
    </span>
  );
}
