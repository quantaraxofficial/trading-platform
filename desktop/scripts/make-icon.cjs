// Draws build/icon.png (512×512, transparent corners) from the TradePilot mark, with the site's
// Playwright (a headless Chromium): electron-builder makes the Windows .ico from it.
const path = require("path");
const fs = require("fs");
const pw = require(path.join(__dirname, "..", "..", "node_modules", "playwright"));

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
  <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="url(#g)"/>
  <path d="M18.5 8.5l-6 6-3.5-3.5-4.5 4.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14.5 8.5h4v4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${SVG}</body></html>`);
  const out = path.join(__dirname, "..", "build", "icon.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.locator("svg").screenshot({ path: out, omitBackground: true });
  await browser.close();
  console.log("wrote", out);
})();
