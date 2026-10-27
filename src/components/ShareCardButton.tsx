"use client";

import { useState } from "react";
import { drawCard, type CardData } from "@/lib/card";

/** CSS font-family values for the Geist fonts the layout already loaded. */
async function cardFonts() {
  const css = getComputedStyle(document.body);
  const sans = `${css.getPropertyValue("--font-geist-sans").trim() || "system-ui"}, system-ui, sans-serif`;
  const mono = `${css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace"}, ui-monospace, monospace`;
  // Canvas only uses fonts that have finished loading, including each weight it asks for.
  await Promise.all([`600 34px ${sans}`, `400 26px ${sans}`, `500 40px ${mono}`].map((f) => document.fonts.load(f).catch(() => [])));
  return { sans, mono };
}

export async function renderCard(data: CardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawCard(canvas, data, await cardFonts());
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"));
}

/**
 * Save the card as a PNG. On phones, open the share sheet instead, so it can go straight
 * into X or a group chat.
 */
export function ShareCardButton({ data, filename }: { data: CardData | null; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    if (!data) return;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await renderCard(data);
      const file = new File([blob], filename, { type: "image/png" });
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {}); // closing the sheet isn't an error
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      setFailed(true); // e.g. a browser that blocks canvas; say so rather than doing nothing
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={() => void share()} disabled={!data || busy} className="h-9 px-3 rounded-lg border border-line text-sm hover:bg-raised disabled:opacity-50">
      {busy ? "Drawing…" : failed ? "Couldn't draw card" : "Share card"}
    </button>
  );
}
