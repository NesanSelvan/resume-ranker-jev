import pLimit from "p-limit";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { extractResume } from "@/lib/extract";
import { rankCandidates, type ScoredCandidate } from "@/lib/ranking";
import { parseRequirements } from "@/lib/requirements";
import { getScorer } from "@/lib/scorer";
import type { GroundTruth, Tier } from "./fixtures/role";

// Next loads .env itself; a bare tsx script does not.
try {
  process.loadEnvFile();
} catch {
  /* no .env — the factory falls back to the mock */
}

const FIXTURES = resolve(process.cwd(), "data/fixtures");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);

interface Row extends ScoredCandidate {
  tier: Tier;
  probe?: string;
  expectGateFail?: boolean;
}

async function main() {
  const truthFile = JSON.parse(await readFile(resolve(FIXTURES, "ground-truth.json"), "utf8")) as {
    role: string;
    candidates: GroundTruth[];
  };
  const truth = new Map(truthFile.candidates.map((c) => [c.file, c]));
  const requirements = parseRequirements(await readFile(resolve(FIXTURES, "requirements.txt"), "utf8"));
  const scorer = getScorer();

  console.log(`Role: ${truthFile.role}`);
  console.log(
    `Scorer: ${scorer.id}   Requirements: ${requirements.length} (${requirements.filter((r) => r.mustHave).length} must-have)\n`,
  );

  const files = (await readdir(FIXTURES)).filter((f) => /\.(pdf|docx)$/i.test(f)).sort();
  const limit = pLimit(CONCURRENCY);
  const extractionFailures: Array<{ file: string; expected: boolean; error?: string }> = [];

  const started = Date.now();
  const rows = (
    await Promise.all(
      files.map((file, i) =>
        limit(async (): Promise<Row | null> => {
          const meta = truth.get(file);
          const buffer = await readFile(resolve(FIXTURES, file));
          const extracted = await extractResume(buffer, file);

          if (extracted.status === "failed") {
            extractionFailures.push({
              file,
              expected: Boolean(meta?.expectExtractionFail),
              error: extracted.error,
            });
            return null;
          }

          const result = await scorer.score({ resumeText: extracted.text, requirements });
          return {
            resumeId: i,
            name: extracted.name,
            fileName: file,
            dimensions: result.dimensions,
            requirements: result.requirements,
            model: result.model,
            truncated: result.truncated,
            tier: meta?.tier ?? "borderline",
            probe: meta?.probe,
            expectGateFail: meta?.expectGateFail,
          };
        }),
      ),
    )
  ).filter((r): r is Row => r !== null);
  const elapsed = Date.now() - started;

  const { passed, filtered } = rankCandidates(rows);
  const byFile = new Map(rows.map((r) => [r.fileName, r]));
  const tierOf = (fileName: string) => byFile.get(fileName)?.tier ?? "?";

  console.log(
    `Scored ${rows.length}/${files.length} in ${elapsed}ms (${Math.round(elapsed / Math.max(rows.length, 1))}ms/resume)\n`,
  );

  /* --- extraction --- */
  console.log("EXTRACTION");
  if (extractionFailures.length === 0) console.log("  no failures");
  for (const f of extractionFailures) {
    console.log(`  ${f.expected ? "PASS (expected)" : "UNEXPECTED"}  ${f.file}`);
    if (!f.expected) console.log(`     ${f.error}`);
  }
  const missedExtractionProbe = truthFile.candidates.filter(
    (c) => c.expectExtractionFail && !extractionFailures.some((f) => f.file === c.file),
  );
  for (const m of missedExtractionProbe) {
    console.log(`  MISSED    ${m.file} was expected to fail extraction but parsed`);
  }

  /* --- ranking --- */
  console.log("\nTOP 12 (gate passed)");
  console.log("  #   score  conf   tier         name");
  for (const c of passed.slice(0, 12)) {
    console.log(
      `  ${String(c.rank).padStart(2)}  ${c.composite.toFixed(1).padStart(5)}  ${c.meanConfidence.toFixed(2)}  ` +
        `${tierOf(c.fileName).padEnd(11)}  ${c.name}${c.needsReview ? "  [review]" : ""}`,
    );
  }

  const topN = 10;
  const top = passed.slice(0, topN);
  const strongInTop = top.filter((c) => tierOf(c.fileName) === "strong").length;
  const totalStrong = rows.filter((r) => r.tier === "strong").length;

  /* --- tier separation --- */
  console.log("\nMEAN COMPOSITE BY TIER");
  const tiers: Tier[] = ["strong", "borderline", "weak", "adversarial"];
  const means = new Map<Tier, number>();
  for (const t of tiers) {
    const group = [...passed, ...filtered].filter((c) => tierOf(c.fileName) === t);
    if (!group.length) continue;
    const mean = group.reduce((a, c) => a + c.composite, 0) / group.length;
    means.set(t, mean);
    console.log(`  ${t.padEnd(12)} n=${String(group.length).padStart(2)}  mean=${mean.toFixed(1)}`);
  }

  /* --- gate --- */
  console.log("\nMUST-HAVE GATE (filtered, not deleted)");
  if (filtered.length === 0) console.log("  nobody filtered");
  for (const c of filtered) {
    const expected = byFile.get(c.fileName)?.expectGateFail;
    const mark = expected === true ? "  PASS (expected)" : "";
    console.log(
      `  ${tierOf(c.fileName).padEnd(11)} ${c.name.padEnd(22)} missing: ${c.failedMustHaves
        .map((r) => ellipsize(r.text, 34))
        .join("; ")}${mark}`,
    );
  }
  const missedGate = rows.filter((r) => r.expectGateFail && !filtered.some((f) => f.fileName === r.fileName));
  for (const m of missedGate) {
    console.log(`  MISSED    ${m.fileName} was expected to fail the gate but passed`);
  }

  /* --- adversarial --- */
  console.log("\nADVERSARIAL PROBES");
  for (const r of rows.filter((x) => x.tier === "adversarial")) {
    const ranked = [...passed, ...filtered].find((c) => c.fileName === r.fileName)!;
    const where = ranked.gatePassed ? `rank ${ranked.rank}/${passed.length}` : "filtered";
    console.log(`  ${ranked.composite.toFixed(1).padStart(5)}  ${where.padEnd(15)} ${r.probe}`);
  }

  /* --- verdict --- */
  const monotonic =
    (means.get("strong") ?? 0) > (means.get("borderline") ?? 0) &&
    (means.get("borderline") ?? 0) > (means.get("weak") ?? 0);
  console.log("\nVERDICT");
  console.log(
    `  precision@${topN}      ${strongInTop}/${Math.min(topN, totalStrong)} strong-tier candidates in the top ${topN}`,
  );
  console.log(`  tier monotonic   ${monotonic ? "yes" : "NO — strong/borderline/weak means are not ordered"}`);
  console.log(`  gate probes      ${missedGate.length === 0 ? "all fired as expected" : `${missedGate.length} missed`}`);
  console.log(`  extraction       ${extractionFailures.filter((f) => !f.expected).length} unexpected failures`);
}

const ellipsize = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
