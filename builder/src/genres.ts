import { config } from "./config.js";

// Canonical genre vocabulary shared by every source, so recommendations can cross sources.
const SYNONYMS: Record<string, string> = {
  "science fiction": "sci-fi",
  "sci fi": "sci-fi",
  scifi: "sci-fi",
  "sci-fi & fantasy": "sci-fi",
  "science-fiction": "sci-fi",
  "film noir": "crime",
  noir: "crime",
  "film-noir": "crime",
  gangster: "crime",
  detective: "mystery",
  suspense: "thriller",
  cartoon: "animation",
  cartoons: "animation",
  animated: "animation",
  "animation & cartoons": "animation",
  children: "kids",
  "children's": "kids",
  family: "family",
  musical: "music",
  "music video": "music",
  documentaries: "documentary",
  docs: "documentary",
  "romantic comedy": "romance",
  romantic: "romance",
  "action & adventure": "action",
  "war & politics": "war",
  "martial arts": "action",
  kung: "action",
  cowboy: "western",
  westerns: "western",
  monster: "horror",
  zombie: "horror",
  zombies: "horror",
  vampire: "horror",
  slasher: "horror",
  silent: "classic",
  "silent film": "classic",
  "silent films": "classic",
  serials: "classic tv",
  sitcom: "comedy",
  slapstick: "comedy",
  religious: "faith",
  christian: "faith",
  religion: "faith",
  cooking: "lifestyle",
  food: "lifestyle",
  travel: "lifestyle",
  outdoor: "lifestyle",
  "true crime": "crime",
  biography: "history",
  historical: "history",
  space: "sci-fi",
  // iptv-org categories
  general: "general",
  entertainment: "entertainment",
  legislative: "news",
  business: "news",
  weather: "news",
  sports: "sports",
  auto: "sports",
  movies: "movies",
  series: "series",
  science: "documentary",
  education: "documentary",
  culture: "documentary",
};

const KNOWN = new Set([
  "action", "adventure", "animation", "anime", "classic", "classic tv", "comedy", "crime", "documentary",
  "drama", "entertainment", "faith", "family", "fantasy", "general", "history", "horror", "kids",
  "lifestyle", "movies", "music", "mystery", "news", "romance", "sci-fi", "series", "sports",
  "thriller", "war", "western",
]);

export function normalizeGenre(raw: string): string | null {
  const g = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (KNOWN.has(g)) return g;
  if (SYNONYMS[g]) return SYNONYMS[g];
  // Match a known genre or synonym as a whole word inside a longer tag ("pre-code horror films").
  for (const k of KNOWN) if (new RegExp(`\\b${k.replace("-", "\\-")}s?\\b`).test(g)) return k;
  for (const [s, k] of Object.entries(SYNONYMS)) if (new RegExp(`\\b${s}\\b`).test(g)) return k;
  return null;
}

export function normalizeGenres(raw: string[], extra: string[] = []): string[] {
  const out = new Set<string>();
  for (const r of [...raw, ...extra]) {
    const g = normalizeGenre(r);
    if (g) out.add(g);
  }
  return [...out].slice(0, 6);
}

const blocked = new RegExp(`\\b(${config.blockedWords.join("|")})\\b`, "i");
export function isBlocked(...texts: (string | string[] | undefined | null)[]): boolean {
  return texts.some((t) => (Array.isArray(t) ? t.some((x) => blocked.test(x)) : t ? blocked.test(t) : false));
}

export function clip(s: string | undefined | null, max = config.descriptionMax): string {
  if (!s) return "";
  const clean = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : clean;
}

/** Assign 0..1 percentile popularity within a list, given a raw metric. */
export function percentile<T>(items: T[], metric: (t: T) => number, set: (t: T, p: number) => void) {
  const sorted = [...items].sort((a, b) => metric(a) - metric(b));
  sorted.forEach((t, i) => set(t, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
}

// Fallback when a source gives no genre tags: scan title/description for strong keywords.
const INFER: [RegExp, string][] = [
  [/\b(horror|haunted|ghost|zombie|demon|slasher|vampire|terrif)/i, "horror"],
  [/\b(comedy|comedic|hilarious|funny|laugh|sketch|prank)/i, "comedy"],
  [/\b(documentary|docuseries|true story|explores the history|investigat)/i, "documentary"],
  [/\b(western|cowboy|outlaw|sheriff|frontier)/i, "western"],
  [/\b(anime|manga)/i, "anime"],
  [/\b(cartoon|animated|animation|minecraft|roblox)/i, "animation"],
  [/\b(romance|romantic|love story|falls in love)/i, "romance"],
  [/\b(thriller|suspense|kidnap|serial killer)/i, "thriller"],
  [/\b(murder|detective|crime|gangster|mob|heist|police)/i, "crime"],
  [/\b(alien|space|robot|future|sci-fi|science fiction)/i, "sci-fi"],
  [/\b(war|soldier|nazi|battle|army)/i, "war"],
  [/\b(kids|children|family-friendly|nursery|preschool)/i, "kids"],
  [/\b(recipe|cooking|chef|travel|fashion|fitness|yoga|makeover|diy)/i, "lifestyle"],
  [/\b(music|concert|band|singer|songs?)\b/i, "music"],
  [/\b(gaming|gameplay|gamer|let's play|survival)/i, "entertainment"],
  [/\b(sports?|football|soccer|boxing|wrestling|racing|fishing|hunting)/i, "sports"],
  [/\b(faith|bible|jesus|church|christian)/i, "faith"],
];
export function inferGenres(...texts: (string | null | undefined)[]): string[] {
  const t = texts.filter(Boolean).join(" ");
  return [...new Set(INFER.filter(([re]) => re.test(t)).map(([, g]) => g))].slice(0, 3);
}
