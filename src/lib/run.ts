import pLimit from "p-limit";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { candidateScores, resumes, roles, runs } from "@/db/schema";
import { parseRequirements } from "@/lib/requirements";
import { getScorer } from "@/lib/scorer";

/**
 * Jev allows 1,200 requests/minute. Twenty in flight keeps a 300-resume batch
 * inside a few seconds while leaving headroom; the SDK handles 429s and backoff
 * itself, so there is no retry logic here.
 */
const CONCURRENCY = Number(process.env.RUN_CONCURRENCY ?? 20);

/**
 * In-flight runs, so the UI can end one. Single local process, so a Map is
 * enough; a restart loses the handle and the row is recovered by re-running.
 */
const inFlight = new Map<number, AbortController>();

export function cancelRun(runId: number): boolean {
  const controller = inFlight.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/**
 * The corpus a run scores: everything extractable, optionally narrowed to an
 * explicit set. Excluding a resume from a run never removes it — the row, the
 * original file and every score it earned in earlier runs are left alone.
 */
function scorableWhere(resumeIds?: number[]) {
  const extractable = eq(resumes.extractionStatus, "ok");
  return resumeIds && resumeIds.length > 0
    ? and(extractable, inArray(resumes.id, resumeIds))
    : extractable;
}

export function createRun(roleId: number, resumeIds?: number[]): number {
  const role = db.select().from(roles).where(eq(roles.id, roleId)).get();
  if (!role) throw new Error(`No role ${roleId}`);

  const scorable = db
    .select({ id: resumes.id })
    .from(resumes)
    .where(scorableWhere(resumeIds))
    .all();

  const scorer = getScorer();
  const run = db
    .insert(runs)
    .values({ roleId, scorerId: scorer.id, status: "running", total: scorable.length })
    .returning()
    .get();

  const controller = new AbortController();
  inFlight.set(run.id, controller);

  // Fire and forget: the UI polls the run row, so nothing awaits this. A dev
  // server reload mid-run leaves the row "running"; re-run to recover.
  void execute(run.id, roleId, controller.signal, resumeIds)
    .finally(() => inFlight.delete(run.id))
    .catch((error: unknown) => {
    db.update(runs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(runs.id, run.id))
      .run();
  });

  return run.id;
}

async function execute(
  runId: number,
  roleId: number,
  signal: AbortSignal,
  resumeIds?: number[],
): Promise<void> {
  const role = db.select().from(roles).where(eq(roles.id, roleId)).get()!;
  const requirements = parseRequirements(role.requirementsText);
  const scorer = getScorer();
  const limit = pLimit(CONCURRENCY);

  const pending = db.select().from(resumes).where(scorableWhere(resumeIds)).all();

  await Promise.all(
    pending.map((resume) =>
      limit(async () => {
        // Already-queued tasks drain without scoring once the run is ended.
        if (signal.aborted) return;
        try {
          const result = await scorer.score({ resumeText: resume.text, requirements }, signal);
          db.insert(candidateScores)
            .values({
              runId,
              resumeId: resume.id,
              dimensions: result.dimensions,
              requirements: result.requirements,
              model: result.model,
              inputTokens: result.inputTokens,
              latencyMs: result.latencyMs,
              truncated: result.truncated,
              status: "ok",
            })
            .run();
          db.update(runs)
            .set({ completed: sql`${runs.completed} + 1` })
            .where(eq(runs.id, runId))
            .run();
        } catch (error: unknown) {
          if (signal.aborted) return;
          // One bad resume fails one row, never the batch.
          db.insert(candidateScores)
            .values({
              runId,
              resumeId: resume.id,
              dimensions: [],
              requirements: [],
              model: scorer.id,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            })
            .run();
          db.update(runs)
            .set({ failed: sql`${runs.failed} + 1` })
            .where(eq(runs.id, runId))
            .run();
        }
      }),
    ),
  );

  db.update(runs)
    .set({
      status: signal.aborted ? "cancelled" : "done",
      finishedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(runs.id, runId))
    .run();
}

export function getRunResults(runId: number) {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) return null;
  const role = db.select().from(roles).where(eq(roles.id, run.roleId)).get()!;

  const rows = db
    .select({
      resumeId: candidateScores.resumeId,
      name: resumes.name,
      fileName: resumes.fileName,
      charCount: resumes.charCount,
      text: resumes.text,
      dimensions: candidateScores.dimensions,
      requirements: candidateScores.requirements,
      model: candidateScores.model,
      latencyMs: candidateScores.latencyMs,
      truncated: candidateScores.truncated,
    })
    .from(candidateScores)
    .innerJoin(resumes, eq(resumes.id, candidateScores.resumeId))
    .where(and(eq(candidateScores.runId, runId), eq(candidateScores.status, "ok")))
    .all();

  const failures = db
    .select({ fileName: resumes.fileName, name: resumes.name, error: resumes.extractionError })
    .from(resumes)
    .where(eq(resumes.extractionStatus, "failed"))
    .all();

  return { run, role, rows, extractionFailures: failures };
}
