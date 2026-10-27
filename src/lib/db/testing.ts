import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Db } from "./db";
import { migrate } from "./migrations";

type Conn = Pick<PGlite, "query" | "exec"> | Transaction;

function query(c: Conn): Db["query"] {
  return async <T>(text: string, params?: unknown[]) => {
    // PGlite's query() runs one statement; migrations send several, like pg does without params.
    if (!params?.length && text.includes(";")) {
      await c.exec(text);
      return { rows: [] as T[] };
    }
    return { rows: (await c.query<T>(text, params)).rows };
  };
}

function txDb(t: Transaction): Db {
  const self: Db = { query: query(t), transaction: (fn) => fn(self) };
  return self;
}

/** A fresh in-memory Postgres for one test, migrated unless asked not to be. */
export async function testDb({ migrated = true } = {}): Promise<Db> {
  const pg = new PGlite();
  const db: Db = { query: query(pg), transaction: (fn) => pg.transaction((t) => fn(txDb(t))) };
  if (migrated) await migrate(db);
  return db;
}
