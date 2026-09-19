/**
 * One real call against whichever scorer the factory picks, so credentials and
 * the request contract are verified before a 59-resume batch is launched.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractResume } from "@/lib/extract";
import { parseRequirements } from "@/lib/requirements";
import { getScorer } from "@/lib/scorer";

try {
  process.loadEnvFile();
} catch {
  /* optional */
}

const FIXTURES = resolve(process.cwd(), "data/fixtures");
const FILE = process.argv[2] ?? "strong-10-rosa-zhang.pdf";

async function main() {
  const scorer = getScorer();
  console.log(`scorer: ${scorer.id}`);
  console.log(`CF_ACCOUNT_ID set: ${Boolean(process.env.CF_ACCOUNT_ID)}  CF_TOKEN set: ${Boolean(process.env.CF_TOKEN)}`);

  const requirements = parseRequirements(await readFile(resolve(FIXTURES, "requirements.txt"), "utf8"));
  const extracted = await extractResume(await readFile(resolve(FIXTURES, FILE)), FILE);
  if (extracted.status !== "ok") throw new Error(`extraction failed: ${extracted.error}`);

  console.log(`\nasking ${requirements.length} noul + 7 score questions about ${FILE} (${extracted.charCount} chars)…\n`);

  const result = await scorer.score({ resumeText: extracted.text, requirements });

  console.log(`model        ${result.model}`);
  console.log(`latency      ${result.latencyMs}ms`);
  console.log(`input tokens ${result.inputTokens}`);
  console.log(`cost         $${((result.inputTokens / 1_000_000) * 0.042).toFixed(6)} at $0.042/MTok\n`);

  console.log("DIMENSIONS");
  for (const d of result.dimensions) {
    console.log(`  ${d.key.padEnd(18)} ${d.raw.toFixed(2)} / 4   conf ${d.confidence.toFixed(2)}`);
  }
  console.log("\nREQUIREMENTS");
  for (const r of result.requirements) {
    const mark = r.probability >= 0.5 ? "yes" : "no ";
    console.log(`  ${mark}  ${r.probability.toFixed(2)}  ${r.mustHave ? "[must] " : "       "}${r.text}`);
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
