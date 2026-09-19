import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resumes } from "@/db/schema";

export const runtime = "nodejs";

/** Serves the original upload inline so the drawer can render the real PDF. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = db
    .select()
    .from(resumes)
    .where(eq(resumes.id, Number(id)))
    .get();

  if (!row) return NextResponse.json({ error: "No such resume" }, { status: 404 });

  // The stored path is absolute, so it breaks if the project is moved or
  // renamed. Uploads are content-addressed, so rebuild the path from the hash
  // and only fall back to the recorded one.
  const derived = resolve(process.cwd(), "data/uploads", `${row.sha256}${extname(row.fileName).toLowerCase()}`);

  try {
    const bytes = await readFile(derived).catch(() => readFile(row.filePath));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": row.mimeType,
        "content-disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Original file is missing from disk" }, { status: 410 });
  }
}
