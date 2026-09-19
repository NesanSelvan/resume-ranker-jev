import { DIMENSIONS, LEVELS } from "@/lib/dimensions";
import {
  STATE_CHAR_BUDGET,
  type DimensionResult,
  type RequirementResult,
  type ScoreInput,
  type ScoreResult,
  type Scorer,
} from "./types";

/**
 * Jev through Cloudflare Workers AI, which carries it as the model
 * `typesafe/jev`. This is a separate path from JevScorer: that one talks to
 * api.typesafe.ai with a TypeSafe key, this one talks to Cloudflare with a
 * Cloudflare account id + token, and the request is wrapped differently
 * (`{ model, input: { state, questions } }` rather than a bare body).
 *
 * The answer shapes are identical, which is the whole point of a typed model —
 * the transport changed and the parsing did not.
 */

const ENDPOINT = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;

const MODEL = "typesafe/jev";

interface NoulAnswer {
  type: "noul";
  noul: number;
}
interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<string, unknown>;
  probabilities: Record<string, number>;
}
type Answer = NoulAnswer | ScoreAnswer | { type: string };

interface JevBody {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * The live response is double-nested and the Cloudflare model docs show neither
 * wrapper. Verified against the real endpoint:
 *
 *   { success, errors, messages,
 *     result: { state: "Completed", gatewayMetadata: {...},
 *               result: { model, answers, usage } } }
 *
 * So the Jev body sits at `result.result`. The union below also accepts the
 * single-wrapped and bare forms, since the docs claim those and a future
 * gateway change could produce them.
 */
interface RunEnvelope {
  state?: string;
  result?: JevBody;
  gatewayMetadata?: Record<string, unknown>;
}

interface MaybeWrapped {
  result?: RunEnvelope | JevBody;
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  model?: string;
  answers?: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const hasAnswers = (v: unknown): v is JevBody =>
  typeof v === "object" && v !== null && "answers" in v && Boolean((v as JevBody).answers);

const dimKey = (key: string) => `dim_${key}`;
const reqKey = (idx: number) => `req_${idx}`;

export interface CloudflareJevOptions {
  accountId?: string;
  token?: string;
  /** Per-attempt timeout. Jev answers in 70-500ms; this is generous. */
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class CloudflareJevScorer implements Scorer {
  readonly id = "jev-cloudflare";
  readonly #accountId: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(options: CloudflareJevOptions = {}) {
    const accountId = options.accountId ?? process.env.CF_ACCOUNT_ID;
    const token = options.token ?? process.env.CF_TOKEN;
    if (!accountId) throw new Error("CF_ACCOUNT_ID is not set");
    if (!token) throw new Error("CF_TOKEN is not set");
    this.#accountId = accountId;
    this.#token = token;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async score(input: ScoreInput, signal?: AbortSignal): Promise<ScoreResult> {
    const truncated = input.resumeText.length > STATE_CHAR_BUDGET;
    const resume = truncated ? input.resumeText.slice(0, STATE_CHAR_BUDGET) : input.resumeText;

    const questions: Record<string, unknown> = {};
    for (const d of DIMENSIONS) {
      questions[dimKey(d.key)] = {
        type: "score",
        instructions: d.instructions,
        criteria: [...d.criteria],
      };
    }
    for (const r of input.requirements) {
      questions[reqKey(r.idx)] = {
        type: "noul",
        instructions: `Does this candidate satisfy the following requirement: ${r.text}`,
        criteria: {
          true: "The resume provides evidence the candidate satisfies it.",
          false: "The resume provides no evidence, or contradicts it.",
        },
      };
    }

    const body = {
      model: MODEL,
      input: {
        state: {
          job_requirements: input.requirements.map((r) => r.text),
          resume,
        },
        questions,
      },
    };

    const startedAt = performance.now();
    const payload = await this.#post(body, signal);
    const latencyMs = Math.round(performance.now() - startedAt);

    const answers = payload.answers;
    const model = payload.model ?? MODEL;

    const dimensions: DimensionResult[] = DIMENSIONS.map((d) => {
      const answer = answers[dimKey(d.key)];
      if (!answer || answer.type !== "score") {
        throw new Error(`Jev returned no score answer for dimension "${d.key}"`);
      }
      const a = answer as ScoreAnswer;
      return {
        key: d.key,
        raw: a.score,
        normalized: clamp01(a.score / (LEVELS - 1)),
        confidence: a.confidence,
        probabilities: { ...a.probabilities },
      };
    });

    const requirements: RequirementResult[] = input.requirements.map((r) => {
      const answer = answers[reqKey(r.idx)];
      if (!answer || answer.type !== "noul") {
        throw new Error(`Jev returned no noul answer for requirement ${r.idx}`);
      }
      return {
        idx: r.idx,
        text: r.text,
        mustHave: r.mustHave,
        probability: (answer as NoulAnswer).noul,
      };
    });

    return {
      dimensions,
      requirements,
      model,
      inputTokens: payload.usage?.input_tokens ?? 0,
      latencyMs,
      truncated,
    };
  }

  /** One request with retries on 408/429/5xx, honouring Retry-After. */
  async #post(body: unknown, signal?: AbortSignal): Promise<JevBody> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      if (signal?.aborted) throw new Error("aborted");

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const res = await this.#fetch(ENDPOINT(this.#accountId), {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.#token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
          const error = new Error(`Cloudflare returned ${res.status}: ${text.slice(0, 300)}`);
          if (!retryable || attempt === this.#maxRetries) throw error;
          lastError = error;
          await sleep(retryAfterMs(res) ?? backoff(attempt), signal);
          continue;
        }

        const json = (await res.json()) as MaybeWrapped;

        // Errors can arrive inside a 200 with success:false.
        if (json.success === false) {
          throw new Error(
            `Cloudflare reported failure: ${json.errors?.map((e) => e.message).join("; ") ?? "unknown"}`,
          );
        }

        // A queued/failed run is reported in-band rather than as an HTTP error.
        const envelope = json.result as RunEnvelope | undefined;
        if (envelope?.state && envelope.state !== "Completed") {
          throw new Error(`Cloudflare run state was "${envelope.state}", not Completed`);
        }

        const inner = [envelope?.result, json.result, json].find(hasAnswers);
        if (!inner) {
          throw new Error(
            `Cloudflare returned a body without an answers object (keys: ${Object.keys(json).join(", ")})`,
          );
        }
        return inner;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        // A caller-driven abort is final; a timeout is worth one more try.
        if (signal?.aborted) throw error;
        if (attempt === this.#maxRetries) throw error;
        lastError = error;
        await sleep(backoff(attempt), signal);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError ?? new Error("Cloudflare request failed");
  }
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 60_000) : undefined;
}

function backoff(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 5_000);
  return base * (0.75 + Math.random() * 0.25);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
