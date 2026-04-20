import path from "node:path";
import { mkdir, readdir, stat, access } from "node:fs/promises";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

function getArg(name, fallback) {
  const match = process.argv.find(a => a.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
}

const theme = getArg("theme", "dark");
const outDir = path.resolve(process.cwd(), getArg("out", "screenshots"));
const rootDir = path.resolve(process.cwd());
const zipArg = getArg("zip", null);
const nirxDirArg = getArg("nirx-dir", null);
const expandArg = getArg("expand", "");

await mkdir(outDir, { recursive: true });

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findLatestZip(dir) {
  const names = await readdir(dir);
  const zips = names.filter(n => n.toLowerCase().endsWith(".zip"));
  if (!zips.length) return null;

  const files = await Promise.all(
    zips.map(async (name) => {
      const full = path.join(dir, name);
      const s = await stat(full);
      return { full, mtimeMs: s.mtimeMs };
    })
  );

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0].full;
}

async function resolveZipPath() {
  if (zipArg) return path.resolve(process.cwd(), zipArg);

  const candidates = [];
  if (nirxDirArg) {
    candidates.push(path.resolve(process.cwd(), nirxDirArg));
  } else {
    candidates.push(path.resolve(process.cwd(), "..", "NIRx"));
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, "Desktop", "NIRx"));
    }
  }

  for (const dir of candidates) {
    if (!(await exists(dir))) continue;
    const latest = await findLatestZip(dir);
    if (latest) return latest;
  }

  return null;
}

const zipPath = await resolveZipPath();
const expandSections = expandArg
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
if (zipPath) {
  console.log(`Using ZIP: ${zipPath}`);
} else {
  console.log("No ZIP found. Capturing unloaded UI.");
}

const { server, url } = await startStaticServer({ rootDir, port: 4173 });
const browser = await chromium.launch({ headless: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");

try {
  const targets = [{ name: "desktop", viewport: { width: 1440, height: 900 } }];

  for (const t of targets) {
    const context = await browser.newContext({ viewport: t.viewport });
    await context.addInitScript((selectedTheme) => {
      localStorage.setItem("fnirs-webpipe-theme", selectedTheme);
    }, theme);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    if (zipPath) {
      await page.setInputFiles("#input", zipPath);
      await page.waitForSelector("#controls:not(.hidden)", { timeout: 45000 });
      await page.waitForTimeout(1200);
      if (expandSections.length) {
        await page.evaluate((titles) => {
          const wanted = new Set(titles);
          const details = Array.from(document.querySelectorAll("#controls details"));
          details.forEach(detail => {
            const summary = detail.querySelector("summary");
            const title = summary ? summary.textContent.trim().toLowerCase() : "";
            if (wanted.has(title)) detail.open = true;
          });
        }, expandSections);
        await page.waitForTimeout(250);
      }
    }

    const fileTs = path.join(outDir, `ui-${theme}-${t.name}-${ts}.png`);
    const fileLatest = path.join(outDir, `ui-${theme}-${t.name}.png`);
    await page.screenshot({ path: fileTs, fullPage: true });
    await page.screenshot({ path: fileLatest, fullPage: true });
    console.log(`Saved ${fileTs}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
