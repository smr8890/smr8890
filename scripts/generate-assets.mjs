#!/usr/bin/env node
/**
 * Generate the profile README assets as self-contained SVG files.
 *
 * No runtime service is involved: every SVG is written into ./assets and
 * referenced from the README with a relative path, so the profile page only
 * ever loads files served by GitHub itself.
 *
 * Usage:
 *   GITHUB_TOKEN=xxx node scripts/generate-assets.mjs [login]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const USER =
  process.argv[2] ||
  process.env.PROFILE_USER ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  "smr8890";

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";
const OUT_DIR = resolve("assets");

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const COLORS = {
  bg: "#0d1117",
  border: "#30363d",
  title: "#e6edf3",
  accent: "#58a6ff",
  label: "#8b949e",
  track: "#21262d",
};

const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  PowerShell: "#012456",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
  Lua: "#000080",
  "Jupyter Notebook": "#DA5B0B",
  Makefile: "#427819",
  Batchfile: "#C1F12E",
  Nix: "#7e7eff",
  Zig: "#ec915c",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
};

const warnings = [];

const log = (...args) => console.log(...args);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

async function api(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${USER}-profile-assets`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function attempt(label, work, fallback) {
  try {
    return await work();
  } catch (error) {
    warnings.push(`${label}: ${error.message}`);
    return fallback;
  }
}

function languageColor(name) {
  if (LANG_COLORS[name]) return LANG_COLORS[name];

  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 65% 55%)`;
}

/* ------------------------------------------------------------------ */
/* Banner                                                              */
/* ------------------------------------------------------------------ */

