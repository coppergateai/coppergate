# Coppergate — Sayfa Özeti

Web uygulamasındaki (`apps/web`) route’ların sayfa sayfa özeti. Auth gerektiren sayfalar giriş yoksa `/login`’e yönlendirir.

---

## Genel / pazarlama

### `/` — Landing
- Hero, Arena preview, Survivor workflow, evidence / fitness / signal adapters / security bölümleri
- Pilot projeler, FAQ, final CTA
- Giriş durumuna göre CTA değişir; funnel beacon + JSON-LD

### `/login` — Giriş
- GitHub / GitLab OAuth butonları (yapılandırılmışsa)
- Sadece identity scope; repo erişimi sonra App install ile
- Zaten girişliyse → `/workspaces`

### `/changelog` — Changelog
- Tarihli release notları (billing, signal adapters, Arena thesis, marketing, product core)
- GitHub + contact linkleri

### `/security` — Güvenlik
- Fitness gate, GitHub identity vs App, evidence before merge
- Least privilege, spend caps, kill-switch anlatımı

### `/privacy` — Gizlilik
- Toplanan veri (waitlist, hesap, ürün verisi), saklama, iletişim

### `/terms` — Kullanım şartları
- Private beta, hesap sorumluluğu, kabul edilebilir kullanım

---

## Docs

### `/docs` — Docs index
- Desteklenen stack, limitations, pricing, recovery, security link listesi
- Self-host + GitHub linkleri

### `/docs/supported-stack`
- `nextjs_ts` template, stack detection (node/go/rust/python/…)
- Auth (GitHub/GitLab), delivery (PR/MR only), signals, fitness, agent tipleri

### `/docs/limitations`
- Wedge limitleri (N≤2 contest, brief/plan gates, soft-delete, …)
- Explicit non-goals (HITL studio, unattended prod, training on private code, …)

### `/docs/pricing`
- MIT self-host $0; opsiyonel Hosted Starter/Pro (`HOSTED_PLANS`)

### `/docs/recovery`
- Issue → PR one-session path
- CI / validation / budget / agent error / stale RUNNING / kill-switch recovery adımları

---

## Hesap

### `/profile` — Profil
- Avatar, display name düzenleme, auth provider meta
- Last login / member since
- Workspace listesi + settings kısayolları, logout

### `/workspaces` — Workspace listesi
- Kartlar: rol, proje / bekleyen karar / sağlık, durum
- Filtre (all / owned / shared / archived), arama, list/grid
- Yeni workspace oluşturma (invite gerekebilir)
- Kart linki → workspace Overview (Mission Control)

---

## Workspace (`/workspaces/[id]/…`)

Layout: AppChrome sidebar — **Overview**, Projects, Arena, Inbox, Activity, Settings.
Varsayılan app teması: **light** (toggle ile dark).

### `/workspaces/[id]` — Mission Control (Overview)
- Metrikler: Active runs, Needs approval, Verified PRs (ay), Budget used/cap
- Needs your attention: pending approvals, budget paused, REVIEW_REQUIRED
- Active executions: in-flight tasks / arena lanes + CTA
- İlk 10 sn’de müdahale gereken iş görünür

### `/workspaces/[id]/projects` — Projeler
- Workspace hero, maintainer KPI’lar, arama/filtre (Ready/Setup/Unbound)
- Unbound repos + bind / create project
- Boş workspace: tek checklist — Connect → Bind → Budget → First verified PR

### `/workspaces/[id]/projects/[projectId]` — Proje detay
Sekmeler (`?tab=`):

| Tab | İçerik |
|-----|--------|
| **overview** | Next action (Issue→PR), budget, cost, Issues, brief, Pulls |
| **delivery** | Plan (milestones/tasks), Delivery board |
| **arena** | Arena panel (Start–Stop loop) |
| **evidence** | Delivery listesi → task Evidence / Accept (v1 stub) |
| **configuration** | Maintainer, multi-repo, policy presets, merge (`?tab=more` alias) |

Header: repo, stack, autonomy, budget, pending approvals, last run status.

Ürün kavramları: [PRODUCT_CONCEPTS.md](./PRODUCT_CONCEPTS.md).

### `/workspaces/[id]/projects/[projectId]/tasks/[taskId]` — Task detay
- Task meta (goal, scope, status, attempts, PR)
- Owner aksiyonları: Cancel, Retry, Accept → Done (CI/evidence gate)
- Delivery for review: diff summary, CI checks, delivery report, review findings
- Share redacted report (public token)
- Runs & cost, event log, artifacts
- Tournament panel (contender contest)

### `/workspaces/[id]/arena` — Workspace Arena
- Tüm projelerde canlı / stopped arena snapshot
- Contender lane’ler (strategy, temperament, budget, last run)
- Owner: arena start/stop (kill-switch)
- `?focus=` ile proje odaklama

### `/workspaces/[id]/inbox` — Inbox
- Pending / brief / task / recent sekmeleri
- Approval seçimi (`?a=`), owner approve/reject
- Yakın zamanda karar verilenler

### `/workspaces/[id]/activity` — Activity
- Audit event feed (brief/task/run/signal/merge/arena/…)
- Ardışık aynı action gruplama
- Proje/task/settings deep-link

### `/workspaces/[id]/settings` — Settings
Sekmeler (`?tab=`):

| Tab | İçerik |
|-----|--------|
| **connections** | GitHub App / GitLab SCM bağlama, repo seçimi |
| **general** | Workspace adı, autonomy default, proje budget pool, (dev) demo seed |
| **billing** | Hosted Stripe Checkout / portal |
| **signals** | Signal adapters + Slack/Teams/Discord notify |
| **llm** | BYOK keys, Agents routing, MCP |
| **analytics** | Cost explorer + analytics |
| **danger** | Workspace silme |

---

## Paylaşım & ops

### `/share/r/[token]` — Public delivery share
- Redacted delivery report (JSON)
- Geçersiz/expire token → Unavailable

### `/ops/health` — Health
- `/api/health` özeti: DB, migrate, APP_URL, GitHub App / GitLab yapılandırması
- Self-host operasyon kontrolü

---

## Hızlı rota haritası

```
/                          Landing
/login                     Auth
/changelog                 Release notes
/security /privacy /terms  Trust & legal
/docs/*                    Documentation
/profile                   Account
/workspaces                Workspace picker
/workspaces/[id]           Mission Control (Overview)
/workspaces/[id]/projects  Project list
/workspaces/[id]/projects/[projectId]           Project (tabs)
/workspaces/[id]/projects/[projectId]/tasks/[taskId]  Task + Accept
/workspaces/[id]/arena     Arena spectacle
/workspaces/[id]/inbox     Approvals
/workspaces/[id]/activity  Audit log
/workspaces/[id]/settings  Workspace config
/share/r/[token]           Public redacted report
/ops/health                Ops health UI
```
