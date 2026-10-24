# SEO ops checklist

English-only public surface (`https://www.coppergate.ai`). App/auth routes are `noindex` and listed in `robots.txt` disallow.

## Production env

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Must be `https://www.coppergate.ai` (no trailing slash). Drives `metadataBase`, sitemap, robots `host`, JSON-LD. |
| `GOOGLE_SITE_VERIFICATION` | Optional. Google Search Console HTML-tag token (content value only). |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 override (code default exists). |

## Google Search Console

1. Add a URL-prefix property for `https://www.coppergate.ai`.
2. Verify via HTML tag: set `GOOGLE_SITE_VERIFICATION` to the meta content token and redeploy, **or** use DNS TXT.
3. Submit sitemap: `https://www.coppergate.ai/sitemap.xml`.
4. URL Inspection for `/` and one `/docs/*` page — confirm self-canonical, title (single `· Coppergate`), and FAQ rich-result eligibility on home.
5. Optional: Bing Webmaster Tools → import from GSC or submit the same sitemap.

## Local checks

- `/robots.txt` — disallow includes `/workspaces/`, `/login`, `/profile`, `/share/`, `/ops/`.
- `/sitemap.xml` — home, docs, trust pages, published blog posts only.
- `/manifest.webmanifest` — app name + icons.
- View-source: home has Organization / WebSite / SoftwareApplication / FAQPage JSON-LD; docs/blog have BreadcrumbList (and Article on posts).

## Content

Blog posts live in `apps/web/content/blog/*.md` (frontmatter: `title`, `description`, `date`, `slug`, optional `draft: true`).
