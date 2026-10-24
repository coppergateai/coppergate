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