function renderBanner(displayName) {
  const name = displayName;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300" role="img" aria-label="Hi there, I am ${escapeXml(name)}">
  <title>Hi there, I am ${escapeXml(name)}</title>
  <defs>
    <linearGradient id="bannerGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0C82F7"/>
      <stop offset="55%" stop-color="#3E92CC"/>
      <stop offset="100%" stop-color="#0F1A2C"/>
      <animate attributeName="x1" values="0;1;0" dur="18s" repeatCount="indefinite"/>
      <animate attributeName="y1" values="0;1;0" dur="18s" repeatCount="indefinite"/>
    </linearGradient>
    <style>
      .title { font-family: ${FONT}; font-size: 86px; font-weight: 700; fill: #ffffff; letter-spacing: 2px; }
      .desc  { font-family: ${FONT}; font-size: 30px; font-weight: 500; fill: #d7e8f8; }
      .glow  { animation: twinkle 4s ease-in-out infinite; }
      @keyframes twinkle {
        0%, 40%, 80%, 100% { opacity: 1; }
        50%, 70% { opacity: 0.55; }
      }
    </style>
  </defs>

  <rect width="1200" height="300" fill="url(#bannerGradient)"/>

  <path d="M0,232 C180,196 360,268 560,238 C760,208 940,262 1200,226 L1200,300 L0,300 Z"
        fill="#0F1A2C" opacity="0.30"/>
  <path d="M0,256 C220,222 420,286 640,258 C860,230 1020,278 1200,252 L1200,300 L0,300 Z"
        fill="#0F1A2C" opacity="0.45"/>

  <g class="glow">
    <text class="title" x="600" y="150" text-anchor="middle">HI THERE!</text>
    <text class="desc" x="600" y="202" text-anchor="middle">I&apos;m ${escapeXml(name)}</text>
  </g>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Typing animation                                                    */
/* ------------------------------------------------------------------ */

function renderTyping(text, { fontSize = 26, charWidth = 16.5 } = {}) {
  const textWidth = Math.ceil(text.length * charWidth);
  const startX = 40;
  const endX = startX + textWidth;
  const height = 70;
  const width = endX + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(text)}">
  <title>${escapeXml(text)}</title>
  <defs>
    <clipPath id="typingReveal">
      <rect x="0" y="0" width="0" height="${height}">
        <animate attributeName="width"
                 values="0;${endX};${endX};0;0"
                 keyTimes="0;0.55;0.85;0.96;1"
                 dur="9s" repeatCount="indefinite"/>
      </rect>
    </clipPath>
    <style>
      .typing { font-family: 'Fira Code','Cascadia Code',Consolas,monospace; font-size: ${fontSize}px; fill: #0C82F7; }
    </style>
  </defs>
  <text class="typing" x="${startX}" y="${Math.round(height / 2) + 8}" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs" clip-path="url(#typingReveal)">${escapeXml(text)}</text>
  <rect x="${startX}" y="${Math.round(height / 2) - 14}" width="3" height="32" fill="#0C82F7">
    <animate attributeName="x"
             values="${startX};${endX};${endX};${startX};${startX}"
             keyTimes="0;0.55;0.85;0.96;1"
             dur="9s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.5;0.5;1;1" dur="1s" repeatCount="indefinite"/>
  </rect>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Stats card                                                          */
/* ------------------------------------------------------------------ */

function renderStats(login, stats) {
  const W = 470;
  const H = 200;
  const colX = [95, 235, 375];
  const cells = stats.slice(0, 6);

  const rows = [0, 1].map((row) => {
    const y = row === 0 ? 95 : 155;
    return cells
      .slice(row * 3, row * 3 + 3)
      .map(
        (cell, index) => `  <text class="num" x="${colX[index]}" y="${y}" text-anchor="middle">${escapeXml(formatNumber(cell.value))}</text>
  <text class="label" x="${colX[index]}" y="${y + 22}" text-anchor="middle">${escapeXml(cell.label)}</text>`,
      )
      .join("\n");
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${escapeXml(login)}">
  <title>GitHub stats for ${escapeXml(login)}</title>
  <style>
    .card  { fill: ${COLORS.bg}; stroke: ${COLORS.border}; }
    .title { font-family: ${FONT}; font-size: 16px; font-weight: 600; fill: ${COLORS.title}; }
    .brand { font-family: ${FONT}; font-size: 11px; font-weight: 600; fill: ${COLORS.label}; }
    .num   { font-family: ${FONT}; font-size: 26px; font-weight: 700; fill: ${COLORS.accent}; }
    .label { font-family: ${FONT}; font-size: 12px; font-weight: 400; fill: ${COLORS.label}; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
  <text class="title" x="24" y="36">GitHub Stats</text>
  <text class="brand" x="${W - 24}" y="36" text-anchor="end">@${escapeXml(login)}</text>
${rows.join("\n")}
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Languages card                                                      */
/* ------------------------------------------------------------------ */

function renderLanguages(languages) {
  const W = 470;
  const H = 200;
  const top = languages.slice(0, 5);
  const total = top.reduce((sum, item) => sum + item.value, 0) || 1;

  const rows = top
    .map((language, index) => {
      const y = 68 + index * 27;
      const percent = (language.value / total) * 100;
      const barWidth = Math.max(3, (percent / 100) * 246);
      const pct = percent >= 10 ? percent.toFixed(1) : percent.toFixed(2);

      return `  <text class="name" x="24" y="${y + 9}">${escapeXml(language.name)}</text>
  <rect class="track" x="150" y="${y}" width="246" height="8" rx="4"/>
  <rect x="150" y="${y}" width="${barWidth.toFixed(1)}" height="8" rx="4" fill="${language.color}"/>
  <text class="pct" x="${W - 24}" y="${y + 9}" text-anchor="end">${pct}%</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
  <title>Most used languages</title>
  <style>
    .card  { fill: ${COLORS.bg}; stroke: ${COLORS.border}; }
    .title { font-family: ${FONT}; font-size: 16px; font-weight: 600; fill: ${COLORS.title}; }
    .name  { font-family: ${FONT}; font-size: 12px; font-weight: 500; fill: ${COLORS.label}; }
    .pct   { font-family: ${FONT}; font-size: 11px; font-weight: 500; fill: ${COLORS.label}; }
    .track { fill: ${COLORS.track}; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
  <text class="title" x="24" y="36">Most Used Languages</text>
${rows}
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Data collection                                                     */
/* ------------------------------------------------------------------ */

async function collect() {
  log(`fetching data for "${USER}"${TOKEN ? " (authenticated)" : " (anonymous)"}`);

  const user = await api(`/users/${USER}`);

  const repos = await attempt(
    "repositories",
    () => api(`/users/${USER}/repos?per_page=100&type=owner&sort=updated`),
    [],
  );

  const pullRequests = await attempt(
    "pull requests",
    () => api(`/search/issues?q=author:${encodeURIComponent(USER)}+type:pr&per_page=1`),
    { total_count: null },
  );

  const issues = await attempt(
    "issues",
    () => api(`/search/issues?q=author:${encodeURIComponent(USER)}+type:issue&per_page=1`),
    { total_count: null },
  );

  const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);

  const languageTotals = new Map();
  const languageSources = [...repos]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, 15);

  for (const repo of languageSources) {
    const data = await attempt(
      `languages ${repo.name}`,
      () => api(`/repos/${USER}/${repo.name}/languages`),
      {},
    );
    for (const [name, bytes] of Object.entries(data)) {
      languageTotals.set(name, (languageTotals.get(name) || 0) + bytes);
    }
  }

  const languages = [...languageTotals.entries()]
    .map(([name, value]) => ({ name, value, color: languageColor(name) }))
    .sort((a, b) => b.value - a.value);

  return {
    displayName: user.name || USER,
    stats: [
      { label: "Repositories", value: user.public_repos },
      { label: "Stars", value: stars },
      { label: "Followers", value: user.followers },
      { label: "Following", value: user.following },
      { label: "Pull requests", value: pullRequests.total_count },
      { label: "Issues", value: issues.total_count },
    ],
    languages,
  };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

mkdirSync(OUT_DIR, { recursive: true });

const { displayName, stats, languages } = await collect();

const files = {
  "banner.svg": renderBanner(displayName),
  "typing.svg": renderTyping("Welcome to my GitHub profile page!"),
  "stats.svg": renderStats(USER, stats),
  "langs.svg": renderLanguages(languages),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(OUT_DIR, name), content, "utf8");
  log(`wrote assets/${name} (${Buffer.byteLength(content)} bytes)`);
}

if (warnings.length) {
  log("\nwarnings:");
  for (const warning of warnings) log(`  - ${warning}`);
}

log(`\nstats: ${stats.map((s) => `${s.label}=${s.value}`).join(", ")}`);
log(`languages: ${languages.slice(0, 5).map((l) => `${l.name}:${l.value}`).join(", ")}`);
