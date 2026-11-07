// Entry point: node builder → dist/catalog.json (+ optional copy into the Roku package).
//   npm run build            full build (~10 min, run daily in CI)
//   npm run build:quick      small catalog for local iteration
//   add --bundle             also copy the result to ../roku/data/catalog.json (offline fallback)
import fs from "node:fs";
import path from "node:path";
import { buildRows } from "./rows.js";
import { computeSimilar } from "./similar.js";
import { fetchArchive } from "./sources/archiveOrg.js";
import { fetchFamelack } from "./sources/famelack.js";
import { fetchFawesome } from "./sources/fawesome.js";
import { fetchIptv } from "./sources/iptvOrg.js";
import { fetchRetrocrush } from "./sources/retrocrush.js";
import { CatalogSchema, type Catalog, type Item } from "./types.js";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const bundle = args.has("--bundle");
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

async function main() {
  const started = Date.now();
  const sources: [string, (q: boolean) => Promise<Item[]>][] = [
    ["iptv", fetchIptv],
    ["archive", fetchArchive],
    ["fawesome", fetchFawesome],
    ["retrocrush", fetchRetrocrush],
  ];

  // A failing source shouldn't take the whole catalog down; reuse its items from the previous build.
  let previous: Catalog | null = null;
  try {
    previous = JSON.parse(fs.readFileSync(path.join(dist, "catalog.json"), "utf8"));
  } catch {}

  // Famelack runs after iptv-org so it can skip channels iptv-org already supplied.
  sources.push(["famelack", async (q) => fetchFamelack(q, await iptvDone)]);
  let resolveIptv!: (v: Item[]) => void;
  const iptvDone = new Promise<Item[]>((r) => (resolveIptv = r));
  const results = await Promise.allSettled(
    sources.map(([name, fn]) => {
      const p = fn(quick);
      if (name === "iptv") p.then(resolveIptv, () => resolveIptv([]));
      return p;
    }),
  );
  const all: Item[] = [];
  results.forEach((r, i) => {
    const name = sources[i][0];
    if (r.status === "fulfilled" && r.value.length) {
      all.push(...r.value);
    } else {
      const reason = r.status === "rejected" ? r.reason : "0 items";
      const old = previous ? Object.values(previous.items).filter((it) => it.source === name) : [];
      console.warn(`[build] WARNING ${name} failed (${reason}); reusing ${old.length} items from last build`);
      all.push(...old);
    }
  });

  const items = [...new Map(all.map((i) => [i.id, i])).values()];
  if (items.length < 50) throw new Error(`Only ${items.length} items — refusing to publish a broken catalog`);

  computeSimilar(items);
  const rows = buildRows(items);

  const catalog: Catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    rows,
    items: Object.fromEntries(items.map((i) => [i.id, i])),
  };
  CatalogSchema.parse(catalog);

  // Every row id must resolve.
  for (const r of rows) for (const id of r.itemIds) if (!catalog.items[id]) throw new Error(`Row ${r.id} → missing ${id}`);

  fs.mkdirSync(dist, { recursive: true });
  const json = JSON.stringify(catalog);
  fs.writeFileSync(path.join(dist, "catalog.json"), json);
  fs.writeFileSync(path.join(dist, ".nojekyll"), "");
  fs.writeFileSync(
    path.join(dist, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>HitaTV catalog</title><p>HitaTV catalog generated ${catalog.generatedAt}: ${items.length} items, ${rows.length} rows. <a href="catalog.json">catalog.json</a></p>`,
  );
  if (bundle) {
    const target = path.resolve(root, "../roku/data/catalog.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json);
    console.log(`[build] bundled into ${target}`);
  }

  const counts = items.reduce<Record<string, number>>((acc, i) => ((acc[i.source] = (acc[i.source] ?? 0) + 1), acc), {});
  console.log(`[build] items by source: ${JSON.stringify(counts)}`);
  console.log(`[build] ${rows.length} rows: ${rows.map((r) => `${r.title} (${r.itemIds.length})`).join(", ")}`);
  console.log(`[build] catalog.json ${(json.length / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  if (json.length > 3.5 * 1024 * 1024) console.warn("[build] WARNING catalog > 3.5 MB; older Rokus may parse it slowly");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
