import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/run";

export const runtime = "nodejs";

/**
 * Ends a run in progress. Rows already scored are kept — ending a run stops
 * further work, it does not discard results.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cancelled = cancelRun(Number(id));
  return NextResponse.json({ cancelled });
}
