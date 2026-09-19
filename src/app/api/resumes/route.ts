import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { resumes } from "@/db/schema";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";

/** Enough extracted text to fill a thumbnail; the full text is never shipped to
 *  the client, which would be ~60x a few KB for a list that only shows a corner. */
const PREVIEW_CHARS = 420;

export async function GET() {
  const rows = db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      name: resumes.name,
      charCount: resumes.charCount,
      extractionStatus: resumes.extractionStatus,
      extractionError: resumes.extractionError,
      text: resumes.text,
    })
    .from(resumes)
    .orderBy(desc(resumes.id))
    .all();

  return NextResponse.json({
    resumes: rows.map(({ text, ...row }) => ({
      ...row,
      preview: text.slice(0, PREVIEW_CHARS),
    })),
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files supplied" }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push(await ingestFile(file.name, buffer));
  }
  return NextResponse.json({ results });
}
