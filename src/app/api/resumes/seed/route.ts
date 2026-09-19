import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";

const FIXTURES = resolve(process.cwd(), "data/fixtures");

/**
 * Loads the synthetic corpus from data/fixtures. Development convenience only —
 * these are generated resumes with known ground-truth tiers, never real people.
 */
export async function POST() {
  let files: string[];
  try {
    files = (await readdir(FIXTURES)).filter((f) => /\.(pdf|docx)$/i.test(f)).sort();
  } catch {
    return NextResponse.json(
      { error: "No data/fixtures directory. Run `pnpm fixtures` first." },
      { status: 404 },
    );
  }

  const results = [];
  for (const file of files) {
    results.push(await ingestFile(file, await readFile(resolve(FIXTURES, file))));
  }

  let requirementsText = "";
  try {
    requirementsText = await readFile(resolve(FIXTURES, "requirements.txt"), "utf8");
  } catch {
    /* requirements.txt is optional */
  }

  return NextResponse.json({ results, requirementsText });
}
