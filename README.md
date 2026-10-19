# Vectorly: vector logo library for designers

Designers search for a brand and download its logo as PNG, JPG, SVG, an editable PDF vector, or the brand's original AI/EPS file. Free accounts get PNG and JPG; a Pro subscription paid through Stripe unlocks vectors.

## Run it

Needs Node.js 22.5 or newer (it uses Node's built-in SQLite).

```bash
npm install
npm run seed      # 12 sample brands + an admin account (password is printed)
npm start         # http://localhost:3000
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before `npm run seed` to choose the admin login. Without Stripe keys the site runs in **demo payment mode**: checkout is simulated and nobody is charged, so you can try the whole flow.

## What's in it

| Page | What it does |
|---|---|
| `/` | Search with live suggestions, category chips, popular and new brands |
| `/search` | Filter by category, sort by downloads, name or newest |
| `/brand/:slug` | Every logo version, downloads in each format, brand colors (click to copy), usage notes |
| `/pricing` | Free vs Pro, starts Stripe Checkout |
| `/account` | Plan, downloads used today, download and payment history, cancel or manage billing |
| `/submit` | Brand owners send official logos; they wait for review |
| `/admin` | Approve or reject submissions, add brands and logo versions, see users, Pro members, downloads, revenue |

**Formats.** Each logo is stored once as a sanitized SVG. PNG and JPG are rendered at the size picked (256 to 4096 px). PDF keeps the artwork as vector paths, so it opens editable in Illustrator. AI/EPS files are served as uploaded. Previews are small PNGs, so the SVG can only be reached through a download.

**Plans** (change in `src/config.js` or with environment variables):
- Free: PNG/JPG up to 1024 px, 10 downloads a day (`FREE_DAILY_DOWNLOADS`)
- Pro: $9/month (`PRO_MONTHLY_PRICE`, in cents), SVG, PDF, source files, up to 4096 px, unlimited

## Turn on Stripe payments

1. Create a Stripe account and stay in **Test mode**.
2. Copy the secret key from Developers > API keys.
3. Add a webhook endpoint at `https://YOUR-DOMAIN/billing/webhook` with events `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret.
4. Turn on the customer portal (Settings > Billing > Customer portal) so Pro members can cancel or change cards.
5. Start the site with:

```bash
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... BASE_URL=https://YOUR-DOMAIN npm start
```

Pay with card `4242 4242 4242 4242`, any future date, any CVC. For local testing, `stripe listen --forward-to localhost:3000/billing/webhook` gives you a webhook secret. Switch to `sk_live_...` keys when you're ready to charge real cards.

Pro unlocks as soon as Stripe redirects back (the session is checked with Stripe), and the webhook keeps the plan in sync when a subscription renews, fails or is canceled.

## Deploy

It is a single Node process that writes to `data/` (SQLite database, logo files, previews), so host it somewhere with a persistent disk: Render, Railway, Fly.io or a small VPS. Set `BASE_URL` to the public https address. Serverless hosts without a disk (Vercel, Netlify functions) need the storage moved to a hosted database and object storage first.

## Settings

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `BASE_URL` | `http://localhost:PORT` |
| `SITE_NAME` | `Vectorly` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | empty (demo payments) |
| `CURRENCY` | `usd` |
| `PRO_MONTHLY_PRICE` | `900` |
| `FREE_DAILY_DOWNLOADS` | `10` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | used by `npm run seed` |
| `DATA_DIR` | `./data` |

## Logos and trademarks

Brand logos are trademarks. The library is built so that every logo has a known source (submitted by the brand, from an official press kit, or open-licensed), shows the brand's guidelines link, and carries usage terms (`/terms`). What Pro charges for is the service (cleaned, converted, ready-to-use files), not rights to the marks. Before launching with real brands, fill the library from brand submissions and press kits, add a takedown contact, and have a lawyer look over the terms for the countries you sell in.

The 12 sample brands are fictional and their artwork is original.

## Code map

- `src/server.js`: routes
- `src/views.js`: HTML pages
- `src/render.js`: SVG sanitizing, PNG/JPG/PDF conversion, previews
- `src/billing.js`: Stripe Checkout, webhook, customer portal, demo mode
- `src/auth.js`: accounts, password hashing, sessions, CSRF tokens
- `src/db.js`: SQLite schema
- `src/seed.js`: sample data
- `public/`: CSS and the small script for search suggestions and color copy
