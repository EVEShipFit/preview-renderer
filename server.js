import { createServer } from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT ?? 8080);
const SITES = new Set(["eveship.fit", "next.eveship.fit"]);
const WIDTH = 1200;
const HEIGHT = 630;
const CONCURRENCY = 3;
const QUEUE = 20;
const TIMEOUT = 15_000;

const CACHE_IMAGE = "public, max-age=31536000, immutable";
const CACHE_BROKEN = "public, max-age=3600";
const CACHE_NONE = "no-store";

let browser;
let running = 0;
const waiting = [];
const rendering = new Map();

function launch() {
  if (browser === undefined) {
    browser = chromium.launch({ args: ["--disable-dev-shm-usage"] });
    browser.then(
      (launched) => launched.on("disconnected", () => (browser = undefined)),
      () => (browser = undefined),
    );
  }
  return browser;
}

/** Waits for a free render slot; false when the queue is full. */
async function acquire() {
  if (running < CONCURRENCY) {
    running++;
    return true;
  }
  if (waiting.length >= QUEUE) return false;
  await new Promise((resolve) => waiting.push(resolve));
  return true;
}

function release() {
  const next = waiting.shift();
  if (next === undefined) running--;
  else next();
}

/** A PNG of the OG page of the fit on the site; null when the fit does not load. */
async function render(site, fit) {
  const context = await (await launch()).newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  try {
    const page = await context.newPage();
    const url = new URL(`https://${site}/og`);
    url.searchParams.set("fit", fit);
    await page.goto(url.href, { timeout: TIMEOUT });
    await page
      .locator("body[data-ready]")
      .waitFor({ state: "attached", timeout: TIMEOUT })
      .catch(async (error) => {
        const text = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
        throw new Error(`${page.url()} did not get ready; it shows: ${text.slice(0, 200)}`, { cause: error });
      });
    if ((await page.locator("body").getAttribute("data-ready")) !== "true") return null;
    return await page.screenshot({ type: "png" });
  } finally {
    await context.close();
  }
}

/** The response for the fit on the site, rendered once however often it is asked for at the same time. */
function image(site, fit) {
  const key = `${site} ${fit}`;
  let pending = rendering.get(key);
  if (pending === undefined) {
    pending = renderLimited(site, fit).finally(() => rendering.delete(key));
    rendering.set(key, pending);
  }
  return pending;
}

async function renderLimited(site, fit) {
  if (!(await acquire())) return { status: 503, cache: CACHE_NONE, body: "Too busy." };
  try {
    const png = await render(site, fit);
    if (png === null) return { status: 404, cache: CACHE_BROKEN, body: "This fit could not load." };
    return { status: 200, cache: CACHE_IMAGE, type: "image/png", body: png };
  } catch (error) {
    console.error(error);
    return { status: 503, cache: CACHE_NONE, body: "The image could not be made." };
  } finally {
    release();
  }
}

function send(response, { status, cache, type = "text/plain; charset=utf-8", body }) {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": cache, "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, { status: 405, cache: CACHE_NONE, body: "Method not allowed." });
  }
  const url = URL.parse(request.url, "http://localhost");
  if (url === null) return send(response, { status: 400, cache: CACHE_BROKEN, body: "Invalid request." });
  if (url.pathname === "/healthz") return send(response, { status: 200, cache: CACHE_NONE, body: "OK" });
  if (url.pathname !== "/og.png" && url.pathname !== "/") {
    return send(response, { status: 404, cache: CACHE_BROKEN, body: "Not found." });
  }

  const fit = url.searchParams.get("fit");
  const site = url.searchParams.get("site") ?? "eveship.fit";
  if (!fit || !SITES.has(site)) return send(response, { status: 400, cache: CACHE_BROKEN, body: "Invalid request." });

  send(response, await image(site, fit));
});

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

process.on("SIGTERM", async () => {
  server.close();
  await (await browser?.catch(() => undefined))?.close();
  process.exit(0);
});
