// Generates the Roku channel icons and splash screens (no dependencies).
//   node tools/make-images.mjs
// Replace the PNGs in roku/images/ with real artwork whenever you like; sizes must stay the same.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.resolve(import.meta.dirname, "../roku/images");
const BG = [0x0b, 0x0b, 0x0f];
const ACCENT = [0xff, 0x4d, 0x2e];
const WHITE = [0xff, 0xff, 0xff];

// 5x7 bitmap glyphs for the few letters we need.
const FONT = {
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(w, h) {
  const px = Buffer.alloc(w * h * 3);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, BG);

  const text = "HITA TV";
  const scale = Math.floor(Math.min(w / (text.length * 6 + 2), h / 14));
  const tw = text.length * 6 * scale - scale;
  const x0 = Math.floor((w - tw) / 2);
  const y0 = Math.floor((h - 7 * scale) / 2) - scale;
  [...text].forEach((ch, ci) => {
    const g = FONT[ch];
    const color = ci < 4 ? WHITE : ACCENT;
    for (let gy = 0; gy < 7; gy++)
      for (let gx = 0; gx < 5; gx++)
        if (g[gy][gx] === "1")
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) set(x0 + (ci * 6 + gx) * scale + dx, y0 + gy * scale + dy, color);
  });
  // Accent bar under the wordmark.
  const barY = y0 + 8 * scale;
  for (let y = barY; y < barY + Math.max(2, Math.floor(scale / 2)); y++)
    for (let x = x0; x < x0 + tw; x++) set(x, y, ACCENT);
  return png(w, h, px);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, w, h] of [
  ["icon_focus_hd.png", 336, 210],
  ["icon_focus_fhd.png", 540, 405],
  ["splash_hd.png", 1280, 720],
  ["splash_fhd.png", 1920, 1080],
]) {
  fs.writeFileSync(path.join(OUT, name), render(w, h));
  console.log("wrote", name);
}
