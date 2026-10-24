import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db/server";
import { walletStatus } from "@/lib/sync/api";
import { resolve, send, type Ctx } from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  if (!serverDb()) return NextResponse.json({ state: "off" }, { headers: { "Cache-Control": "no-store" } });
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  return send(await walletStatus(r.db, r.address));
}
