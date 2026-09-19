import { DIMENSIONS, LEVELS, type DimensionKey } from "@/lib/dimensions";
import {
  type DimensionResult,
  type RequirementResult,
  type ScoreInput,
  type ScoreResult,
  type Scorer,
} from "./types";

/**
 * Deterministic stand-in for Jev, used until an API key exists and afterwards
 * for offline tests.
 *
 * It is lexical, not intelligent: requirement satisfaction comes from content
 * word overlap, dimensions from surface heuristics. That is deliberate — a
 * hash-random mock would make the eval meaningless, whereas overlap correlates
 * with genuine resume content, so the whole pipeline (gating, weighting,
 * ranking, precision@k) can be exercised and debugged end to end.
 *
 * It is NOT a quality benchmark. Numbers move when the real scorer lands.
 */
export class MockScorer implements Scorer {
  readonly id = "mock";

  /**
   * MOCK_DELAY_MS simulates Jev's 70-500ms round trip. Without it the mock
   * finishes a 60-resume batch in under a second, which makes the progress bar
   * and the End-run path impossible to exercise.
   */
  readonly #delayMs = Number(process.env.MOCK_DELAY_MS ?? 0);

  async score(input: ScoreInput, signal?: AbortSignal): Promise<ScoreResult> {
    const startedAt = performance.now();
    if (this.#delayMs > 0) await sleep(this.#delayMs, signal);
    const text = input.resumeText;
    const lower = text.toLowerCase();
    const words = new Set(tokenize(lower));

    const requirements: RequirementResult[] = input.requirements.map((r) => {
      const coverage = requirementCoverage(r.text, words, lower);
      const jitter = (rand(`${r.text}::${text.slice(0, 200)}`) - 0.5) * 0.04;
      return {
        idx: r.idx,
        text: r.text,
        mustHave: r.mustHave,
        probability: clamp01(0.03 + 0.94 * coverage ** 0.9 + jitter),
      };
    });

    const meanCoverage = requirements.length
      ? requirements.reduce((a, r) => a + r.probability, 0) / requirements.length
      : 0.5;

    const raws: Record<DimensionKey, number> = {
      technical_depth: technicalDepth(lower),
      seniority: seniority(lower),
      role_fit: meanCoverage * (LEVELS - 1),
      tenure_stability: tenureStability(text),
      project_work: projectWork(text),
      impact_evidence: impactEvidence(text),
      communication: communication(text),
    };

    const dimensions: DimensionResult[] = DIMENSIONS.map((d) => {
      const jitter = (rand(`${d.key}::${text.slice(0, 200)}`) - 0.5) * 0.15;
      const raw = clamp(raws[d.key] + jitter, 0, LEVELS - 1);
      return {
        key: d.key,
        raw,
        normalized: clamp01(raw / (LEVELS - 1)),
        confidence: 0.55 + 0.4 * Math.abs(raw / (LEVELS - 1) - 0.5) * 2,
        probabilities: distributionAround(raw),
      };
    });

    return {
      dimensions,
      requirements,
      model: "mock-lexical-1",
      inputTokens: Math.round(text.length / 4),
      latencyMs: Math.round(performance.now() - startedAt),
      truncated: false,
    };
  }
}

/* ---------- requirement matching ---------- */

const STOPWORDS = new Set([
  "the","and","for","with","you","your","our","are","have","has","must","should","able",
  "will","from","that","this","they","them","their","who","can","not","but","its","been",
  "experience","years","year","strong","good","great","excellent","working","work","plus",
  "required","requirement","requirements","ideally","preferably","knowledge","understanding",
  "ability","skills","skill","using","use","used","including","etc","role","team","teams",
  // Filler that appears in almost every job requirement. Left in, it sinks a
  // requirement whose actual key term ("Kubernetes") the resume clearly satisfies.
  "hands","hands-on","production","professional","operating","designing","design",
  "comparable","equivalent","tooling","across","scale","other","engineer","engineers",
  "engineering","backend","frontend","fullstack","level","senior","junior","mid",
]);

function tokenize(s: string): string[] {
  return s.split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 2);
}

