# Hosted Coppergate Playwright checks

Login once locally, then re-run checks against [coppergate.ai](https://www.coppergate.ai/) and GitHub PRs.

## Setup

Requires **Google Chrome** installed (default). Bundled Chromium: `PW_CHANNEL=chromium pnpm e2e:install`.

```bash
cd coppergate
pnpm e2e:install
cp e2e/.env.example e2e/.env   # optional; login writes CG_PROJECT_URL
```

## 1) You login (headed browser)

```bash
pnpm e2e:login
```

Complete GitHub/GitLab sign-in, open the project you care about, press **Enter** in the terminal. Cookies land in `e2e/.auth/user.json` (gitignored).

## 2) Agent / CI check

```bash
pnpm e2e:check
```

Writes:

- `e2e/.auth/last-check.md` — human summary
- `e2e/.auth/last-check.json` — full tab text + PR lists

Checks:

- Session still valid on the project URL
- Delivery + Agents tabs render
- Coppergate `/api/projects/:id/pulls`
- GitHub open + recent closed/merged PRs (`GITHUB_REPO`, default `kprompt/kprompt-website`)

## Env

See `.env.example`. Public repos work without `GITHUB_TOKEN`; private repos need a token with `repo` read.
