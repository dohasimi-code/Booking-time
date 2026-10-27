# Architecture

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS** for pages and API routes.
- **PostgreSQL** via `pg`. Works with Supabase, Neon or any Postgres. The browser never talks
  to the database: all queries run on the server, so private data cannot leak through a
  public database key or row-level-security mistake.
- **Luxon** for time-zone-correct date maths.
- **Zod** for server-side validation of every input.

No other services are needed. Email (Resend) is optional and isolated in `src/lib/email.ts`.

## Main pieces

| Path | Purpose |
| --- | --- |
| `db/migrations/001_init.sql` | Schema, default schedule, double-booking constraint |
| `src/lib/availability.ts` | Pure slot generation (unit tested) |
| `src/lib/services/availability.ts` | Loads only start/end times from the DB and computes slots |
| `src/lib/services/bookings.ts` | Create / cancel / reschedule inside transactions |
| `src/lib/services/blocks.ts` | Block Time with conflict detection |
| `src/lib/auth.ts` | Admin password check and database-backed sessions |
| `src/app/api/public/*` | Public endpoints (availability, booking, visitor management) |
| `src/app/api/admin/*` | Admin endpoints, all behind `requireAdmin` |
| `src/app/book/[slug]` | Public booking page |
| `src/app/booking/manage/[token]` | Visitor's private cancel/reschedule page |
| `src/app/admin/*` | Donald's dashboard |

## Availability logic

For a given date in `Europe/Tirane`:

1. Take the active weekly windows for that weekday and **merge** overlapping ones
   (Saturday 00:00–24:00 and 17:00–24:00 become one window, so no duplicate slots).
2. Generate start times from each window's start, every *start interval* minutes, keeping only
   those where *start + duration* ends inside the window. 24:00 means midnight; no slot can end
   after midnight. Wall-clock times that don't exist on the spring DST change are skipped.
3. Drop slots before *now + minimum notice* and after the *booking horizon*.
4. Mark a slot **blocked** if it overlaps a one-off or repeating block, and **booked** if
   `[start, end + buffer)` overlaps any confirmed booking's `[start, end + its buffer)`.

The brief's "17:00–23:59" and "00:00–23:59" are stored as "until midnight" (24:00), so a
30-minute meeting can start at 23:30 and end exactly at midnight.

## Double-booking prevention

Two layers:

1. The booking transaction locks the settings row (`select … for update`), re-computes
   availability for the requested start time with the live data, and only then inserts.
   This serialises concurrent booking attempts.
2. PostgreSQL enforces it regardless of application code:
   `exclude using gist (tstzrange(starts_at, occupied_until) with &&) where (status = 'confirmed')`.
   `occupied_until` is the end time plus the buffer that applied when booked.
   An overlap raises error `23P01`, which the API turns into "this time is no longer available".

Tests fire 10–12 simultaneous requests at the same slot and check exactly one succeeds.

## Security model

- **Public availability** returns only `{start, end, status}` per slot. The query behind it
  selects only time columns, so names, contact details, titles, notes and block reasons are
  never loaded, let alone sent.
- **Visitor booking management** uses a random 256-bit token sent only to the visitor. Only its
  SHA-256 hash is stored. Booking IDs and references can't be used to view or change a booking.
- **Admin auth**: email + password (bcrypt, cost 12), stored in `admin_users`; no credentials
  in code. Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` (and `Secure` in
  production) cookie; only the hash is stored in `admin_sessions`, with a 7-day expiry.
  Middleware redirects to the login page and every admin page and API route re-checks
  the session in the database.
- **Cross-site requests**: admin write requests must come from the site's own origin.
- **Rate limiting** on login, booking and management endpoints (in-memory, per instance).
- **Honeypot** field against simple booking bots.
- **Headers**: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin` (keeps private
  links out of Referer headers), HSTS; admin and management pages are `noindex`.
- **Audit log** of booking, block, schedule and settings changes.

## Why not Supabase Auth?

It would add a second account, a client SDK and row-level-security policies to get right, for a
single admin user. A server-side password login with database sessions is simpler and keeps all
data access on the server. Supabase still works as the database host.

## Known limits

- Rate limiting is per server instance; on many serverless instances it is weaker. Add a shared
  store (e.g. Upstash Redis) if abuse becomes a problem.
- One owner (Donald) and one meeting type. The schema can grow to more if needed.
- Changing the time zone setting reinterprets weekly hours in the new zone; existing bookings
  keep their absolute times.
