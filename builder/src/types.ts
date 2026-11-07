import { z } from "zod";

export const SourceId = z.enum(["iptv", "famelack", "archive", "fawesome", "retrocrush"]);
export type SourceId = z.infer<typeof SourceId>;

export const ItemSchema = z.object({
  id: z.string().min(1),
  source: SourceId,
  // "webcam" = live camera opened in the YouTube channel; "radio" = audio-only live stream.
  type: z.enum(["live", "radio", "webcam", "movie", "series"]),
  title: z.string().min(1),
  description: z.string(),
  poster: z.string(), // may be "" (Roku tile falls back to a text card)
  backdrop: z.string(),
  genres: z.array(z.string()),
  year: z.number().int().nullable(),
  country: z.string().nullable(),
  language: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  rating: z.string().nullable(),
  playable: z.boolean(),
  // In-app playback (iptv/archive). Several URLs = fallbacks tried in order.
  streams: z
    .array(
      z.object({
        url: z.string().url(),
        format: z.enum(["hls", "mp4", "mp3", "aac"]),
        headers: z.array(z.string()).optional(), // "Name: value" (Roku HttpHeaders format)
      }),
    )
    .optional(),
  // Licensed services: open official channel instead of playing here.
  external: z
    .object({
      appName: z.string(), // matched against Roku /query/apps
      contentId: z.string(),
      mediaType: z.enum(["movie", "series", "live"]),
      webUrl: z.string().url(),
    })
    .optional(),
  popularity: z.number().min(0).max(1), // percentile within its source
  similar: z.array(z.string()).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const RowSchema = z.object({
  id: z.string(),
  title: z.string(),
  views: z.array(z.enum(["home", "live", "movies", "anime"])),
  itemIds: z.array(z.string()).min(1),
});
export type Row = z.infer<typeof RowSchema>;

export const CatalogSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  rows: z.array(RowSchema),
  items: z.record(ItemSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
