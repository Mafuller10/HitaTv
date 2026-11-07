import { config } from "./config.js";
import type { Item } from "./types.js";

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const x of a) if (sb.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

/**
 * "More like this" lists, computed ahead of time so the Roku doesn't need to.
 * score = genre Jaccard + same type bonus + era closeness + a little popularity.
 * Movies/series match each other; live TV, radio and webcams each only match their own kind.
 */
export function computeSimilar(items: Item[]): void {
  const n = config.similarCount;
  const group = (i: Item) => (i.type === "movie" || i.type === "series" ? "vod" : i.type);
  for (const a of items) {
    const ga = group(a);
    const scored: { id: string; s: number }[] = [];
    for (const b of items) {
      if (b === a || group(b) !== ga) continue;
      const g = jaccard(a.genres, b.genres);
      if (g === 0) continue;
      let s = g + (a.type === b.type ? 0.1 : 0) + 0.05 * b.popularity;
      if (a.year && b.year) s += 0.1 * (1 - Math.min(Math.abs(a.year - b.year), 30) / 30);
      if (ga !== "vod" && a.country && a.country === b.country) s += 0.15;
      scored.push({ id: b.id, s });
    }
    scored.sort((x, y) => y.s - x.s);
    a.similar = scored.slice(0, n).map((x) => x.id);
  }
}
