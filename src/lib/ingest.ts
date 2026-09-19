import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resumes } from "@/db/schema";
import { extractResume } from "@/lib/extract";

const UPLOAD_DIR = resolve(process.cwd(), "data/uploads");

export interface IngestResult {
  fileName: string;
  status: "ok" | "failed" | "duplicate";
  resumeId?: number;
  error?: string;
  charCount?: number;
}

/**
 * Store the original, extract its text, and record both. Extraction failures are
 * persisted as rows with status "failed" so the file is visible in the UI rather
 * than vanishing between upload and results.
 */
export async function ingestFile(fileName: string, buffer: Buffer): Promise<IngestResult> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const existing = db.select().from(resumes).where(eq(resumes.sha256, sha256)).get();
  if (existing) return { fileName, status: "duplicate", resumeId: existing.id };

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = resolve(UPLOAD_DIR, `${sha256}${extname(fileName).toLowerCase()}`);
  await writeFile(filePath, buffer);

  const extracted = await extractResume(buffer, fileName);
  const row = db
    .insert(resumes)
    .values({
      fileName,
      filePath,
      mimeType: mimeFor(fileName),
      sha256,
      name: extracted.name,
      text: extracted.text,
      charCount: extracted.charCount,
      extractionStatus: extracted.status,
      extractionError: extracted.error ?? null,
    })
    .returning()
    .get();

  return {
    fileName,
    status: extracted.status,
    resumeId: row.id,
    error: extracted.error,
    charCount: extracted.charCount,
  };
}

function mimeFor(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".md":
      return "text/markdown";
    default:
      return "text/plain";
  }
}
