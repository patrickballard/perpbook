// League seasons: a week of perps, ranked by % return. Entrants DM their wallet; add them here
// (handle, then address), run `npm run league-avatars` to save their X pictures, and the page
// picks them up.

import type { Standing } from "./standings";

export type Entrant = { handle: string; address: string };

export type Season = {
  slug: string;
  name: string;
  /** ms; UK is on GMT in November, so these are UK times too. */
  start: number;
  end: number;
  entrants: Entrant[];
  /** Frozen once the week ends (`npm run league-final`), so the table can't shift afterwards. */
  final?: Standing[];
};

export const SEASONS: Season[] = [
  {
    slug: "1",
    name: "Week 1",
    start: Date.UTC(2026, 10, 2), // Mon 2 Nov, 00:00
    end: Date.UTC(2026, 10, 8, 20), // Sun 8 Nov, 20:00
    entrants: [],
  },
];

export const currentSeason = (): Season => SEASONS.at(-1)!;

export const X_HANDLE = "@ppatrickballard";
export const X_PROFILE = `https://x.com/${X_HANDLE.slice(1)}`;

/** An entrant's X picture, saved under public/ by `npm run league-avatars`. */
export const avatarPath = (handle: string) => `/league/avatars/${handle.slice(1).toLowerCase()}.jpg`;