function contentWords(s: string): string[] {
  return tokenize(s.toLowerCase()).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * How well a requirement is evidenced in the resume.
 *
 * Blends the single strongest term match with the weighted mean across all
 * terms. A plain mean is wrong here: "Event streaming with Kafka or an
 * equivalent broker" is satisfied by the word "Kafka" alone, and averaging that
 * against "streaming" and "broker" would score a genuine match at 0.33.
 * Technical terms carry full weight; ordinary prose carries less.
 */
function requirementCoverage(requirement: string, words: Set<string>, lower: string): number {
  const needed = contentWords(requirement);
  if (needed.length === 0) return 0.5;

  let weightedHits = 0;
  let totalWeight = 0;
  let best = 0;
  for (const w of needed) {
    const weight = TECH_TOKENS.includes(w) || /\d/.test(w) ? 1 : w.length >= 8 ? 0.8 : 0.45;
    let hit = 0;
    if (words.has(w) || lower.includes(w)) hit = 1;
    else if (w.length > 5 && lower.includes(w.slice(0, Math.ceil(w.length * 0.7)))) hit = 0.6;
    weightedHits += hit * weight;
    totalWeight += weight;
    best = Math.max(best, hit * (weight >= 0.8 ? 1 : 0.55));
  }
  const mean = totalWeight === 0 ? 0 : weightedHits / totalWeight;
  let coverage = 0.6 * best + 0.4 * mean;

  const demanded = requirement.match(/(\d+)\s*\+?\s*(?:y\b|yr|yrs|year)/i);
  if (demanded?.[1]) {
    const need = Number(demanded[1]);
    const have = maxYearsClaimed(lower);
    coverage *= have >= need ? 1 : Math.max(0.25, have / Math.max(need, 1));
  }
  return clamp01(coverage);
}

function maxYearsClaimed(lower: string): number {
  let max = 0;
  for (const m of lower.matchAll(/(\d{1,2})\s*\+?\s*(?:y\b|yr|yrs|years?)\b/g)) {
    max = Math.max(max, Number(m[1]));
  }
  const spans = employmentSpansMonths(lower);
  if (spans.length) max = Math.max(max, Math.round(spans.reduce((a, b) => a + b, 0) / 12));
  return max;
}

/* ---------- dimension heuristics ---------- */

const TECH_TOKENS = [
  "kubernetes","docker","terraform","postgres","postgresql","mysql","redis","kafka","grpc",
  "typescript","javascript","python","golang","rust","java","react","node","graphql","aws",
  "gcp","azure","microservices","distributed","ci/cd","observability","sre","api","sql",
  "elasticsearch","rabbitmq","spark","airflow","pytorch","tensorflow","linux","nginx",
];

function technicalDepth(lower: string): number {
  const variety = TECH_TOKENS.filter((t) => lower.includes(t)).length;
  const specifics = (lower.match(/\b\d+(?:\.\d+)?\s*(?:k|m|ms|qps|rps|tb|gb|%)\b/g) ?? []).length;
  return scaleTo(variety * 0.9 + specifics * 0.5, 0, 14);
}

const SENIORITY_MARKERS: Array<[RegExp, number]> = [
  [/\b(intern|internship|undergraduate|student)\b/, 0.3],
  [/\b(junior|associate|entry.level|graduate engineer)\b/, 1.1],
  [/\b(software engineer|developer|engineer ii)\b/, 2.0],
  [/\b(senior|sr\.?\s|lead|tech lead)\b/, 3.1],
  [/\b(staff|principal|architect|head of|director|distinguished)\b/, 4.0],
];

function seniority(lower: string): number {
  let level = 0.8;
  for (const [re, value] of SENIORITY_MARKERS) if (re.test(lower)) level = Math.max(level, value);
  const years = maxYearsClaimed(lower);
  return clamp(Math.max(level, scaleTo(years, 0, 12)), 0, LEVELS - 1);
}

/** Parse "2019 - 2023" / "Jan 2019 – Present" style spans into months. */
function employmentSpansMonths(text: string): number[] {
  const spans: number[] = [];
  const now = new Date().getFullYear();
  const re = /(\b(?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)/gi;
  for (const m of text.matchAll(re)) {
    const from = Number(m[1]);
    const toRaw = (m[2] ?? "").toLowerCase();
    const to = /^\d{4}$/.test(toRaw) ? Number(toRaw) : now;
    if (to >= from && to - from <= 50) spans.push(Math.max(1, (to - from) * 12));
  }
  return spans;
}

function tenureStability(text: string): number {
  const spans = employmentSpansMonths(text);
  if (spans.length === 0) return 2;
  const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
  const shortStints = spans.filter((s) => s < 15).length / spans.length;
  return clamp(scaleTo(avg, 8, 48) - shortStints * 1.6, 0, LEVELS - 1);
}

/** Verbs that describe building a thing, as opposed to moving a metric. */
const BUILD_VERB =
  /\b(built|designed|architected|launched|shipped|created|developed|implemented|rebuilt|migrated|rolled out|prototyped)\b/i;

/** A named system reads as a real project; "worked on the backend" does not. */
const NAMED_SYSTEM =
  /\b(service|platform|pipeline|api|system|module|library|sdk|dashboard|engine|framework|tool)\b/i;

/**
 * How much concrete project work the resume evidences. Counts lines that both
 * describe building something and name what was built; ownership language
 * ("owned", "end to end", "led") lifts it further, and a portfolio link adds a
 * little. Tutorial-level work is penalised so a bootcamp CV cannot look like a
 * delivery record.
 */
function projectWork(text: string): number {
  const lines = text.split(/\r?\n/);
  const built = lines.filter((l) => BUILD_VERB.test(l) && NAMED_SYSTEM.test(l)).length;
  const mentionsOnly = lines.filter((l) => BUILD_VERB.test(l)).length - built;
  const lower = text.toLowerCase();
  const ownership = /\b(owned|end to end|end-to-end|sole (author|engineer)|from scratch|led the)\b/.test(lower)
    ? 1
    : 0;
  const portfolio = /\b(github\.com|gitlab\.com|portfolio|personal project|side project)\b/.test(lower) ? 0.5 : 0;
  const tutorial = /\b(bootcamp|coursework|tutorial|clone of|toy project)\b/.test(lower) ? 1.2 : 0;
  return clamp(
    scaleTo(built * 1.3 + mentionsOnly * 0.4 + ownership + portfolio, 0, 6) - tutorial,
    0,
    LEVELS - 1,
  );
}

const IMPACT_VERB = /\b(reduced|increased|improved|cut|saved|grew|scaled|shipped|drove|led|migrated|eliminated)\b/i;

function impactEvidence(text: string): number {
  const lines = text.split(/\r?\n/);
  const quantified = lines.filter(
    (l) => IMPACT_VERB.test(l) && /\b\d+(?:\.\d+)?\s*(?:%|x|k|m|ms|hours?|days?)\b/i.test(l),
  ).length;
  const claimed = lines.filter((l) => IMPACT_VERB.test(l)).length;
  return clamp(scaleTo(quantified * 1.4 + claimed * 0.3, 0, 8), 0, LEVELS - 1);
}

const BUZZWORDS = [
  "synergy","rockstar","ninja","guru","passionate","dynamic","self-starter","go-getter",
  "thought leader","results-driven","team player","detail-oriented","hard worker",
];

function communication(text: string): number {
  const words = tokenize(text.toLowerCase());
  if (words.length < 40) return 0.5;
  const lower = text.toLowerCase();
  const buzz = BUZZWORDS.filter((b) => lower.includes(b)).length;
  const bulletLines = text.split(/\r?\n/).filter((l) => /^\s*[-–—*•]/.test(l)).length;
  const sentences = text.split(/[.!?]\s/).length || 1;
  const avgSentence = words.length / sentences;
  const structure = scaleTo(bulletLines, 0, 18);
  const verbosity = avgSentence > 32 ? -1 : avgSentence < 6 ? -0.4 : 0.4;
  return clamp(1.6 + structure * 0.55 + verbosity - buzz * 0.55, 0, LEVELS - 1);
}

/* ---------- helpers ---------- */

function scaleTo(value: number, min: number, max: number): number {
  return clamp01((value - min) / (max - min)) * (LEVELS - 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Bell-ish distribution peaked at the expected score, normalised to sum 1. */
function distributionAround(raw: number): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (let i = 0; i < LEVELS; i += 1) {
    const p = Math.exp(-((i - raw) ** 2) / 0.8) + 0.01;
    out[String(i)] = p;
    total += p;
  }
  for (const k of Object.keys(out)) out[k] = Number((out[k]! / total).toFixed(4));
  return out;
}

/** FNV-1a seeded mulberry32 — stable across runs and processes. */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}


/** Resolves after ms, or rejects immediately if the run is ended. */
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
