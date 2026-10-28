# Booking Time with Donald

A web app that lets anyone book a meeting with Donald from a single link
(`/book/donald`), and gives Donald a private dashboard to manage bookings,
block time and change his availability.

- **Visitors** pick a date and a free time, enter their name and email, review and confirm.
  No account needed. They get a booking reference and a private link to cancel or reschedule.
- **Donald** signs in at `/admin` to see and manage bookings, block time, edit weekly hours
  and change meeting settings.
- English and Albanian (EN/SQ) on the public pages. All times are in `Europe/Tirane`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works and why.

## What's working and what's pending

| Area | Status |
| --- | --- |
| Public booking page, calendar, booking form, confirmation | Working, tested |
| Availability rules, merging, midnight, buffers, notice, horizon, DST | Working, tested |
| Double-booking prevention (database constraint + transaction) | Working, tested with simultaneous requests |
| Visitor cancel / reschedule via private link | Working, tested |
| Admin login, bookings, calendar, block time (with conflict choices), weekly hours, repeating blocks, settings | Working, tested |
| Privacy of public API (no names, emails, titles, notes, reasons) | Working, tested |
| Email notifications | **Pending**: code is in place, switched off until a Resend API key is added |
| First-run admin setup page (`/admin/setup`) | Working, tested |
| Hosting / domain | **Pending**: needs Donald's accounts (see Deployment) |

## Running locally

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env.local          # then edit DATABASE_URL
npm run db:migrate                  # creates tables and the default weekly schedule
npm run admin:create                # asks for Donald's email and a password (12+ characters)
npm run dev                         # http://localhost:3000/book/donald
```

The password is stored only as a bcrypt hash in the database. Run `npm run admin:create`
again at any time to change it (this also signs out all existing sessions).

## Tests

```bash
# Unit + database tests (needs an empty test database)
createdb booking_test
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/booking_test npm test

# End-to-end tests (API + real browser) against a running production build
DATABASE_URL=<test db> npx tsx scripts/migrate.ts
DATABASE_URL=<test db> npm run build
DATABASE_URL=<test db> DISABLE_RATE_LIMIT=true ADMIN_SETUP_CODE=test-setup-code-123 npx next start -p 3100
E2E_BASE_URL=http://localhost:3100 TEST_DATABASE_URL=<test db> npm test
```

The tests wipe the test database, so never point them at real data. GitHub Actions runs
everything on every push (`.github/workflows/ci.yml`).

## Deployment

Recommended: **Vercel** (app) + **Supabase** or **Neon** (PostgreSQL). Both have free tiers.
A step-by-step guide in Albanian for non-technical setup is in [docs/DEPLOY-SQ.md](docs/DEPLOY-SQ.md).

1. **Database.** Create a Supabase project and copy the *Transaction pooler* connection string
   (Connect → Connection string), with your database password filled in.
2. **App.** Import the GitHub repo in Vercel and set:
   - `DATABASE_URL`: the connection string (SSL is enabled automatically for hosted databases)
   - `ADMIN_SETUP_CODE`: a secret of 8+ characters, used once to create the admin login
   - optional `APP_URL` (defaults to Vercel's production URL), `RESEND_API_KEY`, `EMAIL_FROM`
3. **Deploy.** `npm run build` applies database migrations automatically before building.
4. **Admin login.** Open `/admin/setup`, enter the setup code, your email and a password.
   Setup switches itself off once an admin exists; you can then remove `ADMIN_SETUP_CODE`.
   (Alternatively run `npm run admin:create` with `DATABASE_URL` set.)
5. **Domain.** Add your domain in Vercel → Settings → Domains. Your link becomes
   `https://<your-domain>/book/donald`.

Any Node host (Railway, Render, a VPS) works the same way: `npm run build && npm start`.

### Turning on email

1. Create a [Resend](https://resend.com) account and verify your sending domain.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Booking Time with Donald <bookings@yourdomain.com>`).
3. Set your notification address in Admin → Settings.

Visitors then get a confirmation with date, time, reference and their private
cancel/reschedule link, and Donald gets a notification with the visitor's details.
If sending fails, the booking still succeeds and the error is logged.
Email has not been tested against a live provider yet.

## Data and privacy

- Visitors only ever see times as Available / Booked / Unavailable.
- Only the visitor's name, email and optional phone, title and notes are collected.
- Donald can permanently delete a past or cancelled booking from the dashboard.
- `npm run data:purge -- 365` deletes cancelled/completed bookings and audit entries older than 365 days.
