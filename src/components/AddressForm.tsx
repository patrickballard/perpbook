"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addressIn, isAddress } from "@/lib/hyperliquid/client";

export function AddressForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = addressIn(value); // also takes a pasted explorer link
        if (!isAddress(v)) {
          setError("That doesn't look like a wallet address (0x followed by 40 characters).");
          return;
        }
        router.push(`/w/${v.toLowerCase()}`);
      }}
      className="w-full"
    >
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="0x… your Hyperliquid address"
          spellCheck={false}
          autoComplete="off"
          aria-label="Wallet address"
          className="num w-full sm:flex-1 h-12 px-4 rounded-xl border border-line bg-surface text-[15px] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
        />
        <button type="submit" className="h-12 px-5 rounded-xl bg-ink text-page font-medium hover:opacity-90">
          Open my journal
        </button>
      </div>
      {error && <p className="text-sm down mt-2">{error}</p>}
    </form>
  );
}
