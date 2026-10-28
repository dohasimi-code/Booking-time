"use client";

import { DateTime } from "luxon";

export class ApiError extends Error {
  constructor(public status: number, public body: { error?: string; message?: string; [k: string]: unknown }) {
    super(body.message ?? "Request failed");
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new ApiError(401, body);
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface AdminBooking {
  id: string;
  reference: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  title: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled" | "completed";
  source: "public" | "admin";
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

export const dt = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).setLocale("en-GB");
export const fmtDay = (iso: string, zone: string) => dt(iso, zone).toFormat("ccc d LLL yyyy");
export const fmtTime = (iso: string, zone: string) => dt(iso, zone).toFormat("HH:mm");

/** Local date ("yyyy-mm-dd") and time ("HH:mm") in Donald's zone to an ISO instant. */
export function toInstant(date: string, time: string, zone: string): string | null {
  const d = DateTime.fromISO(`${date}T${time}`, { zone });
  return d.isValid ? d.toISO() : null;
}

export const minutesToHHMM = (m: number) =>
  m >= 1440 ? "24:00" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

export const STATUS_STYLES: Record<AdminBooking["status"], string> = {
  confirmed: "bg-teal-100 text-teal-800",
  cancelled: "bg-stone-100 text-stone-500",
  completed: "bg-sky-100 text-sky-800",
};

export const inputCls =
  "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30";
export const btnPrimary =
  "rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60";
export const btnSecondary =
  "rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";
export const btnDanger =
  "rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60";

export const compactInputCls =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30";

/** 24-hour time picker in 15-minute steps; `allowMidnight` adds "24:00 (midnight)" for end times. */
export function TimeSelect({ value, onChange, allowMidnight, label, className }: {
  value: number; onChange: (m: number) => void; allowMidnight?: boolean; label: string; className?: string;
}) {
  const options: number[] = [];
  for (let m = 0; m < 1440; m += 15) options.push(m);
  if (allowMidnight) options.push(1440);
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className={className ?? compactInputCls}>
      {options.map((m) => (
        <option key={m} value={m}>{m === 1440 ? "24:00 (midnight)" : minutesToHHMM(m)}</option>
      ))}
    </select>
  );
}
