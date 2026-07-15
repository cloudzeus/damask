# DAMASK PIM

PIM + B2B portal για την Damask με αμφίδρομη διασύνδεση SoftOne ERP.

- **Spec:** docs/superpowers/specs/2026-07-15-damask-pim-design.md
- **Design system:** design-system/damask-pim/MASTER.md
- **Stack:** Next.js 16, Prisma 7/PostgreSQL, Auth.js v5, pg-boss, Tailwind 4, shadcn/ui (base-ui), GSAP, next-intl

## Setup

1. `cp .env.example .env` και συμπλήρωσε τις τιμές
2. `npm install`
3. `npm run db:migrate && npm run db:seed`
4. `npm run dev`

## Δοκιμές

- `npm test` — unit (Vitest)
- `npm run test:e2e` — Playwright (θέλει τρέχουσα DB + seed)
- `npm run s1:test` — live έλεγχος SoftOne (θέλει S1_* creds στο .env)

## Deploy (Docker)

```bash
docker build -t damask-pim .
docker run -p 3000:3000 --env-file .env damask-pim
```
Migrations σε production: `npx prisma migrate deploy` πριν το start.
