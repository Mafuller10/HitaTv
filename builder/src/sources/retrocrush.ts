// RetroCrush — METADATA ONLY, from the public sitemap. Title pages load their data from /api/, which
// robots.txt disallows, so we use only what the sitemap exposes (id + title slug). The Roku tile shows a
// text card, and pressing play opens the official RetroCrush channel or shows the web URL.
import { config } from "../config.js";
import { isBlocked, percentile } from "../genres.js";
import type { Item } from "../types.js";
import { decodeEntities, fetchText } from "../util/http.js";

function titleFromSlug(slug: string): { title: string; variant: string | null } {
  let t = decodeURIComponent(decodeEntities(slug)).replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const variant = t.match(/\((Original[^)]*|English[^)]*|Dub[^)]*|Sub[^)]*)\)\s*$/i)?.[1] ?? null;
  if (variant) t = t.replace(/\s*\([^)]*\)\s*$/, "");
  return { title: t, variant };
}

export async function fetchRetrocrush(quick: boolean): Promise<Item[]> {
  const xml = await fetchText(config.retrocrush.sitemap);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
  const items: Item[] = [];
  const seenTitles = new Set<string>();

  for (const loc of locs) {
    const m = loc.match(/\/watch\/([^/]+)\/([^/?#]+)/);
    if (!m) continue;
    const [, contentId, slug] = m;
    const { title, variant } = titleFromSlug(slug);
    if (!title || isBlocked(title)) continue;
    // Collapse dub/sub duplicates into one tile (first one wins; usually the main listing).
    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    const isMovie = /\b(movie|film)\b/i.test(title);
    items.push({
      id: `retrocrush:${contentId}`,
      source: "retrocrush",
      type: isMovie ? "movie" : "series",
      title,
      description: `Classic anime on RetroCrush${variant ? ` (${variant})` : ""}. Opens in the official RetroCrush app.`,
      poster: "",
      backdrop: "",
      genres: ["anime", "animation", ...(isMovie ? [] : ["series"])],
      year: null,
      country: "JP",
      language: null,
      durationSec: null,
      rating: null,
      playable: false,
      external: {
        appName: config.retrocrush.appName,
        contentId,
        mediaType: isMovie ? "movie" : "series",
        webUrl: loc.replace("://retrocrush.tv", "://www.retrocrush.tv"),
      },
      popularity: 0,
    });
    if (quick && items.length >= 30) break;
  }
  const n = items.length;
  percentile(items, (i) => n - items.indexOf(i), (i, p) => (i.popularity = p));
  console.log(`[retrocrush] ${items.length} titles`);
  return items;
}
