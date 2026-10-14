// Draws the last-31-days contribution graph as light and dark SVGs (leshberz.ru palette).
// Usage: GITHUB_TOKEN=... node .github/scripts/activity-graph.mjs <login> <outDir>
import fs from "node:fs";
import path from "node:path";

const [login = "LeshBerz", outDir = "dist"] = process.argv.slice(2);
const DAYS = 31;

const THEMES = {
  light: { fg: "#0f1419", muted: "#5c6570", accent: "#0d9488", border: "#e2e0d9", area: 0.14 },
  dark: { fg: "#e8eaed", muted: "#9aa3af", accent: "#2dd4bf", border: "#1f2937", area: 0.18 },
};
const MONO = `'JetBrains Mono',ui-monospace,SFMono-Regular,Consolas,monospace`;
const SANS = `'Inter','Segoe UI',system-ui,-apple-system,Arial,sans-serif`;
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

async function fetchDays() {
  const to = new Date();
  const from = new Date(to.getTime() - (DAYS - 1) * 864e5);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors || json)}`);
  const days = json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return days.slice(-DAYS);
}

function render(days, t) {
  const W = 840, H = 240, L = 44, R = 20, T = 56, B = 40;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, ...days.map((d) => d.contributionCount));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i) => L + (i * pw) / (days.length - 1);
  const y = (v) => T + ph - (v * ph) / top;
  const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);
  // smooth line: Catmull-Rom → cubic Bézier, clamped so it never dips below zero
  let line = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(y(0), p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(y(0), p2[1] - (p3[1] - p1[1]) / 6)];
    line += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${line}L${x(days.length - 1).toFixed(1)} ${y(0)}L${L} ${y(0)}Z`;
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  const active = days.filter((d) => d.contributionCount > 0).length;
  const fmt = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m - 1]}`; };

  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = k * step, yy = y(v).toFixed(1);
    return `<path d="M${L} ${yy}H${W - R}" stroke="${t.border}"${k ? ' stroke-dasharray="2 4"' : ""}/><text x="${L - 10}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" class="m">${v}</text>`;
  }).join("");
  const ticks = days.map((d, i) => (i % 5 === 0 || i === days.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" class="m">${fmt(d.date)}</text>` : "").join("");
  const dots = pts.map(([px, py], i) => days[i].contributionCount
    ? `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${t.accent}"/>` : "").join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Активность на GitHub за последние ${DAYS} дней: ${total} контрибуций, активных дней — ${active}">
<style>.m{font:12px ${MONO};fill:${t.muted}}.s{font-family:${SANS}}
.ln{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.6s ease-out .2s forwards}.ar{opacity:0;animation:fade 1s ease-out 1s forwards}
@keyframes draw{to{stroke-dashoffset:0}}@keyframes fade{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.ln{stroke-dashoffset:0;animation:none}.ar{opacity:1;animation:none}}</style>
<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="${t.area}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>
<text x="${L}" y="26" class="m">последние <tspan fill="${t.accent}" font-weight="700">${DAYS}</tspan> день</text>
<text x="${W - R}" y="26" text-anchor="end" class="s" font-size="14" fill="${t.fg}"><tspan font-weight="700">${total}</tspan><tspan fill="${t.muted}"> контрибуций · </tspan><tspan font-weight="700">${active}</tspan><tspan fill="${t.muted}"> активных дней</tspan></text>
${grid}${ticks}
<path class="ar" d="${area}" fill="url(#a)"/>
<path class="ln" pathLength="1" d="${line}" fill="none" stroke="${t.accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
<g class="ar">${dots}</g>
</svg>
`;
}

const days = await fetchDays();
fs.mkdirSync(outDir, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) fs.writeFileSync(path.join(outDir, `activity-${name}.svg`), render(days, t));
console.log(`activity: ${days.length} days, ${days.reduce((s, d) => s + d.contributionCount, 0)} contributions → ${outDir}`);
