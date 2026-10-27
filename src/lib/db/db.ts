import type { Pool, PoolClient } from "pg";

/**
 * The little of Postgres we use. `pg` serves it in production and PGlite in tests,
 * so nothing outside this folder knows which one it's talking to.
 */
export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
};

// pg types rows loosely; callers name the row shape they selected.
const run =
  (q: Pool | PoolClient) =>
  async <T>(text: string, params?: unknown[]) => ({ rows: (await q.query(text, params)).rows as unknown as T[] });

const clientDb = (c: PoolClient): Db => ({
  query: run(c),
  transaction: (fn) => fn(clientDb(c)), // already inside one
});

export function pgDb(pool: Pool): Db {
  return {
    query: run(pool),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const r = await fn(clientDb(c));
        await c.query("commit");
        c.release();
        return r;
      } catch (e) {
        // If the connection itself broke, rollback fails too: report the original error, and
        // destroy the connection instead of handing a broken one back to the pool.
        await c.query("rollback").catch(() => {});
        c.release(e instanceof Error ? e : true);
        throw e;
      }
    },
  };
}
