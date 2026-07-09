import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "src/client/public");
const svg = readFileSync(path.join(publicDir, "icon.svg"));

const sizes = [180, 192, 512];

for (const size of sizes) {
  const filename =
    size === 180 ? "apple-touch-icon.png" : `pwa-${size}x${size}.png`;
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, filename));
  console.log(`Wrote ${filename}`);
}
