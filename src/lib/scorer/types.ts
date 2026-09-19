import type { DimensionKey } from "@/lib/dimensions";
import type { ParsedRequirement } from "@/lib/requirements";

export interface ScoreInput {
  resumeText: string;
  requirements: ParsedRequirement[];
}

export interface DimensionResult {
  key: DimensionKey;
  /** Expected score on the 0..LEVELS-1 rubric; may fall between levels. */
  raw: number;
  /** raw mapped to 0..1 for weighting. */
  normalized: number;
  /** Reported confidence in the score, 0..1. */
  confidence: number;
  /** Full distribution, kept for audit and recalibration. */
  probabilities: Record<string, number>;
}

export interface RequirementResult {
  idx: number;
  text: string;
  mustHave: boolean;
  /** noul() probability that the candidate satisfies this requirement. */
  probability: number;
}

export interface ScoreResult {
  dimensions: DimensionResult[];
  requirements: RequirementResult[];
  /** Resolved versioned model id as returned by the API, never the alias sent. */
  model: string;
  inputTokens: number;
  latencyMs: number;
  /** True when resume text was truncated to fit the state budget. */
  truncated: boolean;
}

export interface Scorer {
  readonly id: string;
  score(input: ScoreInput, signal?: AbortSignal): Promise<ScoreResult>;
}

/**
 * Jev allows 32k tokens of state. A resume is normally 3-8k characters, so this
 * ceiling only ever trips on a pathological file; when it does we flag it rather
 * than silently scoring a truncated candidate.
 */
export const STATE_CHAR_BUDGET = 60_000;
