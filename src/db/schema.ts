import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

export const resumes = sqliteTable(
  "resumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sha256: text("sha256").notNull().unique(),
    /** Best-effort candidate name from the extracted text. */
    name: text("name").notNull(),
    text: text("text").notNull(),
    charCount: integer("char_count").notNull(),
    /** "ok" | "failed" — a short extraction is flagged, never scored silently. */
    extractionStatus: text("extraction_status").notNull(),
    extractionError: text("extraction_error"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("resumes_status_idx").on(t.extractionStatus)],
);

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  requirementsText: text("requirements_text").notNull(),
  /** Dimension weights as JSON; composite is always recomputed, never stored. */
  weights: text("weights", { mode: "json" }).$type<Record<string, number>>(),
  mustHaveThreshold: real("must_have_threshold").notNull().default(0.5),
  createdAt: integer("created_at").notNull().default(now),
});

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scorerId: text("scorer_id").notNull(),
    /** "running" | "done" | "failed" */
    status: text("status").notNull().default("running"),
    total: integer("total").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    error: text("error"),
    startedAt: integer("started_at").notNull().default(now),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("runs_role_idx").on(t.roleId)],
);

export const candidateScores = sqliteTable(
  "candidate_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    /** Raw per-dimension results INCLUDING full probability distributions, for audit. */
    dimensions: text("dimensions", { mode: "json" }).notNull().$type<unknown[]>(),
    /** Per-requirement noul probabilities. */
    requirements: text("requirements", { mode: "json" }).notNull().$type<unknown[]>(),
    /** Resolved versioned model id returned by the API, not the alias sent. */
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
    /** "ok" | "failed" — one bad resume fails one row, not the batch. */
    status: text("status").notNull().default("ok"),
    error: text("error"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("scores_run_idx").on(t.runId)],
);

export type Resume = typeof resumes.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type CandidateScore = typeof candidateScores.$inferSelect;
