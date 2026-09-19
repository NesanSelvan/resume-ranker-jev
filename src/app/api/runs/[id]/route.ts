import { NextResponse } from "next/server";
import { parseRequirements } from "@/lib/requirements";
import { getRunResults } from "@/lib/run";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const results = getRunResults(Number(id));
  if (!results) return NextResponse.json({ error: "No such run" }, { status: 404 });

  const { run, role, rows, extractionFailures } = results;
  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      total: run.total,
      completed: run.completed,
      failed: run.failed,
      scorerId: run.scorerId,
      error: run.error,
    },
    role: { id: role.id, title: role.title, requirementsText: role.requirementsText },
    requirements: parseRequirements(role.requirementsText),
    candidates: rows,
    extractionFailures,
  });
}
