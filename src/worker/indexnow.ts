// Tells Bing (and the other IndexNow engines) that the sitemap's pages changed, so they're
// recrawled in days rather than weeks. ChatGPT's search answers from Bing's index.
//
//   npm run indexnow -- https://perpbook.vercel.app
//
// The key isn't a secret: IndexNow checks it's served from the site at /<key>.txt.
const KEY = "b7e88ffecbcdb2f89e52cc13fb5e9b72";

async function main() {
  const site = new URL(process.argv[2] ?? process.env.SITE_URL ?? "");
  const sitemap = await fetch(new URL("/sitemap.xml", site)).then((r) => r.text());
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!urls.length) throw new Error("The sitemap has no pages");
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: site.host, key: KEY, keyLocation: new URL(`/${KEY}.txt`, site).toString(), urlList: urls }),
  });
  // 200 and 202 both mean accepted.
  console.log(`IndexNow: ${urls.length} pages, HTTP ${res.status}`);
  if (!res.ok) throw new Error(await res.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
