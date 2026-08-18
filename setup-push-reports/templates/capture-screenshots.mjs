#!/usr/bin/env node
/**
 * Capture this project's pages and upload them to the dashboard.
 *
 * Run by the `screenshots` job in .github/workflows/report.yml, against an app
 * the job has already started. Reads docs/screenshots.config.json and does
 * nothing at all when that file is absent — which is the correct behaviour for
 * a library, a CLI, or anything else without pages.
 *
 * Why here and not on a developer's machine: screenshots that depend on someone
 * remembering to retake them are stale by default. CI retakes them on every
 * push to the default branch, so what the dashboard shows is what the code
 * currently renders.
 *
 * Why the images are never committed: git keeps every version of a binary
 * forever and PNGs do not delta-compress, so committing a megabyte per push
 * grows the repository without bound. Only the config is committed.
 *
 * Secrets are named, never inlined: the config holds the NAME of an environment
 * variable, and the value comes from a repo secret at run time. A config file
 * with a password in it would be committed by definition.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const CONFIG_PATH = "docs/screenshots.config.json";
const MAX_IMAGES = 12;
const MAX_BYTES_EACH = 2_000_000;
const MAX_BYTES_TOTAL = 10_000_000;

/** Never fail the build. Say what happened and leave. */
function bail(message) {
  console.log(message);
  process.exit(0);
}

if (!existsSync(CONFIG_PATH)) {
  bail(`No ${CONFIG_PATH} — nothing to capture.`);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
} catch (error) {
  bail(`::warning::${CONFIG_PATH} is not valid JSON (${error.message}) — skipping.`);
}

const pages = Array.isArray(config.pages) ? config.pages : [];
if (pages.length === 0) bail(`${CONFIG_PATH} lists no pages — nothing to capture.`);

const dashboardUrl = (process.env.DASHBOARD_URL || "").replace(/\/$/, "");
const reportToken = process.env.REPORT_TOKEN || "";
const repo = process.env.GITHUB_REPOSITORY || "";
if (!dashboardUrl || !reportToken) {
  bail("::warning::DASHBOARD_URL or REPORT_TOKEN is not set — skipping capture.");
}

const port = config.port ?? 3000;
const baseUrl = (config.baseUrl || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const viewport = config.viewport ?? { width: 1440, height: 900 };
const settleMs = config.waitMs ?? 400;

/** Look up a secret by the name the config gives, not by value. */
function secret(envName, label) {
  const value = process.env[envName];
  if (!value) {
    console.log(`::warning::${label} names ${envName}, which is not set. Continuing without it.`);
    return null;
  }
  return value;
}

/**
 * Resolve Playwright without touching the project's own dependencies.
 *
 * `npm i -g playwright` does NOT make `import("playwright")` work: a global
 * install is not on the module resolution path for a script living in the
 * repository. So the job installs it into its own directory and names it in
 * PLAYWRIGHT_DIR, and a project that already depends on Playwright is used
 * as-is via the bare specifier.
 */
async function loadPlaywright() {
  const dir = process.env.PLAYWRIGHT_DIR;
  if (dir) {
    try {
      // require, not import: Playwright ships CommonJS, and importing its entry
      // by file URL yields a namespace whose named exports are not detected —
      // `chromium` comes back undefined rather than failing loudly.
      const require = createRequire(pathToFileURL(join(dir, "package.json")).href);
      return require("playwright");
    } catch (error) {
      console.log(`::warning::Could not load Playwright from ${dir}: ${error.message}`);
    }
  }
  const mod = await import("playwright");
  return mod.chromium ? mod : mod.default;
}

let chromium;
try {
  ({ chromium } = await loadPlaywright());
} catch (error) {
  bail(`::warning::Playwright is not available (${error.message}) — skipping capture.`);
}
if (!chromium) bail("::warning::Playwright loaded but exposed no browser — skipping capture.");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport });

