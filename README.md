# Preview Renderer

When someone shares an [EVEShip.fit](https://eveship.fit) fit link on Discord, Twitter, Slack, etc., those sites show
an image of the fit next to the link. This server makes that image.

## How does it work?

1. A fit link (`https://eveship.fit/?fit=...`) is shared.
2. The site's Worker adds an `og:image` tag to the page, pointing to this server:
   `https://preview.eveship.fit/og.png?site=eveship.fit&v=<version>&fit=...`.
3. Cloudflare's cache sits in front of this server. If the image was made before, it is served from there.
4. Otherwise this server opens `https://<site>/og?fit=...` in a headless Chromium, waits until the page sets
   `data-ready` on its `<body>`, and returns a 1200×630 PNG screenshot of it.

The `/og` page is part of [EVEShip.fit](https://github.com/EVEShipFit/eveship.fit) itself, so the image always
matches the site.

## Requests

```
GET /og.png?site=<site>&v=<version>&fit=<fit link>
```

| Parameter | Meaning |
| --------- | ------- |
| `site` | `eveship.fit` (default) or `next.eveship.fit`. Other sites are refused. |
| `v` | Not used by the server. The site puts its version here, so each deploy gets fresh images from the cache. |
| `fit` | The fit link, as in `?fit=` on the site. |

`GET /?fit=...` does the same for `eveship.fit`. Older links used that URL, and Discord and others still have it
cached.

`GET /healthz` returns `OK` while the server is running.

## Responses

| Status | When | Cached for |
| ------ | ---- | ---------- |
| 200 | The image of the fit. | A year. |
| 400 | No `fit`, or an unknown `site`. | An hour. |
| 404 | The fit does not load. | An hour. |
| 503 | Too busy, or the browser failed. | Not cached; the next request tries again. |

## Limits

- One browser keeps running; each image gets its own fresh browser context.
- At most 3 images are made at the same time. Up to 20 more wait in a queue; beyond that, the server returns 503.
- When the same fit is asked for while it is being made, all requests get that one image.

## Running

The image is `ghcr.io/eveshipfit/preview-renderer:latest` (amd64 and arm64), built and published on every push to
`main`.

```sh
docker compose up -d
```

See [compose.yaml](compose.yaml). The server listens on port 8080 (`PORT` changes it).

Put Cloudflare in front of it (a proxied DNS record), with a Cache Rule that makes the hostname eligible for cache.
The server's `Cache-Control` headers decide how long images stay there.

## Development

Needs Node.js 24 or newer.

```sh
npm ci
npx playwright install --only-shell chromium
npm start
```

Then open `http://localhost:8080/og.png?fit=esf1:CgUIARDLBA`.
