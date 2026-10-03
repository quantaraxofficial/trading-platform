// Generates src/app/components/ui/iconData.ts from the Font Awesome free sets (dev dependencies)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const s = require(path.join(root, 'node_modules/@fortawesome/free-solid-svg-icons'));
const r = require(path.join(root, 'node_modules/@fortawesome/free-regular-svg-icons'));
const b = require(path.join(root, 'node_modules/@fortawesome/free-brands-svg-icons'));
const packs = { s, r, b };
const find = (id) => {
  const [p, name] = id.split(':');
  const def = Object.values(packs[p]).find(i => i && i.iconName === name);
  if (!def) throw new Error('missing ' + id);
  const d = Array.isArray(def.icon[4]) ? def.icon[4].join(' ') : def.icon[4];
  return [def.icon[0], def.icon[1], d];
};

const SECTIONS = [
  { category: 'Gestures & smileys', nav: 'r:face-smile', items: ['r:thumbs-up', 'r:thumbs-down', 's:thumbs-up', 's:thumbs-down', 'r:hand-point-right', 'r:hand-point-left', 's:user', 'r:hand-point-up', 'r:hand-point-down', 'r:face-smile', 'r:face-meh', 'r:face-frown', 's:person'] },
  { category: 'Symbols & flags', nav: 'r:flag', items: ['r:flag', 's:flag-checkered', 's:flag', 's:heart', 's:star', 'r:star', 'r:square-check', 's:check', 's:xmark', 's:power-off', 's:signal', 's:arrows-rotate', 's:rotate-right', 'r:circle-dot', 's:location-dot', 's:square-check', 's:circle-plus', 's:circle-minus', 's:circle-xmark', 's:circle-question', 's:circle-check', 's:circle-info', 's:crosshairs', 'r:circle-xmark', 'r:circle-check', 's:ban', 's:plus', 's:minus', 's:asterisk', 's:circle-exclamation', 's:triangle-exclamation', 's:eye', 's:eye-slash', 's:comment', 'r:heart', 's:certificate', 'r:comment', 's:spinner', 's:circle', 's:star-half-stroke', 's:location-arrow', 'r:circle', 's:question', 's:info', 's:exclamation', 's:bullseye', 'b:github', 'b:linux', 'b:apple'] },
  { category: 'Nature', nav: 'r:moon', items: ['s:leaf', 's:sun', 'r:moon', 's:bug', 's:bolt'] },
  { category: 'Currency', nav: 's:won-sign', items: ['s:euro-sign', 's:sterling-sign', 's:dollar-sign', 's:indian-rupee-sign', 's:yen-sign', 's:ruble-sign', 's:won-sign', 's:turkish-lira-sign', 'b:bitcoin'] },
  { category: 'Objects', nav: 's:lightbulb', items: ['s:filter', 's:magnifying-glass', 's:magnifying-glass-plus', 's:house', 'r:clock', 's:camera', 's:gear', 's:droplet', 's:gift', 's:bell', 's:bookmark', 's:briefcase', 's:calendar', 's:chart-line', 's:chart-column', 's:chart-pie', 's:coins', 's:crown', 's:gem', 's:key', 's:lightbulb', 's:lock', 's:unlock', 's:money-bill', 's:paper-plane', 's:pen', 's:rocket', 's:scale-balanced', 's:shield', 's:sack-dollar', 's:piggy-bank', 's:wallet', 's:trophy', 's:umbrella', 's:wrench', 's:hourglass', 's:fire', 's:anchor', 's:bomb'] },
  { category: 'Arrows', nav: 's:arrow-left', items: ['s:arrow-up', 's:arrow-down', 's:arrow-left', 's:arrow-right', 's:arrow-trend-up', 's:arrow-trend-down', 's:circle-arrow-up', 's:circle-arrow-down', 's:circle-arrow-left', 's:circle-arrow-right', 's:caret-up', 's:caret-down', 's:caret-left', 's:caret-right', 's:angles-up', 's:angles-down', 's:chevron-up', 's:chevron-down', 's:arrow-up-long', 's:arrow-down-long', 's:arrows-up-down', 's:arrows-left-right', 's:share', 's:reply'] },
];

const ids = new Set();
SECTIONS.forEach(sec => { ids.add(sec.nav); sec.items.forEach(i => ids.add(i)); });
const paths = {};
[...ids].forEach(id => { paths['icon:' + id] = find(id); });

let out = `// Generated from Font Awesome Free 6 (https://fontawesome.com), icons licensed CC BY 4.0.
// The Icons tab of the emoji picker, in TradingView's order and sections. Each entry is
// [viewBox width, viewBox height, SVG path data], so icons can be drawn in any colour.
// Regenerate with: node scripts/gen-icon-data.js

export const ICON_SECTIONS: { category: string; nav: string; items: string[] }[] = ${JSON.stringify(
  SECTIONS.map(sec => ({ category: sec.category, nav: 'icon:' + sec.nav, items: sec.items.map(i => 'icon:' + i) })), null, 2)};

export const ICON_PATHS: Record<string, [number, number, string]> = ${JSON.stringify(paths)};
`;
fs.writeFileSync(path.join(root, 'src/app/components/ui/iconData.ts'), out);
console.log('icons', ids.size, 'bytes', out.length);
