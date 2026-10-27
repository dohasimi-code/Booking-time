"use client";

import { useEffect, useState } from "react";
import { api, btnPrimary, btnSecondary, TimeSelect } from "./api";

interface Rule { dayOfWeek: number; startMinute: number; endMinute: number; active: boolean }
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ rules: Rule[] }>("/api/admin/schedule").then((r) => setRules(r.rules));
  }, []);

  if (!rules) return <p className="text-stone-500">Loading…</p>;

  const update = (idx: number, patch: Partial<Rule>) => setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  async function save() {
    setStatus(null);
    try {
      const r = await api<{ rules: Rule[] }>("/api/admin/schedule", { method: "PUT", body: { rules } });
      setRules(r.rules);
      setStatus({ ok: true, text: "Weekly hours saved. The booking page uses them right away." });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Weekly hours</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        The times you&apos;re usually available. Overlapping periods are combined automatically. Bookings, blocked time,
        buffers and notice rules are taken out on top of these hours. Choose &quot;24:00&quot; to stay available until midnight.
      </p>
      <div className="mt-6 space-y-3">
        {DAYS.map((day, d) => {
          const dayNo = d + 1;
          const entries = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.dayOfWeek === dayNo);
          return (
            <div key={day} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{day}</h2>
                <button className="text-sm font-medium text-teal-700 hover:underline"
                  onClick={() => setRules([...rules, { dayOfWeek: dayNo, startMinute: 540, endMinute: 1020, active: true }])}>
                  + Add hours
                </button>
              </div>
              {entries.length === 0 && <p className="mt-2 text-sm text-stone-500">Not available</p>}
              <div className="mt-2 space-y-2">
                {entries.map(({ r, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <TimeSelect label={`${day} from`} value={r.startMinute} onChange={(v) => update(i, { startMinute: v })} />
                    <span className="text-stone-400">to</span>
                    <TimeSelect label={`${day} until`} value={r.endMinute} allowMidnight onChange={(v) => update(i, { endMinute: v })} />
                    <label className="flex items-center gap-1 text-sm text-stone-600">
                      <input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} className="accent-teal-700" /> On
                    </label>
                    <button className="text-sm text-stone-500 hover:text-red-700" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-stone-50 py-4">
        <button className={btnPrimary} onClick={save}>Save weekly hours</button>
        <button className={btnSecondary} onClick={() => window.location.reload()}>Discard changes</button>
        {status && <span role="status" className={`text-sm ${status.ok ? "text-teal-700" : "text-red-700"}`}>{status.text}</span>}
      </div>
    </div>
  );
}
