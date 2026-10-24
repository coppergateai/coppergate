# Coppergate — Sayfa Özeti

Web uygulamasındaki (`apps/web`) route’ların sayfa sayfa özeti. Auth gerektiren sayfalar giriş yoksa `/login`’e yönlendirir.

---

## Genel / pazarlama

### `/` — Landing
- Hero (motto: Set a budget… Survivors ship) + Mission Control Arena mock
- Stack ribbon, capability grid (agent teams / budgets / evidence / infra)
- Arena preview, Survivor workflow, evidence / fitness / signals / security
- Pilot projeler, FAQ, final CTA; funnel beacon + JSON-LD

### `/login` — Giriş
- GitHub / GitLab OAuth butonları (yapılandırılmışsa)
- Sadece identity scope; repo erişimi sonra App install ile
- Zaten girişliyse → `/workspaces`

### `/changelog` — Changelog
- Tarihli release notları (billing, signal adapters, Arena thesis, marketing, product core)
- GitHub + contact linkleri

### `/blog` — Blog
- İngilizce product notları (arena vs chat, budget/kill-switch, fitness gates)
- `/blog/[slug]` — article metadata + Article / BreadcrumbList JSON-LD
- Kaynak: `apps/web/content/blog/*.md`

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
- Header: workspace eyebrow, status chip + copy, Open Arena CTA
- Metrik kartları: Active runs, Needs approval, Verified PRs (ay), Budget used/cap
- Sol: Needs your attention + Recent activity timeline (audit events, Activity ile aynı human labels)
- Sağ: Active executions (pipeline steps) + Quick actions
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
| **evidence** | Evidence Center — gate checklist + Delivery Review deep-link |
| **configuration** | Maintainer, multi-repo, policy presets, merge (`?tab=more` alias) |

Header: repo, stack, autonomy, budget, pending approvals, last run status.

Ürün kavramları: [PRODUCT_CONCEPTS.md](./PRODUCT_CONCEPTS.md).

### `/workspaces/[id]/projects/[projectId]/tasks/[taskId]` — Delivery Review
- Beş aşama: Scope → Execution → Verification → Review → Delivery
- Gate banner (hard CI/validation/policy + soft review/fitness)
- Accept → Done yalnızca hard gate’ler açıkken; paylaşılan hard-gate copy
- Diff / CI / delivery report / findings / share
- Arena decision panel (efficiency contest + rationale)

### `/workspaces/[id]/arena` — Workspace Arena (Mission Control)
- Canlı operasyon özeti: Running / Awaiting CI / Needs attention / Idle
- Proje satırları özet; expand ile agent grid + execution phase
- Semantic agent state (role / mode / runtime ayrı); yalnızca Running’de pulse
- Sağ panel Agent Inspector: Overview / Logs / Artifacts (run events + inline evidence)
- Owner kontrolleri: Resume all / Pause all (soft) / Stop all (hard kill)
- `?focus=` ile proje odaklama + expand

### `/workspaces/[id]/inbox` — Inbox
- Pending / brief / task / recent sekmeleri
- Approval seçimi (`?a=`), owner approve/reject
- Yakın zamanda karar verilenler

### `/workspaces/[id]/activity` — Activity (Agent Operations Timeline)
- Metrikler: Events today, Active agents (arena contenders), Needs review + health chip
- Human-readable event başlıkları; ham action teknik metadata olarak kalır
- Tournament create/fanout/resolve → tek execution grubu (alt adımlar açılır)
- Filtre sekmeleri (All / Executions / Decisions / Agent / System) + arama (⌘K)
- Sağ event inspector: Overview / Details / Evidence / Raw — kanıt yoksa uydurma metin yok
- Klavye: J/K gezinme, Enter aç, Esc kapat

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
/blog /blog/[slug]         Blog (EN)
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
/workspaces/[id]/activity  Agent Operations Timeline
/workspaces/[id]/settings  Workspace config
/share/r/[token]           Public redacted report
/ops/health                Ops health UI
```
