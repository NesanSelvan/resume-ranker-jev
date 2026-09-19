import {
  type Questions,
  type ScoreCriteria,
  TypeSafeClient,
  noul,
  score,
} from "@typesafe-ai/sdk";
import { DIMENSIONS, LEVELS } from "@/lib/dimensions";
import {
  STATE_CHAR_BUDGET,
  type DimensionResult,
  type RequirementResult,
  type ScoreInput,
  type ScoreResult,
  type Scorer,
} from "./types";

const dimKey = (key: string) => `dim_${key}`;
const reqKey = (idx: number) => `req_${idx}`;

/**
 * One systemOne() call per resume. Every dimension and every requirement is a
 * separate question evaluated in parallel against the same state, so adding
 * requirements costs tokens but barely costs latency.
 */
export class JevScorer implements Scorer {
  readonly id = "jev";
  readonly #client: TypeSafeClient;

  constructor(client?: TypeSafeClient) {
    this.#client = client ?? new TypeSafeClient();
  }

  async score(input: ScoreInput, signal?: AbortSignal): Promise<ScoreResult> {
    const truncated = input.resumeText.length > STATE_CHAR_BUDGET;
    const resume = truncated ? input.resumeText.slice(0, STATE_CHAR_BUDGET) : input.resumeText;

    const questions: Questions = {};
    for (const d of DIMENSIONS) {
      questions[dimKey(d.key)] = score(d.instructions, d.criteria as unknown as ScoreCriteria);
    }
    for (const r of input.requirements) {
      questions[reqKey(r.idx)] = noul(
        `Does this candidate satisfy the following requirement: ${r.text}`,
        {
          true: "The resume provides evidence the candidate satisfies it.",
          false: "The resume provides no evidence, or contradicts it.",
        },
      );
    }

    const startedAt = performance.now();
    const result = await this.#client.systemOne(
      {
        state: {
          job_requirements: input.requirements.map((r) => r.text),
          resume,
        },
        questions,
      },
      { signal },
    );
    const latencyMs = Math.round(performance.now() - startedAt);

    const dimensions: DimensionResult[] = DIMENSIONS.map((d) => {
      const answer = result.answers[dimKey(d.key)];
      if (!answer || answer.type !== "score") {
        throw new Error(`Jev returned no score answer for dimension "${d.key}"`);
      }
      return {
        key: d.key,
        raw: answer.score,
        normalized: clamp01(answer.score / (LEVELS - 1)),
        confidence: answer.confidence,
        probabilities: { ...answer.probabilities } as Record<string, number>,
      };
    });

    const requirements: RequirementResult[] = input.requirements.map((r) => {
      const answer = result.answers[reqKey(r.idx)];
      if (!answer || answer.type !== "noul") {
        throw new Error(`Jev returned no noul answer for requirement ${r.idx}`);
      }
      return { idx: r.idx, text: r.text, mustHave: r.mustHave, probability: answer.noul };
    });

    return {
      dimensions,
      requirements,
      model: result.model,
      inputTokens: result.usage.input_tokens,
      latencyMs,
      truncated,
    };
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
