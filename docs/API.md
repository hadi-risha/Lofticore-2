# API reference

Base path: `/api`. JSON in, JSON out. In development the web app's dev server proxies `/api` to
`http://localhost:5000`.

**Authentication:** send `Authorization: Bearer <access token>`. Get one from login or refresh.
The refresh token is an `httpOnly` cookie the browser handles for you.
**Roles:** `customer`, `seller`, `delivery`, `admin`, `super_admin`.
**Approved:** sellers and delivery partners must be approved by an admin. **2FA:** team routes need
two-factor switched on.

## Errors

Every error has the same shape. Branch on `code`, show `message`, quote `requestId` when asking for help.

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Some fields need your attention.",
  "fields": { "email": "Enter a valid email address." },
  "requestId": "1f0c8a2e-..."
}
```

| Status | Used for                                                                   |
| ------ | -------------------------------------------------------------------------- |
| 400    | A request that can't be done (business rule, bad state)                    |
| 401    | Not signed in, or the access token expired (`AUTH_TOKEN_EXPIRED`: refresh) |
| 403    | Signed in but not allowed (role, pending approval, 2FA not set up)         |
| 404    | Not found, or not yours (the API doesn't reveal which)                     |
| 409    | Conflict: out of stock, duplicate, already handled, invalid transition     |
| 422    | Validation failed; `fields` says which                                     |
| 429    | Rate limited or temporarily locked                                         |
| 503    | A dependency is unavailable (file storage, payment provider)               |

The full list of codes is `ErrorCode` in [`packages/shared/src/error-codes.ts`](../packages/shared/src/error-codes.ts).

## Health

| Method | Path      | Notes                              |
| ------ | --------- | ---------------------------------- |
| GET    | `/health` | The process is up (outside `/api`) |
| GET    | `/ready`  | The database is reachable          |

## Auth `/auth`

| Method | Path               | Who                                  | Notes                                                                           |
| ------ | ------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| POST   | `/register`        | anyone                               | `customer`, `seller` or `delivery`. Emails a 6-digit code                       |
| POST   | `/verify-email`    | anyone                               | Returns a session                                                               |
| POST   | `/resend-otp`      | anyone                               | 60-second cooldown                                                              |
| POST   | `/login`           | anyone                               | Returns a session, or `{ twoFactorRequired, challengeToken }` for team accounts |
| POST   | `/login/2fa`       | anyone                               | `challengeToken` + 6-digit code                                                 |
| POST   | `/google`          | anyone                               | Google ID token. Not for team accounts                                          |
| POST   | `/refresh`         | cookie + `X-Requested-By: lofticore` | Rotates the refresh token                                                       |
| POST   | `/logout`          | cookie + `X-Requested-By: lofticore` | Ends this device's session                                                      |
| POST   | `/forgot-password` | anyone                               | Always answers the same                                                         |
| POST   | `/reset-password`  | anyone                               | Single-use link; signs out every device                                         |
| POST   | `/accept-invite`   | anyone                               | Team invitation                                                                 |
| POST   | `/logout-all`      | signed in                            |                                                                                 |
| POST   | `/change-password` | signed in                            | Signs out other devices                                                         |
| GET    | `/sessions`        | signed in                            | Your devices                                                                    |
| DELETE | `/sessions/:id`    | signed in                            | Sign one device out                                                             |
| POST   | `/2fa/setup`       | team                                 | Returns the secret, `otpauth` URL and a QR image                                |
| POST   | `/2fa/enable`      | team                                 | Confirms with a code                                                            |
| POST   | `/invite-staff`    | super admin                          | Emails an invitation                                                            |

## Account `/users`

| Method  | Path                | Notes                                               |
| ------- | ------------------- | --------------------------------------------------- |
| GET     | `/me`               | Current user                                        |
| PATCH   | `/me`               | Name, phone                                         |
| POST    | `/me/tour-complete` | Marks the guided tour as seen                       |
| GET/PUT | `/me/profile`       | Seller business details or delivery partner details |

## Catalogue (public)

| Method | Path                                    | Notes                                                                                                                                                       |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/categories`                           | The tree                                                                                                                                                    |
| GET    | `/products`                             | `q`, `category`, `minPrice`, `maxPrice` (paise), `material`, `color`, `inStock`, `rating`, `sort`, `page`, `limit`. Returns items, totals and filter facets |
| GET    | `/products/suggest?q=`                  | Autosuggest                                                                                                                                                 |
| GET    | `/products/best-sellers`                | Ranked by recent demand and rating                                                                                                                          |
| GET    | `/products/new-arrivals`                |                                                                                                                                                             |
| GET    | `/products/:slug`                       | Detail, with dimensions and an optional 3D model                                                                                                            |
| GET    | `/products/:slug/related`               |                                                                                                                                                             |
| GET    | `/products/:slug/reviews`               | `sort`, `page`. Includes the rating summary                                                                                                                 |
| GET    | `/recommendations/bought-together?ids=` | From real orders, topped up with similar products                                                                                                           |
| GET    | `/recommendations/for-you`              | Personalised if signed in or `viewed=` ids are sent                                                                                                         |
| GET    | `/recommendations/by-ids?ids=`          | Recently viewed                                                                                                                                             |
| POST   | `/assistant/chat`                       | `{ message, history }`. 20 requests a minute                                                                                                                |

