# Lofticore

[![CI](https://github.com/hadi-risha/lofticore-ecommerce/actions/workflows/ci.yml/badge.svg)](https://github.com/hadi-risha/lofticore-ecommerce/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![Tests](https://img.shields.io/badge/API%20tests-170%2B-brightgreen)
![Lighthouse](https://img.shields.io/badge/Lighthouse-a11y%2096%20%C2%B7%20best%20practices%2096%20%C2%B7%20SEO%2092-informational)

A furniture and decor marketplace: shoppers browse and buy, independent sellers list products,
delivery partners bring them to the door, and a small admin team keeps it all honest.

Built with the MERN stack in TypeScript, in one repository.

- **Shopping:** search with suggestions, filters and sorting, reviews, wishlist, cart, address book, checkout
  with UPI (demo) or cash on delivery, live order tracking, a 4-digit delivery code, cancellations and refunds
- **Trust:** verified purchase reviews, problem reports, in-app notifications, a lower cash on delivery limit
  for brand-new accounts
- **Discovery:** best sellers, "customers also bought", personalised picks, 3D and AR product views,
  a chat assistant, a guided tour for each role
- **Selling:** a seller studio (products, stock, orders, photos and 3D models), approval by an admin
- **Platform:** Redis-backed rate limits and an email job queue (retries with backoff), live order
  updates over server-sent events, Razorpay (test mode) beside a demo UPI provider, Meilisearch
  typo-tolerant search with a MongoDB fallback, OpenAPI/Swagger docs, Sentry, and a public status page
- **Running it:** admin tools for people, products, orders and reports, an audit log, and two-factor
  authentication for the team

## Quick start

You need Node 22+, Docker, and git.

```bash
npm install
npm run infra:up            # MongoDB (replica set), Redis, Meilisearch, Mailpit
cp apps/api/.env.example apps/api/.env
npm run seed:catalog -w @lofticore/api       # 53 sample products
npm run seed:super-admin -w @lofticore/api   # the first admin
npm run dev                 # API on :5000, web on :5173
```

Open <http://localhost:5173>. Every email the app sends (verification codes, password resets,
approvals) lands in Mailpit at <http://localhost:8025>, so nothing real is ever sent in development.

| Account               | Sign in with                                                             |
| --------------------- | ------------------------------------------------------------------------ |
| Customer              | Register on the site; the 6-digit code arrives in Mailpit                |
| Seller (approved)     | `studio@lofticore.local` / `Seller12345` (created by the catalogue seed) |
| Super admin           | `owner@lofticore.local` / `ChangeThisNow123` (see below)                 |
| New seller / delivery | Register, send your details, then approve them from the admin panel      |

The super admin is asked to set up an authenticator app (any TOTP app) at the first sign-in. Admin
tools stay locked until that's done. If you lose the authenticator on a dev machine:
`npm run reset-2fa -w @lofticore/api -- owner@lofticore.local`.

Paying with UPI opens a **demo UPI app** in a second window. Use any 4-6 digit PIN to pay, or `0000` to see
an "insufficient balance" failure. No real money is involved anywhere.

## Commands

| Command                                            | What it does                                                 |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                                      | API and web together, with reloading                         |
| `npm run check`                                    | Lint, type-check and formatting check (what CI runs)         |
| `npm test`                                         | API tests (needs `npm run infra:up`)                         |
| `PW_CHANNEL=msedge npm run e2e`                    | Browser tests; `msedge`/`chrome` reuses an installed browser |
| `npm run build`                                    | Production builds of the API and the web app                 |
| `npm run seed:catalog -w @lofticore/api`           | Sample categories and products (`-- --reset` to redo)        |
| `npm run seed:models -w @lofticore/api`            | Adds sample 3D models to existing products                   |
| `npm run dev:deliver -w @lofticore/api -- <email>` | Marks a customer's latest order delivered (to try reviews)   |
| `npm run format`                                   | Formats everything with Prettier                             |

A git hook formats and lints staged files on every commit.

## How it's organised

```
apps/
  api/            Express 5 + TypeScript + Mongoose
    src/modules/    one folder per feature: auth, catalog, inventory, orders, payments,
                    reviews, reports, notifications, recommendations, assistant, admin...
    src/middleware/ authentication, roles, validation, rate limits, error handling
    src/lib/        passwords, tokens, mail, storage, TOTP
    tests/          integration tests against a real MongoDB
  web/            React 19 + Vite + Tailwind 4
    src/features/   catalog, auth, orders, account, portal (seller/delivery/admin), trust,
                    assistant, tour
    src/components/ layout and small reusable UI pieces
packages/
  shared/         Types, Zod schemas, error codes and constants used by both apps
e2e/              Playwright browser tests
docs/             Architecture, API reference, deployment, security
```

Why one `shared` package: the same Zod schema validates a form in the browser and the request on the
server, and error codes, roles, statuses and limits are defined once. When a rule changes (say the cash on
delivery limit), the server, the checkout screen and the chat assistant's answers all change together.

More detail: [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md)

## What the extra services do (all optional)

Every one of these is switched on by an environment variable and **falls back gracefully when absent**, so
the app still runs with just MongoDB.

| Service     | Turned on by                    | What it does                                                                                                                | Without it                                                               |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Redis       | `REDIS_URL`                     | Shared rate-limit counters, the email job queue (5 retries, exponential backoff), live-update fan-out between API instances | Per-process rate limits, direct email send, single-instance live updates |
| Meilisearch | `MEILI_HOST`                    | Typo-tolerant, as-you-type product search ranked by relevance ("sofaa" finds sofas)                                         | MongoDB text search                                                      |
| Razorpay    | `RAZORPAY_KEY_ID` / `_SECRET`   | Card, UPI and net banking in test mode; HMAC-verified callback and webhook, refunds                                         | Option hidden at checkout                                                |
| Sentry      | `SENTRY_DSN`, `VITE_SENTRY_DSN` | Error tracking tagged with the request id; no bodies or cookies sent                                                        | Errors only in logs                                                      |

**Razorpay test mode:** create a free account, switch the dashboard to _Test mode_, copy the key id and secret
into `apps/api/.env`, restart. Pay with the test card `4111 1111 1111 1111` (any future date and CVV) or
UPI id `success@razorpay`. For the optional webhook, point it at `/api/payments/webhook/razorpay` (use
`npm run share` for a public address) and set `RAZORPAY_WEBHOOK_SECRET`.

**Live updates:** `GET /api/events` is a server-sent-events stream. The web app opens it after sign-in and
refetches orders and notifications when the server announces a change. It replaced polling every 2.5 s.

**API docs:** <http://localhost:5000/api/docs> (Swagger UI). Request bodies are generated from the shared Zod
schemas, so the docs match what the server enforces. **Status page:** <http://localhost:5173/status>.

## Performance

Lighthouse (mobile emulation, throttled, production build served locally), `docs/lighthouse/`:

| Page | Performance | Accessibility | Best practices | SEO |
| ---- | ----------- | ------------- | -------------- | --- |
| Home | 55          | 96            | 96             | 92  |
| Shop | 51          | 94            | 96             | 92  |

The hero image went from 562 KB to 50 KB (WebP). Remaining cost is mostly product photos and the web
fonts; serving images through a CDN with resizing is the next step. Re-run with
`npx lighthouse http://localhost:4173 --view` after `npm run build` and `npx vite preview -w @lofticore/web`.

## Trying AR on a phone

AR ("View in your room") only works on **https**, so a plain `http://192.168.x.x:5173` address will
show the 3D model but not the AR button. Share the running dev site through a temporary https tunnel:

```bash
npm run dev      # terminal 1
npm run share    # terminal 2: prints https://<random>.trycloudflare.com
```

Open that link on the phone (Android: Chrome with Google Play Services for AR; iPhone: Safari) and open a
product with a 3D model. The link works until you stop the command. Anyone with it can reach your dev
site, so stop it when you are done.

## Roles

| Role             | How they get in                      | What they can do                                                   |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Customer         | Sign up (email code) or Google       | Browse, buy, review (after delivery), report, manage account       |
| Seller           | Sign up, send business details       | After approval: list products, manage stock, fulfil orders         |
| Delivery partner | Sign up, send licence and areas      | After approval: deliver assigned parcels using the customer's code |
| Admin            | Invitation from the super admin only | Approve people, review products, run orders, handle reports, block |
| Super admin      | Created by the seed script           | Everything an admin can, plus the team and the audit log           |

Nobody can sign up as an admin, and team accounts can't use Google sign-in (it would skip two-factor).

## Orders and payments

An order is split into one parcel per seller. Each parcel moves
`placed → confirmed → packed → shipped → out for delivery → delivered`, and the customer sees the order as
Booked, Being prepared, On the way, Received or Cancelled.

- **Stock** is held for 15 minutes while a UPI payment is pending, with single conditional updates, so
  the last unit can't be sold twice.
- **UPI** is a demo that behaves like a real gateway: the "UPI app" confirms with a signed callback that the
  server verifies before trusting. Replacing it with Razorpay or Cashfree test mode means writing one
  provider; the order logic doesn't change.
- **Cash on delivery** orders are confirmed immediately and count as paid when everything is delivered.
- Customers can cancel until a seller packs the parcel. Paid orders are refunded automatically.

## Configuration

All settings live in `apps/api/.env` and are checked when the server starts, so a typo fails immediately.
In production the server also refuses to start with placeholder secrets, a non-https site address, or a
local database. See [`apps/api/.env.example`](apps/api/.env.example) for every variable with notes.

| Variable                  | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `MONGO_URI`               | Database. Must be a replica set (stock reservation uses transactions) |
| `JWT_ACCESS_SECRET`       | Signs sessions and hashes one-time codes (`openssl rand -hex 32`)     |
| `PAYMENT_WEBHOOK_SECRET`  | Signs payment callbacks                                               |
| `CLIENT_ORIGIN`           | The web app's address (CORS, and links in emails)                     |
| `SMTP_*`, `MAIL_FROM`     | Outgoing email (Mailpit in development)                               |
| `STORAGE`, `CLOUDINARY_*` | Where photos and 3D models are kept (`local` or `cloudinary`)         |
| `ALLOW_DEMO_PAYMENTS`     | Lets the demo UPI payments run in production (staging or a demo)      |
| `GOOGLE_CLIENT_ID`        | Optional: Google sign-in                                              |
| `GEMINI_API_KEY`          | Optional: lets the chat assistant answer beyond its built-in guide    |

## Troubleshooting

- **`port is already allocated` on 6379:** another Redis is running. This project maps Redis to port 6380.
- **`npm install` fails with an esbuild version error:** the root `package.json` pins one esbuild version
  with `overrides` for this reason; delete `node_modules` and the lockfile only if you change it.
- **"Transaction numbers are only allowed on a replica set":** your MongoDB isn't a replica set. Use
  `npm run infra:up`, which starts one.
- **Emails don't arrive:** open Mailpit at <http://localhost:8025>. Nothing leaves your machine.
- **Browser tests can't start:** they need `npm run infra:up` and a browser. Use `PW_CHANNEL=msedge` or
  `chrome` locally, or run `npx playwright install chromium`.
