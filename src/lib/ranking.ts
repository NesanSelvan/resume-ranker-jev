import { DEFAULT_WEIGHTS, DIMENSION_KEYS, type DimensionKey } from "@/lib/dimensions";
import type { DimensionResult, RequirementResult } from "@/lib/scorer/types";

export type Weights = Record<DimensionKey, number>;

export interface ScoredCandidate {
  resumeId: number;
  name: string;
  fileName: string;
  dimensions: DimensionResult[];
  requirements: RequirementResult[];
  model: string;
  truncated: boolean;
}

export interface RankedCandidate extends ScoredCandidate {
  rank: number;
  /** Weighted mean of normalised dimensions, 0..100. */
  composite: number;
  /** Must-have requirements the candidate fell below the threshold on. */
  failedMustHaves: RequirementResult[];
  gatePassed: boolean;
  /** Mean dimension confidence below the floor, or truncated text — a chip only, never affects ordering. */
  needsReview: boolean;
  meanConfidence: number;
}

export interface RankOptions {
  weights?: Partial<Weights>;
  /** noul() probability below this fails a must-have. */
  mustHaveThreshold?: number;
  /** Mean dimension confidence below this flags the candidate for human review. */
  confidenceFloor?: number;
}

export const DEFAULT_MUST_HAVE_THRESHOLD = 0.5;
export const DEFAULT_CONFIDENCE_FLOOR = 0.6;

export function compositeScore(dimensions: DimensionResult[], weights: Weights): number {
  let weighted = 0;
  let total = 0;
  for (const d of dimensions) {
    const w = weights[d.key] ?? 0;
    if (w <= 0) continue;
    weighted += w * d.normalized;
    total += w;
  }
  return total === 0 ? 0 : Number(((weighted / total) * 100).toFixed(1));
}

/**
 * Ordering lives here, not in the model. Jev supplies per-dimension judgement;
 * composition, thresholds and the gate are ours.
 *
 * Gated candidates are ranked and returned too — they are separated by
 * `gatePassed`, never dropped, because a bad extraction or unusual phrasing
 * will sometimes trip the gate on a good candidate and that has to be visible.
 */
export function rankCandidates(
  candidates: ScoredCandidate[],
  options: RankOptions = {},
): { passed: RankedCandidate[]; filtered: RankedCandidate[] } {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights } as Weights;
  const mustHaveThreshold = options.mustHaveThreshold ?? DEFAULT_MUST_HAVE_THRESHOLD;
  const confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;

  const scored = candidates.map((c) => {
    const failedMustHaves = c.requirements.filter(
      (r) => r.mustHave && r.probability < mustHaveThreshold,
    );
    const confidences = c.dimensions.map((d) => d.confidence);
    const meanConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    return {
      ...c,
      rank: 0,
      composite: compositeScore(c.dimensions, weights),
      failedMustHaves,
      gatePassed: failedMustHaves.length === 0,
      // Mean, not "any dimension": with six dimensions, one mid-range value is
      // normal and flagging on it marks every candidate for review.
      needsReview: c.truncated || meanConfidence < confidenceFloor,
      meanConfidence,
    } satisfies RankedCandidate;
  });

  const byScore = (a: RankedCandidate, b: RankedCandidate) =>
    b.composite - a.composite || a.name.localeCompare(b.name);

  const passed = scored.filter((c) => c.gatePassed).sort(byScore);
  const filtered = scored.filter((c) => !c.gatePassed).sort(byScore);

  passed.forEach((c, i) => (c.rank = i + 1));
  filtered.forEach((c, i) => (c.rank = i + 1));

  return { passed, filtered };
}

export function normaliseWeights(input: Partial<Weights> | null | undefined): Weights {
  const out = { ...DEFAULT_WEIGHTS };
  if (!input) return out;
  for (const key of DIMENSION_KEYS) {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}
