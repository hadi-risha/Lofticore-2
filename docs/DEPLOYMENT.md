# Deploying on free tiers

A public demo of the whole app, with no card required: **MongoDB Atlas** (database), **Render**
(API), **Vercel** (web app), **Cloudinary** (photos and 3D models), and **Brevo** (email). Allow about an hour.

> **About payments.** The UPI flow is a demo and no real money moves. A public demo is fine, but selling to
> real customers needs a payment gateway first (see "Going real" below). The API ships with demo payments
> **switched off in production** and refuses UPI checkout until you set `ALLOW_DEMO_PAYMENTS=true`.

## 1. Database: MongoDB Atlas

1. Create a free **M0** cluster at <https://www.mongodb.com/atlas>. (It's a replica set, which the app needs.)
2. Database Access: create a user with a strong password.
3. Network Access: Render's free tier has no fixed IP, so allow `0.0.0.0/0`. The database user's password is
   then what protects it, so make it long and random.
4. Copy the connection string (`mongodb+srv://...`) and put the database name in it, e.g. `.../lofticore`.

## 2. Photos and 3D models: Cloudinary

Create a free account at <https://cloudinary.com>. From the dashboard note the **cloud name**, **API key**
and **API secret**. (The API's own disk is wiped on every deploy, so production must not use `STORAGE=local`.)

## 3. Email: Brevo

Create a free account at <https://www.brevo.com>, verify a sender address, and create SMTP credentials
(Settings → SMTP & API). Use host `smtp-relay.brevo.com`, port `587`. Any SMTP provider works the same way.

## 3b. Optional services (skip any; the app falls back)

| Service  | Free option                                          | Variables (on Render)                          |
| -------- | ---------------------------------------------------- | ---------------------------------------------- |
| Redis    | Upstash, create a database, copy the `rediss://` url | `REDIS_URL`                                    |
| Search   | Meilisearch Cloud (trial) or your own container      | `MEILI_HOST`, `MEILI_API_KEY`                  |
| Payments | Razorpay, switch to Test mode, copy keys             | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`       |
| Errors   | Sentry, new Node project                             | `SENTRY_DSN` (and `VITE_SENTRY_DSN` on Vercel) |

For Razorpay's webhook, add `https://<your-api>.onrender.com/api/payments/webhook/razorpay` in its
dashboard and set the secret you choose as `RAZORPAY_WEBHOOK_SECRET`.

## 4. The API on Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, choose the repository. It reads [`render.yaml`](../render.yaml).
3. Fill in the variables Render asks for:

| Variable                                           | Value                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `CLIENT_ORIGIN`                                    | Your Vercel address (you'll have it after step 5; edit then) |
| `MONGO_URI`                                        | From step 1                                                  |
| `JWT_ACCESS_SECRET`                                | `openssl rand -hex 32`                                       |
| `PAYMENT_WEBHOOK_SECRET`                           | `openssl rand -hex 32`                                       |
| `CLOUDINARY_*`                                     | From step 2                                                  |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | From step 3                                                  |

4. Deploy. The server **refuses to start** if a secret is still a placeholder, the site address isn't
   `https`, or the database is local, and the log says exactly what to fix.
5. Check `https://<your-api>.onrender.com/ready`. It should say `{"status":"ready","db":true}`.

The free instance sleeps after about 15 minutes without traffic, and the next request takes ~30 seconds.
A free uptime monitor (for example UptimeRobot) pinging `/health` every 10 minutes keeps it awake.

## 5. The web app on Vercel

1. Edit [`apps/web/vercel.json`](../apps/web/vercel.json): replace both `YOUR-API-NAME.onrender.com` with your
   Render address. The API is reached through the web app's own address (`/api/...`), which keeps the
   sign-in cookie first-party and avoids CORS trouble.
2. In Vercel: **Add New → Project**, import the repository, and set **Root Directory** to `apps/web`.
   The install and build commands come from `vercel.json`.
3. Optional: add `VITE_GOOGLE_CLIENT_ID` (see "Google sign-in").
4. Deploy, then go back to Render and set `CLIENT_ORIGIN` to the Vercel address, for example
   `https://lofticore.vercel.app`.

## 6. First data

From your own computer, point the seed scripts at the hosted database for one run. (Use your real values;
the super admin password must not contain "password" or "change".)

```bash
MONGO_URI="mongodb+srv://..." npm run seed:catalog -w @lofticore/api
MONGO_URI="mongodb+srv://..." SUPER_ADMIN_EMAIL="you@yourdomain.com" \
  SUPER_ADMIN_PASSWORD="a-long-unique-passphrase" npm run seed:super-admin -w @lofticore/api
```

Sign in as the super admin and set up two-factor. Then invite any other admins from **Team**.
`seed:catalog` is sample data; skip it for a real shop.

## Google sign-in (optional)

1. <https://console.cloud.google.com> → APIs & Services → Credentials → **OAuth client ID** (Web application).
2. Authorised JavaScript origins: your Vercel address (and `http://localhost:5173` for development).
3. Put the client id in `GOOGLE_CLIENT_ID` on Render and `VITE_GOOGLE_CLIENT_ID` on Vercel.

## Chat assistant with an AI fallback (optional)

Create a free key at <https://aistudio.google.com> and set `GEMINI_API_KEY` on Render. Without it, the
assistant still answers from its built-in guide. If Google changes model names, set `GEMINI_MODEL`.

## Before you tell anyone

- [ ] `/ready` is healthy and a test order works end to end (use a throwaway email)
- [ ] Super admin has two-factor on, and the seed password is not the example one
- [ ] You can receive the verification email (check spam the first time)
- [ ] `CLIENT_ORIGIN` is exactly the address people use, with `https://`
- [ ] Atlas has backups enabled (free tier: take a manual export before big changes)
- [ ] Read [SECURITY.md](SECURITY.md), especially "Known gaps"

## Going real (what's missing for actual customers)

1. **A live payment gateway.** Razorpay is built in; test mode is on until you add live keys.
2. **Live keys** for Razorpay (after their KYC), and turning `ALLOW_DEMO_PAYMENTS` off.
3. **Alerts** on `/ready` and the `/status` page (UptimeRobot is free).
4. **Legal pages** (terms, privacy, returns policy) and GST invoicing, which the app doesn't generate yet.

## Notes on live updates

Order updates use a long-lived connection (`/api/events`). If your host or proxy cuts it, the web app
reconnects by itself and still refreshes a pending payment every 15 seconds, so nothing breaks.

## Other hosts

- **API:** anything that runs a Docker image or Node 22 (Fly.io, Railway). Build with
  `docker build -f apps/api/Dockerfile -t lofticore-api .`, listen on `PORT`, health check `/health`.
- **Web:** any static host. Netlify and Cloudflare Pages need the same two things `vercel.json` does:
  forward `/api/*` and `/static/*` to the API, and serve `index.html` for unknown paths. Copy the security
  headers from `vercel.json` as well.
