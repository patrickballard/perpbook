// Save each entrant's X picture into public/, so the league page serves its own copy: unavatar.io
// allows 25 lookups a day per IP, fine for adding entrants but not for every visitor.
//   npm run league-avatars            entrants without a picture yet
//   npm run league-avatars -- --all   everyone's, after people change theirs

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { avatarPath, currentSeason } from "../lib/league/seasons";

async function main() {
  const all = process.argv.includes("--all");
  let missing = 0;
  for (const e of currentSeason().entrants) {
    const file = path.join("public", avatarPath(e.handle));
    if (!all && existsSync(file)) continue;
    const res = await fetch(`https://unavatar.io/x/${e.handle.slice(1)}?fallback=false`);
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      // Usually a mistyped handle; the season test fails until it has a picture.
      console.error(`${e.handle}: no picture (HTTP ${res.status})`);
      missing++;
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log(`${e.handle}: saved`);
  }
  if (missing) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
