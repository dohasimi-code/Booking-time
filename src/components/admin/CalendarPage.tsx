"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useAdmin } from "./AdminShell";
import { api, btnSecondary, fmtTime, type AdminBooking } from "./api";

interface Block { id: string; startsAt: string; endsAt: string; reason: string | null }

export default function CalendarPage() {
  const { timezone } = useAdmin();
  const [week, setWeek] = useState(() => DateTime.now().setZone(timezone).startOf("week"));
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  const load = useCallback(async () => {
    const from = week.toISO()!;
    const to = week.plus({ weeks: 1 }).toISO()!;
    const [b, bl] = await Promise.all([
      api<{ bookings: AdminBooking[] }>(`/api/admin/bookings?scope=all&status=confirmed&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      api<{ blocks: Block[] }>("/api/admin/blocks?past=1"),
    ]);
    const done = await api<{ bookings: AdminBooking[] }>(`/api/admin/bookings?scope=all&status=completed&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    setBookings([...b.bookings, ...done.bookings]);
    setBlocks(bl.blocks.filter((x) => x.endsAt > from && x.startsAt < to));
  }, [week]);
  useEffect(() => { load(); }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => week.plus({ days: i }));
  const today = DateTime.now().setZone(timezone).toISODate();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button className={btnSecondary} onClick={() => setWeek(week.minus({ weeks: 1 }))} aria-label="Previous week">‹</button>
          <button className={btnSecondary} onClick={() => setWeek(DateTime.now().setZone(timezone).startOf("week"))}>This week</button>
          <button className={btnSecondary} onClick={() => setWeek(week.plus({ weeks: 1 }))} aria-label="Next week">›</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-600">
        {week.setLocale("en-GB").toFormat("d LLL")} – {week.plus({ days: 6 }).setLocale("en-GB").toFormat("d LLL yyyy")} · {timezone}
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayStart = d.toMillis();
          const dayEnd = d.plus({ days: 1 }).toMillis();
          const inDay = (s: string, e: string) => new Date(s).getTime() < dayEnd && new Date(e).getTime() > dayStart;
          const items = [
            ...bookings.filter((b) => inDay(b.startsAt, b.endsAt)).map((b) => ({ kind: "booking" as const, start: b.startsAt, end: b.endsAt, label: b.visitorName, sub: b.title, id: b.id })),
            ...blocks.filter((b) => inDay(b.startsAt, b.endsAt)).map((b) => ({ kind: "block" as const, start: b.startsAt, end: b.endsAt, label: "Blocked", sub: b.reason, id: b.id })),
          ].sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div key={d.toISODate()} className={`min-h-32 rounded-xl border bg-white p-3 ${d.toISODate() === today ? "border-teal-600" : "border-stone-200"}`}>
              <div className="text-xs font-medium uppercase text-stone-500">{d.setLocale("en-GB").toFormat("ccc")}</div>
              <div className="text-lg font-semibold">{d.day}</div>
              <div className="mt-2 space-y-1.5">
                {items.length === 0 && <p className="text-xs text-stone-400">Nothing</p>}
                {items.map((it) => {
                  const s = Math.max(new Date(it.start).getTime(), dayStart);
                  const e = Math.min(new Date(it.end).getTime(), dayEnd);
                  const time = `${fmtTime(new Date(s).toISOString(), timezone)}–${e === dayEnd ? "24:00" : fmtTime(new Date(e).toISOString(), timezone)}`;
                  return (
                    <div key={it.kind + it.id} className={`rounded-lg px-2 py-1.5 text-xs ${it.kind === "booking" ? "bg-teal-50 text-teal-900" : "border border-dashed border-stone-300 text-stone-600"}`}>
                      <div className="font-medium">{time}</div>
                      <div className="truncate">{it.label}</div>
                      {it.sub && <div className="truncate text-[11px] opacity-75">{it.sub}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
