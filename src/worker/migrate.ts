// Apply database migrations and exit. `npm run migrate`; the worker also does this on start.

import { serverDb } from "../lib/db/server";
import { migrate } from "../lib/db/migrations";

const db = serverDb();
if (!db) throw new Error("DATABASE_URL is not set");
migrate(db).then(
  (n) => {
    console.log(n ? `Applied ${n} migration(s).` : "Database is up to date.");
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
