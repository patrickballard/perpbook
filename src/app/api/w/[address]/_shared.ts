import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db/server";
import { isAddress } from "@/lib/hyperliquid/client";
import type { Db } from "@/lib/db/db";
import type { ApiResult } from "@/lib/sync/api";

export type Ctx = { params: Promise<{ address: string }> };

/** Resolve the database and a valid lowercase address, or the error response to send instead. */
export async function resolve(ctx: Ctx): Promise<{ db: Db; address: string } | NextResponse> {
  const db = serverDb();
  if (!db) return NextResponse.json({ error: "storage is not configured" }, { status: 503 });
  const { address } = await ctx.params;
  if (!isAddress(address)) return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  return { db, address: address.toLowerCase() };
}

export const send = <T>(r: ApiResult<T>) => NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
