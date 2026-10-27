"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { Strings } from "@/lib/i18n";

export interface PublicSlot {
  start: string;
  end: string;
  status: "available" | "booked" | "blocked";
}

interface AvailabilityResponse {
  timezone: string;
  durationMinutes: number;
  firstDate: string;
  lastDate: string;
  days: { date: string; slots: PublicSlot[] }[];
}

interface Props {
  t: Strings;
  locale: string;
  timezone: string;
  selected: PublicSlot | null;
  onSelect: (slot: PublicSlot) => void;
  refreshKey?: number;
  initialDate?: string;
}

export default function SlotPicker({ t, locale, timezone, selected, onSelect, refreshKey = 0, initialDate }: Props) {
  const today = DateTime.now().setZone(timezone).startOf("day");
  const [month, setMonth] = useState(() =>
    (initialDate ? DateTime.fromISO(initialDate, { zone: timezone }) : today).startOf("month"),
  );
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string | null>(initialDate ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const from = month.toISODate()!;
      const to = month.endOf("month").toISODate()!;
      const res = await fetch(`/api/public/availability?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d.slots])), [data]);

  // When a month loads, preselect its first date with free times.
  useEffect(() => {
    if (!data) return;
    const prefix = month.toFormat("yyyy-MM");
    if (date?.startsWith(prefix)) return;
    const first = data.days.find((d) => d.date.startsWith(prefix) && d.slots.some((s) => s.status === "available"));
    setDate(first?.date ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const firstMonth = today.startOf("month");
  const lastMonth = data ? DateTime.fromISO(data.lastDate, { zone: timezone }).startOf("month") : month;
  const canPrev = month > firstMonth;
  const canNext = month < lastMonth;

  const weeks = useMemo(() => {
    const start = month.startOf("week"); // Monday
    const cells: DateTime[] = [];
    for (let d = start; d <= month.endOf("month").endOf("week"); d = d.plus({ days: 1 })) cells.push(d);
    return cells;
  }, [month]);

  const weekdayNames = useMemo(
    () => Array.from({ length: 7 }, (_, i) => month.startOf("week").plus({ days: i }).setLocale(locale).toFormat("ccc")),
    [month, locale],
  );

  const daySlots = date ? (byDate.get(date) ?? []) : [];
  const fmt = (iso: string) => DateTime.fromISO(iso, { zone: timezone }).toFormat("HH:mm");

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="pick-date">
        <h2 id="pick-date" className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          1. {t.stepDate}
        </h2>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth(month.minus({ months: 1 }))}
            disabled={!canPrev}
            aria-label={t.prevMonth}
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ‹
          </button>
          <div className="font-medium capitalize text-stone-900" aria-live="polite">
            {month.setLocale(locale).toFormat("LLLL yyyy")}
          </div>
          <button
            type="button"
            onClick={() => setMonth(month.plus({ months: 1 }))}
            disabled={!canNext}
            aria-label={t.nextMonth}
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-400">
          {weekdayNames.map((n) => (
            <div key={n} className="py-1 capitalize">
              {n}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.map((d) => {
            const iso = d.toISODate()!;
            const inMonth = d.month === month.month;
            const slots = byDate.get(iso);
            const free = slots?.filter((s) => s.status === "available").length ?? 0;
            const isSelected = date === iso;
            const isToday = iso === today.toISODate();
            if (!inMonth) return <div key={iso} />;
            return (
              <button
                key={iso}
                type="button"
                disabled={free === 0}
                onClick={() => setDate(iso)}
                aria-pressed={isSelected}
                aria-label={d.setLocale(locale).toFormat("cccc d LLLL")}
                className={[
                  "relative aspect-square rounded-xl text-sm transition-colors",
                  isSelected
                    ? "bg-teal-700 font-semibold text-white"
                    : free > 0
                      ? "bg-teal-50 font-medium text-teal-900 hover:bg-teal-100"
                      : "text-stone-300",
                  isToday && !isSelected ? "ring-1 ring-stone-300" : "",
                ].join(" ")}
              >
                {d.day}
                {free > 0 && !isSelected && (
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-teal-600" />
                )}
              </button>
            );
          })}
        </div>
        {loading && <p className="mt-3 text-sm text-stone-500">{t.loading}</p>}
        {error && (
          <p className="mt-3 text-sm text-red-700">
            {t.loadError}{" "}
            <button type="button" onClick={load} className="underline">
              {t.retry}
            </button>
          </p>
        )}
      </section>

      <section aria-labelledby="pick-time">
        <h2 id="pick-time" className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          2. {t.stepTime}
        </h2>
        {date && (
          <p className="mb-3 font-medium capitalize text-stone-900">
            {DateTime.fromISO(date, { zone: timezone }).setLocale(locale).toFormat("cccc, d LLLL")}
          </p>
        )}
        {!date && !loading && <p className="text-sm text-stone-500">{t.pickDateFirst}</p>}
        {date && daySlots.length > 0 && !daySlots.some((s) => s.status === "available") && (
          <p className="mb-3 text-sm text-stone-500">{t.noSlots}</p>
        )}
        <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {daySlots.map((s) => {
            const isSel = selected?.start === s.start;
            if (s.status !== "available") {
              return (
                <div
                  key={s.start}
                  aria-disabled="true"
                  className={[
                    "flex flex-col items-center rounded-lg border px-2 py-2 text-sm",
                    s.status === "booked"
                      ? "border-stone-200 bg-stone-100 text-stone-400"
                      : "border-dashed border-stone-200 bg-white text-stone-400",
                  ].join(" ")}
                >
                  <span className="line-through">{fmt(s.start)}</span>
                  <span className="text-[11px]">{s.status === "booked" ? t.booked : t.blocked}</span>
                </div>
              );
            }
            return (
              <button
                key={s.start}
                type="button"
                onClick={() => onSelect(s)}
                aria-pressed={isSel}
                className={[
                  "rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors",
                  isSel
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-teal-200 bg-white text-teal-900 hover:border-teal-600 hover:bg-teal-50",
                ].join(" ")}
              >
                {fmt(s.start)}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-teal-300 bg-white" /> {t.available}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-stone-200" /> {t.booked}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-dashed border-stone-300" /> {t.blocked}
          </span>
        </div>
      </section>
    </div>
  );
}
