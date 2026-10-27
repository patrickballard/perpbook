import { Pool } from "pg";
import { pgDb, type Db } from "./db";
import { migratedOnFirstUse } from "./migrations";

let db: Db | null | undefined;

/** The app's database, or null when DATABASE_URL isn't set and storage is turned off. */
export function serverDb(): Db | null {
  if (db === undefined) {
    const url = process.env.DATABASE_URL;
    if (!url) return (db = null);
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
    // Neon closes idle connections when it scales to zero. pg reports that as an "error" on the
    // pool, and an unhandled "error" event crashes the process; the pool replaces the client itself.
    pool.on("error", (e) => console.error("database connection closed:", e.message));
    db = migratedOnFirstUse(pgDb(pool));
  }
  return db;
}
