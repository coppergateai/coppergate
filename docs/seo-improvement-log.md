# SEO improvement log

Concise record of verified issues, shipped fixes, and remaining opportunities.
Do not invent rankings, traffic, or Search Console metrics here.

## 2026-10-24

### Verified (production HTML)

| Issue | Severity | Evidence |
| --- | --- | --- |
| Homepage SERP title poisoned as `GitHub` | Critical | First `<title>` in streamed HTML came from SVG logo `<title>` tags; real document title streamed late after ~96 SVG titles |
| Document metadata often after `</head>` on dynamic marketing pages | High | `/`, `/docs`, `/security` had empty head titles; caused by `cookies()` via `SiteChrome` / `currentUser` blocking the stream |
| Child routes missing `og:image`; Twitter cards used root title/description | High | `/blog` had correct `og:title` but root `twitter:title`/`twitter:description`; no `og:image` |
| `robots.txt` Host included `https://` | Medium | `Host: https://www.coppergate.ai` (Yandex expects hostname only) |
| `/workspaces` (no trailing slash) not disallowed | Medium | Only `/workspaces/` was listed |
| Trust pages lacked BreadcrumbList JSON-LD | Low | `/security`, `/changelog`, `/privacy`, `/terms` |

### Implemented

- Decorative integration SVGs: removed SVG `<title>`; `aria-hidden` marks only
- `SiteChrome` + homepage auth CTAs wrapped in `Suspense` so metadata can flush early
- Root metadata: stop hardcoding OG/Twitter title/description; set explicit share images
- Shared `lib/seo.ts` for site copy, public routes, robots disallow, absolute URLs
- Robots: hostname-only Host; disallow `/workspaces` and `/workspaces/`
- Sitemap driven by `PUBLIC_STATIC_ROUTES`
- Breadcrumb JSON-LD on security, changelog, privacy, terms
- `public/llms.txt` for AI/search crawler discoverability
- Automated checks in `apps/web/src/lib/seo.test.ts`

### Validation

- Unit: `pnpm --filter @coppergate/web test` (seo + existing blog tests)
- Local/dev: confirm homepage first `<title>` is Coppergate; `/robots.txt` Host without scheme; sitemap paths; logos emit no `<title>`

### Remaining (needs deploy or external data)

- Redeploy production to clear live title/OG issues
- Confirm Google Search Console property + sitemap submission (`docs/seo.md`)
- Hypothesis: after deploy, URL Inspection on `/` should show Coppergate title and FAQ eligibility
- Content: improve thin pages before adding new keyword pages; no fabricated claims

## 2026-10-24 — production deploy

Deployed via `main` → Vercel production (`coppergate-hd68yukub`, Ready).

### Post-deploy checks (live HTML)

| Check | Result |
| --- | --- |
| Homepage first `<title>` | `Coppergate — Set a budget. Agents war. Survivors ship.` (was `GitHub`) |
| SVG `<title>` pollution | Gone — single document title |
| `robots.txt` Host | `www.coppergate.ai` (hostname only) |
| Disallow `/workspaces` | Present |
| `/llms.txt` | 200 |
| `/blog` twitter:title | `Blog · Coppergate` (page-specific) |

Note: homepage metadata can still stream after `</head>` under dynamic auth; with SVG titles removed the first title is correct. Child `og:image` inheritance still worth a follow-up if social debuggers miss the card.

## 2026-10-24 — round 2 (code)

### Verified remaining (production)

| Issue | Severity | Evidence |
| --- | --- | --- |
| Duplicate homepage `<h1>` | High | Suspense fallback + resolved `HeroSection` both in HTML stream |
| Child routes missing `og:image` | High | `/blog`+docs had twitter:image only; shallow `openGraph: { url }` dropped images |
| Metadata after `</head>` on SiteChrome pages | Medium | Cookie auth in marketing chrome forced dynamic streaming |

### Implemented

- Static marketing chrome: session CTAs via client cookie detect (`HostedCtaLink` / header) — no `cookies()` on public shell
- Homepage hero/final CTA no longer Suspense-wrapped (single H1 in HTML)
- `publicPageMetadata()` helper always sets canonical + OG/Twitter images; applied across public routes + blog posts

### Remaining

- Deploy to confirm title-in-head + og:image on child routes
- Search Console sitemap / URL inspection (ops)

## 2026-10-24 — round 3 (code)

### Verified

| Issue | Severity | Evidence |
| --- | --- | --- |
| Blog posts thin (~330 words) + weak cross-links | Medium | Live word counts; few internal links between posts |
| Blog Article JSON-LD missing `image` | Low | Schema incomplete for share/rich results |
| Blog index lacked CollectionPage/ItemList | Low | Index only had BreadcrumbList |
| `llms.txt` omitted individual post URLs | Low | AI crawlers could miss post entry points |

### Implemented

- Expanded three blog posts with accurate product detail + related-post links (no invented claims)
- Article JSON-LD `image` → site OG image; blog index CollectionPage + ItemList
- Related posts block on post pages; Blog link in docs nav
- `llms.txt` lists each published post; SoftwareApplication description aligned with `SITE_DESCRIPTION`

### Remaining

- Deploy rounds 2–3 together
- Search Console verification / sitemap submit (ops)

## 2026-10-25 — round 4 (Open Program Runtime SEO)

### Verified

| Issue | Severity | Evidence |
| --- | --- | --- |
| `/docs/open-program-runtime` missing from sitemap + `llms.txt` | High | Page + docs nav exist in code (`1c29ac0`); `PUBLIC_STATIC_ROUTES` omitted it |
| Production still on pre-OPR HTML; OPR 404 live | Critical (ops) | Live title still “Agents compete”; `/docs/open-program-runtime` → 404; latest Vercel prod Error (~843ms) while Ready alias lagged |
| Docs index lacked CollectionPage/ItemList | Low | Only BreadcrumbList on `/docs` |
| OPR page lacked article-class JSON-LD | Low | Breadcrumb only |
| Child Twitter cards relied on title inheritance only | Medium | `publicPageMetadata` set `twitter.images` but not title/description |
| `llms.txt` still “Agents compete” after product reposition | Medium | Stale vs `SITE_TITLE` / hero |

### Implemented

- Add `/docs/open-program-runtime` to `PUBLIC_STATIC_ROUTES` (priority 0.7)
- Align `public/llms.txt` with Autonomy under contract + OPR URL
- Docs index CollectionPage + ItemList; OPR TechArticle JSON-LD
- Explicit Twitter title/description in `publicPageMetadata`
- SoftwareApplication `featureList`; layout keywords for OPR / Ship Receipt
- Blog post CTA → OPR; blog meta mentions Open Program Runtime
- Tests: OPR in sitemap, docs-nav ↔ sitemap sync, `llms.txt` positioning

### Validation

- `pnpm --filter @coppergate/web exec node --import tsx --test src/lib/seo.test.ts`

### Remaining

- **Deploy** so live title/H1/OPR/sitemap/`llms.txt` match `main` (do not ship without auth)
- Investigate Vercel prod Error deploys blocking OPR roll-out
- Search Console sitemap re-submit + URL Inspection for `/` and `/docs/open-program-runtime` after Ready
