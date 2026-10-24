import { NextResponse } from "next/server";
import { historyRequest } from "@/lib/sync/api";
import { resolve, send, type Ctx } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  const q = new URL(req.url).searchParams;
  return send(await historyRequest(r.db, r.address, q.get("kind"), q.get("after")));
}
