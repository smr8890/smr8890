#!/usr/bin/env node
/**
 * Snapshot the four profile images into ./assets as static SVG files.
 *
 * Every response is validated before it is allowed to replace the existing
 * file. If a service is down, rate limited, or returns an error page, the
 * previous (good) image is kept untouched and the run fails loudly.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("assets");
const TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;

const TARGETS = [
  {
    name: "banner.svg",
    url:
      "https://capsule-render.vercel.app/api?type=waving&color=timeGradient" +
      "&height=300&&section=header&text=HI%20THERE!&fontSize=90&fontAlign=50" +
      "&fontAlignY=30&desc=I%27m%20smr&descAlign=50&descSize=30&descAlignY=60" +
      "&animation=twinkling",
    minBytes: 1_500,
    maxBytes: 80_000,
    markers: ["HI THERE!", "stop-color", "@keyframes"],
  },
  {
    name: "typing.svg",
    url:
      "https://readme-typing-svg.demolab.com?font=Fira%20Code&size=25&pause=1000" +
      "&color=0C82F7&center=true&vCenter=true&random=false&width=600" +
      "&lines=Welcome+to+my+GitHub+profile+page!",
    minBytes: 3_000,
    maxBytes: 200_000,
    markers: ["<animate", "Welcome to my GitHub profile page!"],
  },
  {
    name: "stats.svg",
    url:
      "https://github-stats-extended.vercel.app/api?username=smr8890" +
      "&theme=default&show_icons=true&hide_border=true&count_private=true",
    minBytes: 4_000,
    maxBytes: 200_000,
    markers: ["GitHub Stats", "<svg"],
  },
  {
    name: "langs.svg",
    url:
      "https://github-stats-extended.vercel.app/api/top-langs/?username=smr8890" +
      "&hide_border=true",
    minBytes: 3_000,
    maxBytes: 200_000,
    markers: ["Most Used Languages", "lang-progress"],
  },
];

const ERROR_MARKERS = [
  "something went wrong",
  "could not fetch",
  "unable to fetch",
  "rate limit",
  "too many requests",
  "internal server error",
  "error occurred",
  "<html",
  "parsererror",
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchSvg(url) {
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "smr8890-profile-snapshot",
          Accept: "image/svg+xml,image/*;q=0.9,*/*;q=0.5",
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();

      if (!contentType.includes("svg") && !body.trimStart().startsWith("<svg")) {
        throw new Error(`unexpected content-type: ${contentType || "(none)"}`);
      }

      return body;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(2_000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function validate(svg, target, previous) {
  const problems = [];
  const trimmed = svg.trim();
  const bytes = Buffer.byteLength(svg);

  if (!trimmed.startsWith("<!--") && !trimmed.startsWith("<svg")) {
    problems.push("body does not start with <svg>");
  }
  if (!trimmed.endsWith("</svg>")) {
    problems.push("body does not end with </svg> (truncated?)");
  }

  const opens = (svg.match(/<svg\b/g) || []).length;
  const closes = (svg.match(/<\/svg>/g) || []).length;
  if (opens === 0 || opens !== closes) {
    problems.push(`unbalanced <svg> tags (${opens} open / ${closes} close)`);
  }

  const lower = svg.toLowerCase();
  for (const marker of ERROR_MARKERS) {
    if (lower.includes(marker)) problems.push(`contains error text "${marker}"`);
  }

  for (const marker of target.markers) {
    if (!svg.includes(marker)) problems.push(`missing expected content "${marker}"`);
  }

  if (bytes < target.minBytes) problems.push(`too small (${bytes} < ${target.minBytes} bytes)`);
  if (bytes > target.maxBytes) problems.push(`too large (${bytes} > ${target.maxBytes} bytes)`);

  if (previous) {
    const before = Buffer.byteLength(previous);
    if (bytes < before * 0.6) {
      problems.push(`shrank unexpectedly (${bytes} vs previous ${before} bytes)`);
    }
  }

  return problems;
}

mkdirSync(OUT_DIR, { recursive: true });

const results = [];

for (const target of TARGETS) {
  const destination = resolve(OUT_DIR, target.name);
  const previous = existsSync(destination) ? readFileSync(destination, "utf8") : null;

  try {
    const body = await fetchSvg(target.url);
    const problems = validate(body, target, previous);

    if (problems.length > 0) {
      results.push({ name: target.name, status: "REJECTED", detail: problems.join("; ") });
      continue;
    }

    if (previous === body) {
      results.push({ name: target.name, status: "UNCHANGED", detail: `${Buffer.byteLength(body)} bytes` });
      continue;
    }

    const temporary = resolve(OUT_DIR, `.${target.name}.tmp`);
    writeFileSync(temporary, body, "utf8");
    renameSync(temporary, destination);

    results.push({
      name: target.name,
      status: previous ? "UPDATED" : "CREATED",
      detail: previous
        ? `${Buffer.byteLength(previous)} -> ${Buffer.byteLength(body)} bytes`
        : `${Buffer.byteLength(body)} bytes`,
    });
  } catch (error) {
    results.push({ name: target.name, status: "FAILED", detail: error.message });
  }
}

console.log("");
for (const result of results) {
  console.log(`${result.status.padEnd(9)} ${result.name.padEnd(12)} ${result.detail}`);
}

const failed = results.filter((result) => result.status === "FAILED" || result.status === "REJECTED");
if (failed.length > 0) {
  console.log(`\n${failed.length} image(s) were not updated; previous files were kept.`);
  process.exitCode = 1;
} else {
  console.log("\nAll images validated successfully.");
}
