import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), "data/app.db");

function create() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Next dev reloads the module graph; keep one connection per process.
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof create> };
export const db = globalForDb.__db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.__db = db;

export { schema };
