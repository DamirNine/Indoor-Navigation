const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 table
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(size, pixelData) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 3;
      const d = y * (1 + size * 3) + 1 + x * 3;
      raw[d] = pixelData[s]; raw[d + 1] = pixelData[s + 1]; raw[d + 2] = pixelData[s + 2];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 3);

  // Background: #1976D2
  const bg = [25, 118, 210];
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = bg[0]; pixels[i * 3 + 1] = bg[1]; pixels[i * 3 + 2] = bg[2];
  }

  const set = (x, y, r, g, b) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 3;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  };

  const fillCircle = (cx, cy, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) set(cx + dx, cy + dy, 255, 255, 255);
      }
    }
  };

  const drawLine = (x1, y1, x2, y2, t) => {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const fx = x1 + dx * i / steps;
      const fy = y1 + dy * i / steps;
      fillCircle(fx, fy, t);
    }
  };

  const s = size;

  // Head
  fillCircle(s * 0.5, s * 0.20, s * 0.11);

  // Body
  const thick = Math.max(2, Math.round(s * 0.045));
  drawLine(s * 0.5, s * 0.32, s * 0.5, s * 0.62, thick);

  // Left arm
  drawLine(s * 0.5, s * 0.44, s * 0.25, s * 0.57, thick);
  // Right arm
  drawLine(s * 0.5, s * 0.44, s * 0.75, s * 0.57, thick);

  // Left leg
  drawLine(s * 0.5, s * 0.62, s * 0.3, s * 0.87, thick);
  // Right leg
  drawLine(s * 0.5, s * 0.62, s * 0.7, s * 0.87, thick);

  return pixels;
}

const outDir = path.join(__dirname, 'public');

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png = makePNG(size, pixels);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Generated ${file} (${png.length} bytes)`);
}
