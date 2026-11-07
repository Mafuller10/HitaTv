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
