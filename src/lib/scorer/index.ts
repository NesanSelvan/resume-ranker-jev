import { CloudflareJevScorer } from "./cloudflare";
import { JevScorer } from "./jev";
import { MockScorer } from "./mock";
import type { Scorer } from "./types";

export * from "./types";
export { CloudflareJevScorer, JevScorer, MockScorer };

const hasCloudflare = () =>
  Boolean(process.env.CF_ACCOUNT_ID?.trim() && process.env.CF_TOKEN?.trim());
const hasTypeSafe = () => Boolean(process.env.TYPESAFE_API_KEY?.trim());

/**
 * There are two live routes to the same model:
 *   Cloudflare Workers AI  — CF_ACCOUNT_ID + CF_TOKEN, model `typesafe/jev`
 *   TypeSafe direct        — TYPESAFE_API_KEY, api.typesafe.ai
 *
 * Cloudflare wins when both are present, because that is the account we
 * actually hold credentials for.
 *
 * SCORER=mock forces the deterministic mock; SCORER=jev demands a real one and
 * throws rather than silently scoring with heuristics; anything else picks the
 * best available and falls back to the mock.
 */
export function getScorer(): Scorer {
  const mode = process.env.SCORER ?? "auto";

  if (mode === "mock") return new MockScorer();

  if (mode === "jev") {
    if (hasCloudflare()) return new CloudflareJevScorer();
    if (hasTypeSafe()) return new JevScorer();
    throw new Error(
      "SCORER=jev but no credentials found. Set CF_ACCOUNT_ID + CF_TOKEN, or TYPESAFE_API_KEY.",
    );
  }

  if (hasCloudflare()) return new CloudflareJevScorer();
  if (hasTypeSafe()) return new JevScorer();
  return new MockScorer();
}
