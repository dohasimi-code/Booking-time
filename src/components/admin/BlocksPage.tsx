"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useAdmin } from "./AdminShell";
import { Check, Modal } from "./BookingsPage";
import {
  api,
  ApiError,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fmtDay,
  fmtTime,
  inputCls,
  TimeSelect,
  toInstant,
} from "./api";

interface Block { id: string; startsAt: string; endsAt: string; reason: string | null }
interface Conflict { id: string; reference: string; visitorName: string; startsAt: string; endsAt: string }
interface Recurring { dayOfWeek: number; startMinute: number; endMinute: number; reason: string | null; active: boolean }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function BlocksPage() {
  const { timezone } = useAdmin();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [editing, setEditing] = useState<Block | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { blocks } = await api<{ blocks: Block[] }>("/api/admin/blocks");
    setBlocks(blocks);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(b: Block) {
    await api(`/api/admin/blocks/${b.id}`, { method: "DELETE" });
    setMessage("Block removed. Those times are bookable again.");
    load();
  }

  const describe = (b: Block) => {
    const s = DateTime.fromISO(b.startsAt, { zone: timezone });
    const e = DateTime.fromISO(b.endsAt, { zone: timezone });
    const wholeDays = s.toFormat("HH:mm") === "00:00" && e.toFormat("HH:mm") === "00:00";
    if (wholeDays) {
      const last = e.minus({ days: 1 });
      return s.hasSame(last, "day") ? `${fmtDay(b.startsAt, timezone)} · whole day` : `${fmtDay(b.startsAt, timezone)} – ${last.setLocale("en-GB").toFormat("ccc d LLL yyyy")} · whole days`;
    }
    if (s.hasSame(e, "day")) return `${fmtDay(b.startsAt, timezone)} · ${fmtTime(b.startsAt, timezone)}–${fmtTime(b.endsAt, timezone)}`;
    return `${fmtDay(b.startsAt, timezone)} ${fmtTime(b.startsAt, timezone)} – ${fmtDay(b.endsAt, timezone)} ${fmtTime(b.endsAt, timezone)}`;
  };

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Block time</h1>
            <p className="mt-1 text-sm text-stone-600">Mark times when you&apos;re not available. Visitors only see these times as unavailable, never your reason.</p>
          </div>
          <button className={btnPrimary} onClick={() => setEditing("new")}>+ Block time</button>
        </div>
        {message && <p role="status" className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{message}</p>}
        {!blocks && <p className="mt-6 text-stone-500">Loading…</p>}
        {blocks && blocks.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">No upcoming blocked times.</p>}
        {blocks && blocks.length > 0 && (
          <ul className="mt-6 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">{describe(b)}</div>
                  <div className="text-sm text-stone-500">{b.reason ?? "No reason added"}</div>
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={() => setEditing(b)}>Edit</button>
                  <button className={btnSecondary} onClick={() => remove(b)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecurringBlocks />

      {editing && (
        <BlockForm
          block={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setMessage(msg); load(); }}
        />
      )}
    </div>
  );
}

function BlockForm({ block, onClose, onSaved }: { block: Block | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const { timezone } = useAdmin();
  const s = block ? DateTime.fromISO(block.startsAt, { zone: timezone }) : DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day").set({ hour: 10 });
  const e = block ? DateTime.fromISO(block.endsAt, { zone: timezone }) : s.plus({ hours: 1 });
  const initialWhole = block ? s.toFormat("HH:mm") === "00:00" && e.toFormat("HH:mm") === "00:00" : false;
  const [whole, setWhole] = useState(initialWhole);
  const [startDate, setStartDate] = useState(s.toISODate()!);
  const [endDate, setEndDate] = useState((initialWhole ? e.minus({ days: 1 }) : e).toISODate()!);
  const [startTime, setStartTime] = useState(s.toFormat("HH:mm"));
  const [endTime, setEndTime] = useState(e.toFormat("HH:mm"));
  const [reason, setReason] = useState(block?.reason ?? "");
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function range(): { start: string; end: string } | null {
    if (whole) {
      const start = DateTime.fromISO(startDate, { zone: timezone }).startOf("day");
      const end = DateTime.fromISO(endDate, { zone: timezone }).plus({ days: 1 }).startOf("day");
      return start.isValid && end.isValid ? { start: start.toISO()!, end: end.toISO()! } : null;
    }
    const start = toInstant(startDate, startTime, timezone);
    // An end time of 00:00 means midnight at the end of the "to" date.
    const end = endTime === "00:00"
      ? DateTime.fromISO(endDate, { zone: timezone }).plus({ days: 1 }).startOf("day").toISO()
      : toInstant(endDate, endTime, timezone);
    return start && end ? { start, end } : null;
  }

  async function save(conflictAction?: "keep" | "cancel") {
    const r = range();
    if (!r) return setError("Please enter valid dates and times.");
    if (new Date(r.end) <= new Date(r.start)) return setError("The end must be after the start.");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ cancelled: unknown[]; kept: unknown[] }>(block ? `/api/admin/blocks/${block.id}` : "/api/admin/blocks", {
        method: block ? "PUT" : "POST",
        body: { ...r, reason, conflictAction },
      });
      onSaved(
        res.cancelled.length
          ? `Time blocked. ${res.cancelled.length} booking(s) cancelled as you chose.`
          : res.kept.length
            ? `Time blocked. ${res.kept.length} existing booking(s) kept.`
            : "Time blocked. It's no longer bookable.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.body.error === "block_conflict") setConflicts(err.body.conflicts as Conflict[]);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (conflicts) {
    return (
      <Modal title="This time has bookings" onClose={onClose}>
        <p className="text-sm text-stone-700">These confirmed appointments fall inside the period you want to block. Nothing has been changed yet.</p>
        <ul className="mt-4 space-y-2">
          {conflicts.map((c) => (
            <li key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <span className="font-medium">{c.visitorName}</span> · {fmtDay(c.startsAt, timezone)} {fmtTime(c.startsAt, timezone)}–{fmtTime(c.endsAt, timezone)}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2">
          <button disabled={busy} className={btnPrimary} onClick={() => save("keep")}>Block the time but keep these bookings</button>
          <button disabled={busy} className={btnDanger} onClick={() => save("cancel")}>Block the time and cancel these bookings</button>
          <button className={btnSecondary} onClick={() => setConflicts(null)}>Go back and change the times</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={block ? "Edit blocked time" : "Block time"} onClose={onClose}>
      <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <Check label="Whole day(s)" checked={whole} onChange={setWhole} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">From date
            <input type="date" required value={startDate} onChange={(ev) => { setStartDate(ev.target.value); if (ev.target.value > endDate) setEndDate(ev.target.value); }} className={inputCls} />
          </label>
          <label className="block text-sm font-medium">To date
            <input type="date" required value={endDate} min={startDate} onChange={(ev) => setEndDate(ev.target.value)} className={inputCls} />
          </label>
          {!whole && (
            <>
              <label className="block text-sm font-medium">Start time
                <input type="time" required value={startTime} onChange={(ev) => setStartTime(ev.target.value)} className={inputCls} step={300} />
              </label>
              <label className="block text-sm font-medium">End time
                <input type="time" required value={endTime} onChange={(ev) => setEndTime(ev.target.value)} className={inputCls} step={300} />
              </label>
            </>
          )}
        </div>
        {!whole && <p className="text-xs text-stone-500">Tip: an end time of 00:00 means until midnight.</p>}
        <label className="block text-sm font-medium">Private reason <span className="font-normal text-stone-400">(only you see this)</span>
          <input value={reason} onChange={(ev) => setReason(ev.target.value)} className={inputCls} maxLength={300} placeholder="e.g. Dentist, holiday" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
        <div className="flex gap-2 pt-2"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save blocked time"}</button><button type="button" onClick={onClose} className={btnSecondary}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function RecurringBlocks() {
  const [items, setItems] = useState<Recurring[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ recurringBlocks: Recurring[] }>("/api/admin/schedule").then((r) => setItems(r.recurringBlocks));
  }, []);

  async function save() {
    if (!items) return;
    setError(null);
    try {
      const r = await api<{ recurringBlocks: Recurring[] }>("/api/admin/schedule", { method: "PUT", body: { blocks: items } });
      setItems(r.recurringBlocks);
      setSaved("Saved.");
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const update = (i: number, patch: Partial<Recurring>) => setItems(items!.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <section>
      <h2 className="text-lg font-semibold">Repeating blocks</h2>
      <p className="mt-1 text-sm text-stone-600">Block the same time every week, for example every Friday afternoon.</p>
      {items && (
        <div className="mt-4 space-y-2">
          {items.length === 0 && <p className="text-sm text-stone-500">No repeating blocks.</p>}
          {items.map((it, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3">
              <label className="text-sm font-medium">Every
                <select value={it.dayOfWeek} onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })} className={inputCls}>
                  {DAYS.map((d, k) => <option key={d} value={k + 1}>{d}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">From
                <TimeSelect label="From" value={it.startMinute} onChange={(v) => update(i, { startMinute: v })} className={inputCls} />
              </label>
              <label className="text-sm font-medium">Until
                <TimeSelect label="Until" value={it.endMinute} allowMidnight onChange={(v) => update(i, { endMinute: v })} className={inputCls} />
              </label>
              <label className="min-w-40 flex-1 text-sm font-medium">Private reason
                <input value={it.reason ?? ""} onChange={(e) => update(i, { reason: e.target.value })} className={inputCls} />
              </label>
              <Check label="On" checked={it.active} onChange={(v) => update(i, { active: v })} />
              <button className={btnSecondary} onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button className={btnSecondary} onClick={() => setItems([...items, { dayOfWeek: 5, startMinute: 720, endMinute: 960, reason: null, active: true }])}>+ Add repeating block</button>
            <button className={btnPrimary} onClick={save}>Save repeating blocks</button>
            {saved && <span className="text-sm text-teal-700">{saved}</span>}
            {error && <span className="text-sm text-red-700">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
