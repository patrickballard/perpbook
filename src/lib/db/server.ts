import { Pool } from "pg";
import { pgDb, type Db } from "./db";

let db: Db | null | undefined;

/** The app's database, or null when DATABASE_URL isn't set and storage is turned off. */
export function serverDb(): Db | null {
  if (db === undefined) {
    const url = process.env.DATABASE_URL;
    db = url ? pgDb(new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) })) : null;
  }
  return db;
}
