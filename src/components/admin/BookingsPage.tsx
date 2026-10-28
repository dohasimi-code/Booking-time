"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useAdmin } from "./AdminShell";
import {
  api,
  ApiError,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fmtDay,
  fmtTime,
  inputCls,
  STATUS_STYLES,
  toInstant,
  type AdminBooking,
} from "./api";

type Scope = "upcoming" | "past" | "all";

export default function BookingsPage() {
  const { timezone } = useAdmin();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const { bookings } = await api<{ bookings: AdminBooking[] }>(`/api/admin/bookings?${params}`);
      setBookings(bookings);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope, status, q]);

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <button className={btnPrimary} onClick={() => setCreating(true)}>+ New booking</button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {(["upcoming", "past", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 capitalize ${scope === s ? "bg-stone-900 text-white" : "text-stone-600"}`}>
              {s}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} mt-0 sm:w-44`} aria-label="Status">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
        <input type="search" placeholder="Search name, email, phone, title or reference" value={q}
          onChange={(e) => setQ(e.target.value)} className={`${inputCls} mt-0 sm:flex-1`} />
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {!bookings && !error && <p className="mt-6 text-stone-500">Loading…</p>}
      {bookings && bookings.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">No bookings here yet.</p>
      )}
      {bookings && bookings.length > 0 && (
        <ul className="mt-6 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {bookings.map((b) => (
            <li key={b.id}>
              <button onClick={() => setSelected(b)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-4">
                <div className="w-44 shrink-0">
                  <div className="text-sm font-medium">{fmtDay(b.startsAt, timezone)}</div>
                  <div className="text-sm text-stone-500">{fmtTime(b.startsAt, timezone)}–{fmtTime(b.endsAt, timezone)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.visitorName}</div>
                  <div className="truncate text-sm text-stone-500">{b.title ?? "No title"} · {b.visitorEmail}</div>
                </div>
                <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-medium capitalize sm:self-center ${STATUS_STYLES[b.status]}`}>{b.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <BookingDetail booking={selected} onClose={() => setSelected(null)} onChanged={(b) => { setSelected(b); load(); }} onDeleted={() => { setSelected(null); load(); }} />
      )}
      {creating && <NewBooking onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 text-xl text-stone-500 hover:bg-stone-100">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DateTimeFields({ date, time, onDate, onTime }: { date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium">Date
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={inputCls} required />
      </label>
      <label className="block text-sm font-medium">Start time
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className={inputCls} required step={300} />
      </label>
    </div>
  );
}

function BookingDetail({ booking, onClose, onChanged, onDeleted }: {
  booking: AdminBooking; onClose: () => void; onChanged: (b: AdminBooking) => void; onDeleted: () => void;
}) {
  const { timezone } = useAdmin();
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel" | "edit" | "delete">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = DateTime.fromISO(booking.startsAt, { zone: timezone });
  const [date, setDate] = useState(start.toISODate()!);
  const [time, setTime] = useState(start.toFormat("HH:mm"));
  const [outside, setOutside] = useState(false);
  const [notifyVisitor, setNotifyVisitor] = useState(true);
  const [edit, setEdit] = useState({ name: booking.visitorName, email: booking.visitorEmail, phone: booking.visitorPhone ?? "", title: booking.title ?? "", notes: booking.notes ?? "" });
  const active = booking.status === "confirmed";
  const upcoming = new Date(booking.endsAt) > new Date();

  async function patch(body: object) {
    setBusy(true);
    setError(null);
    try {
      const { booking: b } = await api<{ booking: AdminBooking }>(`/api/admin/bookings/${booking.id}`, { method: "PATCH", body });
      setMode("view");
      onChanged(b);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/admin/bookings/${booking.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={booking.visitorName} onClose={onClose}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[booking.status]}`}>{booking.status}</span>
        <span className="font-mono text-xs text-stone-500">{booking.reference}</span>
        {booking.source === "admin" && <span className="text-xs text-stone-500">· added by you</span>}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Info label="When" value={`${fmtDay(booking.startsAt, timezone)}, ${fmtTime(booking.startsAt, timezone)}–${fmtTime(booking.endsAt, timezone)}`} />
        <Info label="Email" value={<a className="text-teal-700 underline" href={`mailto:${booking.visitorEmail}`}>{booking.visitorEmail}</a>} />
        <Info label="Phone" value={booking.visitorPhone ? <a className="text-teal-700 underline" href={`tel:${booking.visitorPhone}`}>{booking.visitorPhone}</a> : "—"} />
        <Info label="Title" value={booking.title ?? "—"} />
        <Info label="Notes" value={booking.notes ? <span className="whitespace-pre-wrap">{booking.notes}</span> : "—"} />
        <Info label="Booked" value={DateTime.fromISO(booking.createdAt, { zone: timezone }).toFormat("d LLL yyyy, HH:mm")} />
        {booking.cancelledAt && <Info label="Cancelled" value={`${DateTime.fromISO(booking.cancelledAt, { zone: timezone }).toFormat("d LLL yyyy, HH:mm")} by ${booking.cancelledBy}`} />}
      </dl>

      {error && <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

      {mode === "view" && (
        <div className="mt-6 flex flex-wrap gap-2">
          {active && upcoming && <button className={btnPrimary} onClick={() => setMode("reschedule")}>Reschedule</button>}
          {active && upcoming && <button className={btnSecondary} onClick={() => setMode("cancel")}>Cancel booking</button>}
          {active && !upcoming && <button className={btnSecondary} onClick={() => patch({ action: "complete" })}>Mark completed</button>}
          <button className={btnSecondary} onClick={() => setMode("edit")}>Edit details</button>
          {!(active && upcoming) && <button className={btnSecondary} onClick={() => setMode("delete")}>Delete…</button>}
        </div>
      )}

      {mode === "reschedule" && (
        <form className="mt-6 space-y-3 border-t border-stone-100 pt-4" onSubmit={(e) => {
          e.preventDefault();
          const s = toInstant(date, time, timezone);
          if (!s) return setError("Please enter a valid date and time.");
          patch({ action: "reschedule", start: s, outsideSchedule: outside, notifyVisitor });
        }}>
          <p className="text-sm font-medium">New time ({timezone})</p>
          <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
          <Check label="Allow a time outside my weekly hours" checked={outside} onChange={setOutside} />
          <Check label="Email the visitor about the change (when email is set up)" checked={notifyVisitor} onChange={setNotifyVisitor} />
          <div className="flex gap-2"><button disabled={busy} className={btnPrimary}>Save new time</button><button type="button" className={btnSecondary} onClick={() => setMode("view")}>Back</button></div>
        </form>
      )}

      {mode === "cancel" && (
        <div className="mt-6 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">Cancel this meeting with {booking.visitorName}? The time becomes free for others to book.</p>
          <Check label="Email the visitor about the cancellation (when email is set up)" checked={notifyVisitor} onChange={setNotifyVisitor} />
          <div className="flex gap-2"><button disabled={busy} className={btnDanger} onClick={() => patch({ action: "cancel", notifyVisitor })}>Yes, cancel booking</button><button className={btnSecondary} onClick={() => setMode("view")}>Keep it</button></div>
        </div>
      )}

      {mode === "edit" && (
        <form className="mt-6 space-y-3 border-t border-stone-100 pt-4" onSubmit={(e) => { e.preventDefault(); patch({ action: "edit", ...edit }); }}>
          {(["name", "email", "phone", "title"] as const).map((k) => (
            <label key={k} className="block text-sm font-medium capitalize">{k}
              <input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={inputCls} required={k === "name" || k === "email"} />
            </label>
          ))}
          <label className="block text-sm font-medium">Notes
            <textarea rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={inputCls} />
          </label>
          <div className="flex gap-2"><button disabled={busy} className={btnPrimary}>Save</button><button type="button" className={btnSecondary} onClick={() => setMode("view")}>Back</button></div>
        </form>
      )}

      {mode === "delete" && (
        <div className="mt-6 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">This permanently deletes the booking and the visitor&apos;s personal details. It can&apos;t be undone.</p>
          <div className="flex gap-2"><button disabled={busy} className={btnDanger} onClick={remove}>Delete permanently</button><button className={btnSecondary} onClick={() => setMode("view")}>Back</button></div>
        </div>
      )}
    </Modal>
  );
}

function NewBooking({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { timezone } = useAdmin();
  const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 });
  const [form, setForm] = useState({ name: "", email: "", phone: "", title: "", notes: "" });
  const [date, setDate] = useState(tomorrow.toISODate()!);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("");
  const [outside, setOutside] = useState(false);
  const [notifyVisitor, setNotifyVisitor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const start = toInstant(date, time, timezone);
    if (!start) return setError("Please enter a valid date and time.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/bookings", {
        method: "POST",
        body: { ...form, start, outsideSchedule: outside, notifyVisitor, durationMin: duration ? Number(duration) : undefined },
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
        <label className="block text-sm font-medium">Duration
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls}>
            <option value="">Default from settings</option>
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Full name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Email
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Phone <span className="font-normal text-stone-400">(optional)</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Meeting title <span className="font-normal text-stone-400">(optional)</span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Notes <span className="font-normal text-stone-400">(optional)</span>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
        </label>
        <Check label="Allow a time outside my weekly hours" checked={outside} onChange={setOutside} />
        <Check label="Send the visitor a confirmation email (when email is set up)" checked={notifyVisitor} onChange={setNotifyVisitor} />
        {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
        <div className="flex gap-2 pt-2"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Create booking"}</button><button type="button" onClick={onClose} className={btnSecondary}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-700" />
      {label}
    </label>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
