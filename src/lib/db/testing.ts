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

/** A fresh, migrated, in-memory Postgres for one test. */
export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = { query: query(pg), transaction: (fn) => pg.transaction((t) => fn(txDb(t))) };
  await migrate(db);
  return db;
}
