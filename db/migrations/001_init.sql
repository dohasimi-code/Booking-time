-- Booking Time with Donald: initial schema
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- Single-row settings table.
create table settings (
  id                  smallint primary key default 1 check (id = 1),
  owner_name          text not null default 'Donald',
  owner_email         text,
  public_slug         text not null default 'donald',
  timezone            text not null default 'Europe/Tirane',
  meeting_duration_min integer not null default 30 check (meeting_duration_min between 5 and 480),
  slot_interval_min   integer not null default 30 check (slot_interval_min between 5 and 480),
  buffer_min          integer not null default 0 check (buffer_min between 0 and 240),
  min_notice_min      integer not null default 120 check (min_notice_min between 0 and 43200),
  max_horizon_days    integer not null default 60 check (max_horizon_days between 1 and 730),
  updated_at          timestamptz not null default now()
);
insert into settings (id) values (1);

-- Weekly availability. day_of_week uses ISO numbering: 1 = Monday ... 7 = Sunday.
-- Minutes are minutes since local midnight; end_minute = 1440 means "until midnight".
create table availability_rules (
  id           serial primary key,
  day_of_week  smallint not null check (day_of_week between 1 and 7),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute   integer not null check (end_minute between 1 and 1440),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (end_minute > start_minute)
);

-- Default schedule: Mon-Fri 08:00-16:00, every day 17:00-24:00, Sat/Sun all day.
insert into availability_rules (day_of_week, start_minute, end_minute)
select d, 480, 960 from generate_series(1, 5) d
union all
select d, 1020, 1440 from generate_series(1, 7) d
union all
select d, 0, 1440 from generate_series(6, 7) d;

-- One-off blocked periods ("Block Time").
create table blocked_periods (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index blocked_periods_range_idx on blocked_periods using gist (tstzrange(starts_at, ends_at, '[)'));

-- Recurring weekly blocks (e.g. "every Friday afternoon").
create table recurring_blocks (
  id           uuid primary key default gen_random_uuid(),
  day_of_week  smallint not null check (day_of_week between 1 and 7),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute   integer not null check (end_minute between 1 and 1440),
  reason       text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (end_minute > start_minute)
);

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  visitor_name      text not null,
  visitor_email     text not null,
  visitor_phone     text,
  title             text,
  notes             text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- ends_at plus the buffer that applied when the booking was made.
  occupied_until    timestamptz not null,
  status            text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  source            text not null default 'public' check (source in ('public', 'admin')),
  manage_token_hash text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      text check (cancelled_by in ('visitor', 'admin')),
  check (ends_at > starts_at),
  check (occupied_until >= ends_at),
  -- The core double-booking guarantee: no two confirmed bookings may overlap
  -- (including buffer time). Enforced by PostgreSQL itself.
  constraint bookings_no_overlap exclude using gist (
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status = 'confirmed')
);
create index bookings_starts_at_idx on bookings (starts_at);
create index bookings_status_idx on bookings (status);

create table admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  role          text not null default 'admin' check (role in ('admin')),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table admin_sessions (
  token_hash  text primary key,
  admin_id    uuid not null references admin_users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index admin_sessions_admin_idx on admin_sessions (admin_id);

create table audit_log (
  id         bigserial primary key,
  actor      text not null,          -- 'admin:<email>', 'visitor', 'system'
  action     text not null,
  booking_id uuid references bookings(id) on delete set null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_booking_idx on audit_log (booking_id);