All money is in **paise** (1 rupee = 100 paise).

## Reviews and reports (signed in)

| Method       | Path                                   | Notes                                             |
| ------------ | -------------------------------------- | ------------------------------------------------- |
| GET          | `/products/:slug/review-eligibility`   | Has the product been delivered to you?            |
| POST         | `/products/:slug/reviews`              | Delivered products only; one review each          |
| PATCH/DELETE | `/reviews/:id`                         | Your own                                          |
| POST         | `/reviews/:id/helpful`                 | Toggles your vote                                 |
| POST         | `/reports`                             | `order`, `product`, `seller` or `review`. 5 a day |
| GET          | `/reports/mine`                        |                                                   |
| GET          | `/notifications`                       | Latest, with the unread count                     |
| POST         | `/notifications/read-all`, `/:id/read` |                                                   |

## Shopping (signed in)

| Method     | Path                         | Notes                                                                                |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| GET/POST   | `/addresses`                 | Up to 10                                                                             |
| PUT/DELETE | `/addresses/:id`             | Your own                                                                             |
| GET        | `/wishlist`, `/wishlist/ids` |                                                                                      |
| PUT/DELETE | `/wishlist/:productId`       | Adding twice is harmless                                                             |
| POST       | `/checkout`                  | `items`, `addressId`, `paymentMethod`, `idempotencyKey`. Prices come from the server |
| GET        | `/orders`, `/orders/:id`     | Your own                                                                             |
| POST       | `/orders/:id/cancel`         | Until a seller packs it                                                              |
| GET        | `/payments/:id`              | Your own                                                                             |
| POST       | `/payments/:id/retry`        | After a failed attempt, while stock is held                                          |

### Payments (provider side)

| Method | Path                         | Notes                                                                                             |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/payments/webhook/mock-upi` | Signed callback. Header `x-signature` = HMAC-SHA256 of the raw body with `PAYMENT_WEBHOOK_SECRET` |
| GET    | `/mock-upi/:token`           | Details for the demo UPI app. Hidden in production unless `ALLOW_DEMO_PAYMENTS=true`              |
| POST   | `/mock-upi/:token/respond`   | `{ decision, pin }`. `0000` simulates insufficient balance                                        |

## Sellers (approved)

| Method           | Path                                 | Notes                                       |
| ---------------- | ------------------------------------ | ------------------------------------------- |
| GET/POST         | `/seller/products`                   | New products start as drafts                |
| GET/PATCH/DELETE | `/seller/products/:id`               | Delete archives                             |
| PATCH            | `/seller/products/:id/variants/:sku` | Price and MRP                               |
| POST             | `/seller/products/:id/stock`         | `{ sku, delta, reason }`                    |
| POST             | `/seller/products/:id/submit`        | Sends for admin review                      |
| GET              | `/seller/orders`, `/seller/stats`    | Only their own parcels                      |
| POST             | `/uploads/image`, `/uploads/model`   | JPG/PNG/WebP up to 5 MB; `.glb` up to 25 MB |

## Parcels

| Method | Path                                      | Who                                             | Notes                                                                                         |
| ------ | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/shipments/:orderId/:shipmentId/advance` | owning seller, assigned delivery partner, admin | `{ action }`: `confirm`, `pack`, `ship`, `out_for_delivery`, `deliver` (needs `deliveryCode`) |
| GET    | `/delivery/orders`                        | delivery partner                                | Assigned parcels                                                                              |

## Admin `/admin` (admin or super admin, 2FA on)

| Method     | Path                                     | Notes                                                                           |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| GET        | `/stats`                                 | Headline numbers                                                                |
| GET        | `/users`, `/users/:id`                   | Filter by `role`, `status`, `q`                                                 |
| POST       | `/users/:id/decision`                    | `approve`, `reject`, `block`, `unblock`; `activeOrders`: `complete` or `cancel` |
| POST       | `/users/:id/reset-2fa`                   | Super admin only                                                                |
| GET        | `/products`, POST `/products/:id/review` | The review queue; `approve` or `reject` with a note                             |
| POST/PATCH | `/categories`, `/categories/:id`         |                                                                                 |
| GET        | `/orders`                                | Every order, with the customer                                                  |
| POST       | `/shipments/:orderId/:shipmentId/assign` | Assign a delivery partner                                                       |
| GET        | `/reports`, POST `/reports/:id/resolve`  | Optionally hides a review or suspends a product                                 |
| GET        | `/audit`                                 | Super admin only                                                                |
