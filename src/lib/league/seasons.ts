// League seasons: a week of perps, ranked by % return. Entrants come from replies to the
// season's post; add them here (handle, then address) and the page picks them up.

export type Entrant = { handle: string; address: string };

export type Season = {
  slug: string;
  name: string;
  /** ms; UK is on GMT in November, so these are UK times too. */
  start: number;
  end: number;
  /** The post to reply to with a wallet, once it's up. */
  entryUrl: string | null;
  entrants: Entrant[];
};

export const SEASONS: Season[] = [
  {
    slug: "1",
    name: "Week 1",
    start: Date.UTC(2026, 10, 2), // Mon 2 Nov, 00:00
    end: Date.UTC(2026, 10, 8, 20), // Sun 8 Nov, 20:00
    entryUrl: null,
    entrants: [],
  },
];

export const currentSeason = (): Season => SEASONS.at(-1)!;

export const X_PROFILE = "https://x.com/ppatrickballard";
