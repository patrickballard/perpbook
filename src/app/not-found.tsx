import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <header className="flex items-center h-16">
        <Link href="/" className="font-semibold tracking-tight text-lg">
          perpbook<span className="text-accent">.</span>
        </Link>
      </header>
      <section className="pt-12 sm:pt-20 max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="text-ink-2">
          If you followed a wallet link, check the address is complete: 0x followed by 40 characters.
        </p>
        <p className="text-sm">
          <Link href="/" className="text-accent underline underline-offset-2">
            Paste an address
          </Link>{" "}
          <span className="text-muted">or</span>{" "}
          <Link href="/w/demo" className="text-accent underline underline-offset-2">
            look around the demo
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
