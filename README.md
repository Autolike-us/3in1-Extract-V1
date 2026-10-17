# Aurora Extract (3in1-Extract-V1)

Free Chrome extension (Manifest V3) that extracts **public** data from **Facebook, Instagram and TikTok**
into CSV / Excel / JSON and bundles photos & videos into ZIPs. Everything runs locally in the browser —
no server, no account, no tracking. A tasteful "Automate it" tab advertises the paid
[Aurora Studios](https://getaurorastudios.com/) automation extensions.

## What it collects
| | Facebook | Instagram | TikTok |
|---|---|---|---|
| Profile / page + public contacts | ✅ | ✅ | ✅ |
| Posts / videos (+ media) | ✅ | ✅ | ✅ |
| Comments | ✅ | ✅ | ✅ |
| Group members | ✅ | – | – |
| Marketplace listings / listing detail | ✅ | – | – |
| Followers / following | – | ✅ | ✅ (list popup) |
| Hashtags | – | ✅ | ✅ |

> Status: **v0.1 scaffold** — framework, UI, exports and first-pass extractors are complete and tested
> against fixtures. Selectors/endpoints are being hardened with real page samples (see
> [docs/COLLECT-SAMPLES.md](docs/COLLECT-SAMPLES.md)).

## Layout
- `core/` — dependency-free ZIP writer, CSV / JSON / XLSX exporters.
- `content/` — `common.js` toolkit, `boot.js` message bridge, one extractor module per platform
  (`facebook.js`, `instagram.js`, `tiktok.js`) registering `detect()` + `tasks`.
- `background.js` — run bookkeeping (chrome.storage.local), CDN Referer rules for media downloads.
- `dashboard.*`, `popup.*`, `style.css`, `catalog.js` — UI.
- `tests/` — `npm test` (core + extractor fixtures), `npm run test:ui` (dashboard/popup screenshots in `tests/out/`),
  `node tests/extension_smoke.cjs` (real Chromium + unpacked extension).

## Develop
```
chrome://extensions → Developer mode → Load unpacked → this folder
npm test && npm run test:ui
npm run package      # dist/aurora-extract-<version>.zip
```

## Chrome Web Store
`store/LISTING.md` has everything to paste into the Developer Dashboard (listing text, single purpose, permission justifications, privacy answers, reviewer test steps, checklist). `node store/make-assets.cjs` regenerates the screenshots from the real dashboard with fictional sample data.

## Principles
Only data the logged-in user can already see · paced requests (Gentle / Normal / Fast) · local storage only ·
public contact details only · user is responsible for platform terms and privacy / marketing law.
