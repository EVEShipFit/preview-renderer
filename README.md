# Preview Renderer

Makes the image shown when an [EVEShip.fit](https://eveship.fit) fit link is shared on Discord, Twitter, etc.

It screenshots the site's `/og?fit=...` page with Playwright, keeping one browser running.

## Usage

```
GET /og.jpg?site=eveship.fit&v=<version>&fit=<fit link>
```

- `site`: `eveship.fit` (default) or `next.eveship.fit`.
- `v`: ignored; changes the URL, and so the cache, per deploy.
- `/?fit=...` is the same, for links from before `/og.jpg`.

Images are cached for a year, fits that don't load for an hour. Cloudflare's cache sits in front.

## Running

```sh
docker compose up -d
```

See [compose.yaml](compose.yaml). The image is `ghcr.io/eveshipfit/preview-renderer:latest`, built on every push to
`main`.

Locally:

```sh
npm ci
npx playwright install --only-shell chromium
npm start
```
