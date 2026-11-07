import { config } from "./config.js";

/**
 * Returns true if the stream answers like playable media:
 *  - HLS: body starts with #EXTM3U
 *  - MP4: 2xx/206 with a video-ish content type
 * Reads at most a few KB, never the whole stream.
 */
export async function probeStream(url: string, headers: string[] = [], timeoutMs = 8000): Promise<boolean> {
  const h: Record<string, string> = { "User-Agent": config.userAgent, Range: "bytes=0-4095" };
  for (const line of headers) {
    const i = line.indexOf(":");
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: h, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.startsWith("video/mp4") || ct.includes("octet-stream") && url.toLowerCase().includes(".mp4")) return true;
    const reader = res.body?.getReader();
    if (!reader) return false;
    let text = "";
    while (text.length < 512) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      text += new TextDecoder().decode(value);
    }
    reader.cancel().catch(() => {});
    return text.trimStart().startsWith("#EXTM3U");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

/**
 * Probes an internet-radio stream and returns the Roku Audio streamFormat it needs, or null if dead.
 * Icecast/Shoutcast streams never end, so we only read the response headers (and a few bytes for HLS).
 */
export async function probeAudio(url: string, timeoutMs = 8000): Promise<"mp3" | "aac" | "hls" | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": config.userAgent }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("mpegurl")) {
      const reader = res.body?.getReader();
      const chunk = reader ? await reader.read() : undefined;
      reader?.cancel().catch(() => {});
      const text = chunk?.value ? new TextDecoder().decode(chunk.value) : "";
      return text.trimStart().startsWith("#EXTM3U") ? "hls" : null;
    }
    if (ct.startsWith("audio/mpeg") || ct.startsWith("audio/mp3")) return "mp3";
    if (ct.startsWith("audio/aac") || ct.startsWith("audio/aacp") || ct.startsWith("audio/x-aac") || ct.startsWith("audio/mp4")) return "aac";
    return null; // playlists (.pls/.m3u), ogg, html error pages, etc.
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}
