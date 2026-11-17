# Security

What's in place, how it's checked, and what isn't done. To report a vulnerability, open a private security
advisory on the repository rather than a public issue.

## What's implemented

**Accounts and sessions**

- Passwords hashed with **argon2id**; one-time codes and reset tokens stored only as HMACs.
- Email verification with a 6-digit code (10 minutes, 5 attempts, 60-second resend cooldown).
- Login can't reveal whether an email exists (same message, same timing); 5 wrong passwords lock the
  account for 15 minutes.
- Short-lived access tokens (15 minutes) in memory only; refresh tokens in `httpOnly` `Secure` cookies,
  rotated on every use, with reuse detection and per-device sessions you can revoke.
- Password reset and change sign out other devices. Blocking someone signs them out everywhere at once.
- **Two-factor (TOTP)** is mandatory for the team: admin routes are closed until it's on. Team accounts can't
  use Google sign-in, which would bypass it. The sign-in challenge between the two steps can't be used as a session.
- Nobody can sign up as an admin. Admins join by single-use, expiring email invitations.
- Sellers and delivery partners are verified by an admin before they can do anything.

**Requests and data**

- Every input is validated with a Zod schema before it reaches any query, so injected objects such as
  `{ "$ne": null }` are rejected.
- Roles are checked on every route. Ownership is part of the database query (`{ _id, user }`), so one customer
  can't read or change another's orders, addresses, payments or reviews; the answer is the same 404 as for
  something that doesn't exist.
- Prices, titles and totals are always read from the database, never from the browser.
- The checkout is idempotent; payment callbacks are HMAC-signed, compared in constant time and processed
  exactly once.
- Uploads: the file's real header is checked (not its name or type), random file names, size limits, and only
  approved roles can upload.
- Rate limits on everything, tighter on sign-in, codes, reports and chat. A daily cap on reports.
- A lower cash-on-delivery limit for brand-new accounts with nothing delivered.
- Reviews only from people who received the product. Problem reports go to an admin queue.

**Web and transport**

- Helmet headers on the API; CORS limited to your site; gzip; JSON body size limits.
- The web app ships a strict **Content-Security-Policy** and other headers (`vercel.json`), tested in
  the browser tests against the production build. The built page has no inline scripts.
- Cookies are `Secure` and `SameSite`; the cookie endpoints need a custom header that other sites can't send.
- React escapes output; reviews and reports are plain text.

**Operations**

- Secrets are validated at start-up; in production the server **refuses to run** with placeholder secrets, a
  non-https site address or a local database.
- Passwords, tokens and cookies are redacted from logs. Every request has an id shown to the user on errors.
- An append-only **audit log** (sign-ins, locks, approvals, blocks, cancellations, refunds, resolutions),
  readable only by the super admin.
- Dependabot, a dependency audit in CI, and a non-root container image.

## Known gaps

Be honest with yourself about these before real customers arrive.

| Gap                                            | Impact and what to do                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| UPI is a demo                                  | No real money moves. A real gateway is needed before selling.                      |
| Rate limits fail open if Redis is down         | Chosen so an outage can't take the site down; alert on the status page instead.    |
| No CAPTCHA on sign-up and code requests        | Bots can create accounts (rate limits slow them). Cloudflare Turnstile is free.    |
| No breached-password check                     | Only length and character rules apply.                                             |
| No recovery codes for two-factor               | A lost authenticator needs the super admin (or `npm run reset-2fa` on the server). |
| Access tokens are stateless                    | A stolen token works for up to 15 minutes even after a block.                      |
| Uploaded images aren't re-encoded or scanned   | EXIF data stays; no malware scanning. Cloudinary can strip metadata on upload.     |
| The audit log isn't tamper-proof               | Nothing in the app edits it, but a database admin could. Ship it to external logs. |
| Email is sent without a retry queue            | A failed send is logged and users can press "resend".                              |
| No automated penetration test or formal review | Worth doing before launch.                                                         |

## Checking it yourself

```bash
npm test -w @lofticore/api     # includes tests for the rules above (ownership, roles, replay, signatures...)
npm run e2e                    # browser tests against the production build and its headers
npm audit --omit=dev           # known vulnerabilities in what ships
```
