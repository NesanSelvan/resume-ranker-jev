import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resumes } from "@/db/schema";

export const runtime = "nodejs";

/**
 * The full record behind one resume, for the preview panel. The original bytes
 * are served separately by ./file; this returns the extracted text, which is
 * what the scorer actually sees and the only preview a DOCX can offer inline.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      name: resumes.name,
      mimeType: resumes.mimeType,
      charCount: resumes.charCount,
      extractionStatus: resumes.extractionStatus,
      extractionError: resumes.extractionError,
      text: resumes.text,
    })
    .from(resumes)
    .where(eq(resumes.id, Number(id)))
    .get();

  if (!row) return NextResponse.json({ error: "No such resume" }, { status: 404 });
  return NextResponse.json({ resume: row });
}