// Authentication, when the interesting pages are behind a login. Both forms are
// optional; a public site needs neither.
const auth = config.auth ?? {};
if (auth.cookie?.name && auth.cookie?.valueEnv) {
  const value = secret(auth.cookie.valueEnv, "auth.cookie");
  if (value) {
    await context.addCookies([
      {
        name: auth.cookie.name,
        value,
        url: auth.cookie.url || baseUrl,
      },
    ]);
    console.log(`Applied cookie ${auth.cookie.name}.`);
  }
}

const shots = [];
let total = 0;

// A page marked `"signedOut": true` is captured in a second, never-authenticated
// context. Without this a sign-in screen is impossible to photograph: once the
// session exists the app redirects away from it, and the file quietly contains
// whatever it redirected to — a wrong screenshot that looks like a right one.
const anonContext = await browser.newContext({ viewport });

try {
  const page = await context.newPage();
  const anonPage = await anonContext.newPage();

  if (auth.login?.path && auth.login?.fields) {
    try {
      await page.goto(`${baseUrl}${auth.login.path}`, { waitUntil: "domcontentloaded" });
      for (const [selector, envName] of Object.entries(auth.login.fields)) {
        const value = secret(envName, `auth.login.fields["${selector}"]`);
        if (value) await page.fill(selector, value);
      }
      await page.click(auth.login.submit || 'button[type="submit"]');
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      console.log(`Signed in via ${auth.login.path}.`);
    } catch (error) {
      // A failed login still leaves the public pages worth capturing.
      console.log(`::warning::Login failed (${error.message}) — capturing as a signed-out visitor.`);
    }
  }

  for (const entry of pages.slice(0, MAX_IMAGES)) {
    if (!entry?.name || !entry?.path) {
      console.log("::warning::Skipping a page entry without both name and path.");
      continue;
    }
    const name = String(entry.name).replace(/[^A-Za-z0-9._-]/g, "-");
    const filename = name.endsWith(".png") ? name : `${name}.png`;

    const target = entry.signedOut ? anonPage : page;

    try {
      await target.goto(`${baseUrl}${entry.path}`, {
        waitUntil: entry.waitUntil || "networkidle",
        timeout: 30_000,
      });
      if (entry.waitFor) await target.waitForSelector(entry.waitFor, { timeout: 15_000 });
      await target.waitForTimeout(entry.waitMs ?? settleMs);

      const buffer = await target.screenshot({ fullPage: entry.fullPage ?? false });

      if (buffer.byteLength > MAX_BYTES_EACH) {
        console.log(`::warning::${filename} is ${buffer.byteLength} bytes — over 2 MB, skipped.`);
        continue;
      }
      if (total + buffer.byteLength > MAX_BYTES_TOTAL) {
        console.log("::notice::Reached the 10 MB total — stopping here.");
        break;
      }

      shots.push({
        filename,
        content_type: "image/png",
        data: buffer.toString("base64"),
      });
      total += buffer.byteLength;
      console.log(
        `Captured ${filename} (${buffer.byteLength} bytes) from ${entry.path}` +
          (entry.signedOut ? " [signed out]" : ""),
      );
    } catch (error) {
      // One unreachable page must not cost the others.
      console.log(`::warning::Could not capture ${entry.path}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

if (shots.length === 0) {
  // Deliberately not uploading an empty set here. An empty upload means "this
  // project has no screens", and a run where every capture failed is not that —
  // it would wipe good images because the app happened not to start.
  bail("::warning::Nothing was captured — leaving the dashboard's existing screenshots alone.");
}

const response = await fetch(`${dashboardUrl}/api/screenshots`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${reportToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ repo, commit: process.env.GITHUB_SHA, screenshots: shots }),
});

if (response.ok) {
  console.log(`Uploaded ${shots.length} screenshot(s), ${total} bytes (HTTP ${response.status}).`);
} else {
  const detail = await response.text().catch(() => "");
  console.log(`::warning::Upload failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
}
