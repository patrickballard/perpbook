import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressForm } from "@/components/AddressForm";
import { GUIDES, guide } from "@/lib/guides";
import { siteUrl } from "@/lib/site";

// Only the guides: any other top-level path is a 404, not a guide page.
export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ guide: g.slug }));

type Props = { params: Promise<{ guide: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guide((await params).guide);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/${g.slug}` },
    openGraph: { title: g.title, description: g.description, type: "article" },
    twitter: { card: "summary", title: g.title, description: g.description },
  };
}

function structuredData(g: NonNullable<ReturnType<typeof guide>>) {
  const url = siteUrl();
  const at = (path: string) => (url ? new URL(path, url).toString() : path);
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.h1,
      description: g.description,
      url: at(`/${g.slug}`),
      author: { "@type": "Organization", name: "perpbook", url: at("/") },
      publisher: { "@type": "Organization", name: "perpbook", url: at("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "perpbook", item: at("/") },
        { "@type": "ListItem", position: 2, name: g.label, item: at(`/${g.slug}`) },
      ],
    },
  ];
  // Escaped so no answer can close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function GuidePage({ params }: Props) {
  const g = guide((await params).guide);
  if (!g) notFound();
  const others = GUIDES.filter((o) => o.slug !== g.slug);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData(g) }} />
      <header className="flex items-center gap-5 mb-10">
        <Link href="/" className="font-semibold tracking-tight text-lg mr-auto">
          perpbook<span className="text-accent">.</span>
        </Link>
        <Link href="/league" className="text-sm text-ink-2 hover:text-ink">
          League
        </Link>
        <Link href="/w/demo" className="text-sm text-ink-2 hover:text-ink">
          Demo
        </Link>
      </header>

      <article>
        <p className="eyebrow mb-3">{g.eyebrow}</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{g.h1}</h1>
        <p className="mt-4 text-lg text-ink-2">{g.intro}</p>

        <div className="mt-6">
          <AddressForm />
          <p className="text-sm text-muted mt-3">
            Free, read-only, no sign-up. Or{" "}
            <Link href="/w/demo" className="text-accent underline underline-offset-2">
              look around a demo account
            </Link>
            .
          </p>
        </div>

        {g.sections.map((s) => (
          <section key={s.h} className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight mb-3">{s.h}</h2>
            <div className="text-ink-2 leading-relaxed">{s.body}</div>
          </section>
        ))}

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight mb-3">Questions</h2>
          <dl className="space-y-4">
            {g.faq.map(([q, a]) => (
              <div key={q}>
                <dt className="font-medium">{q}</dt>
                <dd className="text-ink-2 mt-1 leading-relaxed">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>

      <section className="card p-6 mt-12">
        <h2 className="text-lg font-semibold tracking-tight">See your own trades</h2>
        <p className="text-sm text-ink-2 mt-1 mb-4">Paste a Hyperliquid address. Works for front-ends built on Hyperliquid and HIP-3 markets.</p>
        <AddressForm />
      </section>

      <nav className="mt-10 text-sm">
        <p className="eyebrow mb-2">More guides</p>
        <ul className="space-y-1.5">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/${o.slug}`} className="text-ink-2 hover:text-ink underline underline-offset-2">
                {o.h1}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="border-t border-line mt-12 pt-6 text-xs text-muted flex flex-wrap gap-x-5 gap-y-2">
        <span>perpbook is an analytics tool, not financial advice.</span>
        <a href="https://github.com/patrickballard/perpbook" className="underline underline-offset-2 hover:text-ink-2">
          Open source on GitHub
        </a>
      </footer>
    </main>
  );
}
