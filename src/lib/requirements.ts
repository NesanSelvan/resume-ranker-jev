export interface ParsedRequirement {
  idx: number;
  text: string;
  /** Gate: a candidate below the noul threshold here is filtered, not deleted. */
  mustHave: boolean;
}

const BULLET = /^[\s]*[-–—*•·]+\s*/;
const MUST_PREFIX = /^\s*!/;
const MUST_WORD = /\b(must|required|mandatory|non-negotiable)\b/i;

/**
 * One requirement per line. A line is a must-have if it is prefixed with "!"
 * or contains a word like "must"/"required". Bullets are stripped so pasting
 * a job description straight in works.
 */
export function parseRequirements(input: string): ParsedRequirement[] {
  const out: ParsedRequirement[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const explicitMust = MUST_PREFIX.test(raw);
    const text = raw.replace(MUST_PREFIX, "").replace(BULLET, "").trim();
    if (text.length < 3) continue;
    if (text.startsWith("#")) continue;
    out.push({ idx: out.length, text, mustHave: explicitMust || MUST_WORD.test(text) });
  }
  return out;
}
