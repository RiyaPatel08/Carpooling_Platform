#!/usr/bin/env node
/**
 * Generates a solid brand-colour PNG icon, no external deps.
 *
 * Expo Go's own bundle-loading screen (before any JS, including our
 * Splash.tsx, has run) falls back to a generic placeholder icon when
 * app.json declares none — that generic square is the "flash before the
 * splash screen" a fresh QR scan shows. The fix isn't in app code: it's
 * supplying an actual icon/splash image so that loading phase already
 * carries the brand, matching theme.ts's colors.primary so there is no
 * visible handoff between "Expo Go's screen" and "our Splash component".
 *
 * Run: node assets/generate-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** A flat-colour square, optionally with a centred lighter circle "badge". */
function makePng(size, [r, g, b], badge) {
  const rowBytes = size * 4 + 1; // filter byte + RGBA
  const raw = Buffer.alloc(rowBytes * size);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 4;
      const inBadge = badge && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
      if (inBadge) {
        raw[off] = 255;
        raw[off + 1] = 255;
        raw[off + 2] = 255;
      } else {
        raw[off] = r;
        raw[off + 1] = g;
        raw[off + 2] = b;
      }
      raw[off + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// theme.ts's colors.primary (#1F6F5C) — kept in sync manually since this
// script runs standalone, outside the app's module graph.
const PRIMARY = [0x1f, 0x6f, 0x5c];

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, 'icon.png'), makePng(1024, PRIMARY, true));
fs.writeFileSync(path.join(outDir, 'adaptive-icon.png'), makePng(1024, PRIMARY, true));
fs.writeFileSync(path.join(outDir, 'splash.png'), makePng(1024, PRIMARY, true));
console.log('Wrote icon.png, adaptive-icon.png, splash.png to', outDir);
