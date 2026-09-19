import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAdversarialCases, buildResume, type ResumeDoc } from "./fixtures/build";
import { renderDocx, renderPdf, type Layout } from "./fixtures/render";
import { ROLE_REQUIREMENTS, ROLE_TITLE, type GroundTruth, type Tier } from "./fixtures/role";

const OUT = resolve(process.cwd(), "data/fixtures");

/** 10 strong / 20 borderline / 20 weak / 10 adversarial = 60. */
const COUNTS: Record<Exclude<Tier, "adversarial">, number> = { strong: 10, borderline: 20, weak: 20 };

/** Rotated so every tier is represented in every layout — a layout bug cannot masquerade as a tier signal. */
const LAYOUTS: Layout[] = ["single", "single", "two-column", "table", "docx", "docx-table"];

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function emit(doc: ResumeDoc, layout: Layout, slug: string, rawText?: string): Promise<string> {
  const isDocx = layout === "docx" || layout === "docx-table";
  const file = `${slug}.${isDocx ? "docx" : "pdf"}`;
  const bytes = isDocx ? await renderDocx(doc, layout) : await renderPdf(doc, layout, rawText);
  await writeFile(resolve(OUT, file), bytes);
  return file;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const truth: GroundTruth[] = [];
  let seed = 1;
  let layoutIdx = 0;

  for (const [tier, count] of Object.entries(COUNTS) as [Exclude<Tier, "adversarial">, number][]) {
    for (let i = 0; i < count; i += 1) {
      const doc = buildResume(tier, seed++);
      const layout = LAYOUTS[layoutIdx++ % LAYOUTS.length]!;
      const slug = `${tier}-${String(i + 1).padStart(2, "0")}-${slugify(doc.name)}`;
      truth.push({ file: await emit(doc, layout, slug), name: doc.name, tier });
    }
  }

  for (const c of buildAdversarialCases()) {
    truth.push({
      file: await emit(c.doc, c.layout, c.slug, c.rawText),
      name: c.doc.name,
      tier: "adversarial",
      probe: c.probe,
      expectGateFail: c.expectGateFail,
      expectExtractionFail: c.expectExtractionFail,
    });
  }

  await writeFile(resolve(OUT, "requirements.txt"), ROLE_REQUIREMENTS);
  await writeFile(
    resolve(OUT, "ground-truth.json"),
    `${JSON.stringify({ role: ROLE_TITLE, generatedAt: new Date().toISOString().slice(0, 10), candidates: truth }, null, 2)}\n`,
  );

  const byTier = truth.reduce<Record<string, number>>((a, t) => ({ ...a, [t.tier]: (a[t.tier] ?? 0) + 1 }), {});
  console.log(`Wrote ${truth.length} resumes to data/fixtures`);
  console.table(byTier);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
