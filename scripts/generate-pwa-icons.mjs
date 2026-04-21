import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const outDir = join(process.cwd(), 'web/public');

const colors = {
  bg: [18, 20, 23, 255],
  moon: [242, 231, 182, 255],
  fur: [216, 221, 226, 255],
  teal: [47, 143, 123, 255],
  ink: [17, 20, 23, 255],
};

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffers) {
  let c = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32([name, data]), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const source = y * width * 4;
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    rgba.copy(raw, target + 1, source, source + width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);
}

function inPoly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function blendPixel(rgba, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function drawShape(rgba, width, height, color, contains) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ux = ((x + 0.5) / width) * 512;
      const uy = ((y + 0.5) / height) * 512;
      if (contains(ux, uy)) blendPixel(rgba, width, x, y, color);
    }
  }
}

function roundedRect(x, y, w, h, r) {
  return (px, py) => {
    const cx = Math.max(x + r, Math.min(px, x + w - r));
    const cy = Math.max(y + r, Math.min(py, y + h - r));
    return (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
  };
}

function circle(cx, cy, r) {
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function polygon(points) {
  return (x, y) => inPoly(x, y, points);
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  drawShape(rgba, size, size, colors.bg, roundedRect(0, 0, 512, 512, 96));
  drawShape(rgba, size, size, colors.moon, circle(356, 140, 74));
  drawShape(rgba, size, size, colors.fur, polygon([
    [142, 338], [172, 248], [240, 158], [315, 231], [288, 315],
    [235, 384], [283, 386], [230, 414], [168, 418], [67, 377], [142, 375],
  ]));
  drawShape(rgba, size, size, colors.teal, polygon([
    [214, 188], [252, 224], [322, 250], [302, 313], [244, 362], [189, 319], [178, 241],
  ]));
  drawShape(rgba, size, size, colors.ink, polygon([[194, 268], [234, 242], [276, 268], [234, 293]]));
  drawShape(rgba, size, size, colors.moon, polygon([[246, 245], [272, 183], [290, 260], [274, 269]]));
  drawShape(rgba, size, size, colors.moon, polygon([[215, 245], [189, 183], [171, 260], [187, 269]]));
  return encodePng(size, size, rgba);
}

for (const size of [192, 512]) {
  const target = join(outDir, `icon-${size}.png`);
  writeFileSync(target, makeIcon(size));
  console.log(`Wrote ${target}`);
}
