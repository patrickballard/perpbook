import { NextResponse } from "next/server";
import { trackLimits, trackRequest } from "@/lib/sync/api";
import { resolve, send, type Ctx } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return send(await trackRequest(r.db, r.address, ip, trackLimits()));
}
