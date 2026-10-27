import { NextResponse } from "next/server";
import { clientIp, trackLimits, trackRequest } from "@/lib/sync/api";
import { resolve, send, type Ctx } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  return send(await trackRequest(r.db, r.address, clientIp(req.headers), trackLimits()));
}
