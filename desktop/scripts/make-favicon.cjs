// The site's favicon (src/app/favicon.ico): the TradePilot mark at 32 and 256 px, as PNGs inside one
// .ico (every current browser reads that), from build/icon.png's drawing
const path = require("path");
const fs = require("fs");
const pw = require(path.join(__dirname, "..", "..", "node_modules", "playwright"));
const SVG = fs.readFileSync(path.join(__dirname, "make-icon.cjs"), "utf8").match(/<svg[\s\S]*?<\/svg>/)[0];
(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const pngs = [];
  for (const size of [32, 256]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${SVG.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</body></html>`);
    pngs.push({ size, data: await page.locator("svg").screenshot({ omitBackground: true }) });
    await page.close();
  }
  await browser.close();
  // ICONDIR + one ICONDIRENTRY per image, then the PNGs
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((p, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, o); head.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(p.data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  const out = path.join(__dirname, "..", "..", "src", "app", "favicon.ico");
  fs.writeFileSync(out, Buffer.concat([head, ...pngs.map(p => p.data)]));
  console.log("wrote", out, fs.statSync(out).size, "bytes");
})();
