# AGENTS

This file is for future Codex/Agent runs on the cloud computer. Read it before changing code or data.

## Project Summary

PaySys is a local Next.js + TypeScript + SQLite subscription relay admin app.

Main purpose:

- Admin manages QQ customers, group, notes, expiry, disabled state, renewals, and click counts.
- Customers open `/portal`, enter their registered QQ number, and get their own `/sub/[token]` subscription URL.
- `/sub/[token]` returns cached upstream subscription content only if the customer is active.
- LILISI credentials live in `.env`; the app logs in through LILISI API, gets `subscribe_url`, fetches content, and caches it in SQLite.

Do not expose the LILISI dashboard URL or upstream temporary subscription URL to customers.

## Tech Stack

- Next.js App Router
- TypeScript
- React
- SQLite through `better-sqlite3`
- Vitest
- ESLint

Important files:

```text
src/components/AdminApp.tsx            Admin UI
src/components/PortalLogin.tsx         QQ login UI
src/components/PortalAccount.tsx       Customer subscription center
src/lib/db.ts                          SQLite schema, migration, customer/payment/cache operations
src/lib/upstream.ts                    LILISI refresh and subscription fetch logic
src/lib/auth.ts                        Admin session
src/lib/user-auth.ts                   Customer QQ session
src/app/sub/[token]/route.ts           Subscription endpoint used by clients
src/app/api/portal/subscription/route.ts Customer "get subscription" action and click logging
```

## Required Commands

Run these before reporting that code changes are complete:

```powershell
npm run lint
npm test
npm run build
```

For dependency security checks:

```powershell
npm audit --registry=https://registry.npmjs.org --audit-level=high
```

Some npm mirrors do not implement audit. Use the official registry command above.

## Runtime

Recommended Node.js version for the cloud computer:

```text
Node.js 20.19+ or Node.js 22 LTS
```

Start development server:

```powershell
npm run dev
```

Start production server:

```powershell
npm run build
npm run start -- -p 3000
```

## Environment Variables

`.env` is required for real use and must not be shared publicly.

```env
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
LILISI_EMAIL=...
LILISI_PASSWORD=...
PAYSYS_DB_PATH=./data/paysys.sqlite
```

Rules:

- Never print real `.env` values in the final answer.
- Never commit or publish `.env`.
- Keep `ADMIN_SESSION_SECRET` stable after deployment, or all sessions will be invalidated.
- If changing `PAYSYS_DB_PATH`, make sure the database path is backed up.

## Data Safety

Real customer data is in:

```text
data/paysys.sqlite
data/paysys.sqlite-wal
data/paysys.sqlite-shm
```

Do not delete or overwrite `data/` unless the user explicitly asks.

When testing write flows against the real running app:

- Prefer temporary test customers with clearly fake QQ numbers.
- Clean them up immediately after testing.
- Avoid resetting or deleting existing real customers.

For automated DB tests, use `PAYSYS_DB_PATH` pointing to a temporary SQLite file, as current Vitest tests already do.

## Current Product Rules

- Customer login is QQ-only through `/portal`.
- First login sets an HTTP-only cookie; the device is remembered.
- Admin reset data keeps notes, clears payments/access logs, resets token, increments session version, and sets expiry to today.
- Disabled customers cannot renew, reset, get subscription, or fetch `/sub/[token]`.
- Expired customers cannot get subscription or fetch `/sub/[token]`.
- Click count shown in admin counts raw client subscription fetches: `subscription_fetch`.
- Renewal defaults in UI are amount `45` and period `180` days.
- New customer group options currently live in `src/components/AdminApp.tsx` as `defaultGroupOptions = ["1群", "2群", "3群"]`.
- Admin can switch a customer's group from the customer list, including bulk switching selected customers.

## Routes

Human-facing:

```text
/admin       Admin dashboard
/portal      QQ login
/portal/me   Customer subscription center
/sub/[token] Client subscription endpoint
/u/[token]   Legacy token page; not the recommended customer flow
```

Main admin APIs:

```text
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/state
POST   /api/admin/customers
PATCH  /api/admin/customers/[id]
DELETE /api/admin/customers/[id]
POST   /api/admin/customers/[id]/extend
POST   /api/admin/customers/[id]/reset-token
DELETE /api/admin/payments/[id]
POST   /api/admin/upstream/refresh
POST   /api/admin/upstream/manual-refresh
```

Main customer APIs:

```text
POST /api/portal/login
POST /api/portal/logout
POST /api/portal/subscription
POST /api/user/[token]/refresh
GET  /sub/[token]
```

## UI Notes

The user prefers concise Chinese UI text and a practical admin dashboard.

Current admin UI intentionally hides the upstream cache card because the user said they probably will not use it. The upstream API still exists for emergency/manual use.

Do not reintroduce noisy explanatory text into the UI unless the user asks. Keep customer pages simple:

- subscription link
- QR code
- bottom "获取订阅" button

## Deployment Notes

For cloud computer deployment:

- Prefer HTTPS if external users will access it.
- If only testing on the cloud computer itself, `localhost:3000` is enough.
- If external phones need access, configure public IP, firewall, port forwarding, reverse proxy, or tunnel.
- Back up `data/` before moving machines or upgrading.

## Known Limits

- All customers share one upstream cached subscription content.
- This app controls future `/sub/[token]` access, but cannot revoke node configs already imported into a client.
- LILISI automatic refresh can break if upstream API changes, account credentials fail, or risk control appears.
- QQ-only login is simple and convenient, but not strong authentication.

## Maintenance Checklist

Before handing work back:

1. Explain changed files briefly.
2. Run `npm run lint`.
3. Run `npm test`.
4. Run `npm run build`.
5. If dependencies changed, run npm audit with official registry.
6. Confirm no real secrets or customer data were printed.
