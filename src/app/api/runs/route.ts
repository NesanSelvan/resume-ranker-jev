import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { parseRequirements } from "@/lib/requirements";
import { createRun } from "@/lib/run";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    requirementsText?: string;
    roleId?: number;
    /** Scores only these resumes. Omit to score the whole extractable corpus. */
    resumeIds?: number[];
  };

  const resumeIds = Array.isArray(body.resumeIds)
    ? body.resumeIds.filter((id): id is number => Number.isInteger(id))
    : undefined;

  if (resumeIds && resumeIds.length === 0) {
    return NextResponse.json({ error: "Every resume is excluded from this run" }, { status: 400 });
  }

  // Re-running an existing role: reuse its stored requirements verbatim.
  if (typeof body.roleId === "number") {
    const existing = db.select().from(roles).where(eq(roles.id, body.roleId)).get();
    if (!existing) return NextResponse.json({ error: "No such role" }, { status: 404 });
    return NextResponse.json({ runId: createRun(existing.id, resumeIds), roleId: existing.id });
  }

  const requirementsText = body.requirementsText?.trim() ?? "";
  if (parseRequirements(requirementsText).length === 0) {
    return NextResponse.json({ error: "Add at least one requirement line" }, { status: 400 });
  }

  const role = db
    .insert(roles)
    .values({ title: body.title?.trim() || "Untitled role", requirementsText })
    .returning()
    .get();

  return NextResponse.json({ runId: createRun(role.id, resumeIds), roleId: role.id });
}
