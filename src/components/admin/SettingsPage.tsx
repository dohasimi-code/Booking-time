"use client";

import { useEffect, useState } from "react";
import { api, btnPrimary, btnSecondary, inputCls } from "./api";

interface Settings {
  ownerName: string;
  ownerEmail: string | null;
  publicSlug: string;
  timezone: string;
  meetingDurationMin: number;
  slotIntervalMin: number;
  bufferMin: number;
  minNoticeMin: number;
  maxHorizonDays: number;
}

const NOTICE = [
  [0, "No minimum"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"],
  [720, "12 hours"], [1440, "1 day"], [2880, "2 days"],
] as const;

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [emailOn, setEmailOn] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ settings: Settings; emailConfigured: boolean }>("/api/admin/settings").then((r) => {
      setS(r.settings);
      setEmailOn(r.emailConfigured);
    });
  }, []);
  if (!s) return <p className="text-stone-500">Loading…</p>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/book/${s.publicSlug}` : "";
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });

  async function save() {
    setStatus(null);
    try {
      const { ownerName, ownerEmail, meetingDurationMin, slotIntervalMin, bufferMin, minNoticeMin, maxHorizonDays } = s!;
      const r = await api<{ settings: Settings }>("/api/admin/settings", {
        method: "PUT",
        body: { ownerName, ownerEmail: ownerEmail || undefined, meetingDurationMin, slotIntervalMin, bufferMin, minNoticeMin, maxHorizonDays },
      });
      setS(r.settings);
      setStatus({ ok: true, text: "Settings saved." });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">Your booking link</h2>
        <p className="mt-1 text-sm text-stone-600">Share this by email, WhatsApp, SMS or LinkedIn.</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={link} className={`${inputCls} mt-0`} onFocus={(e) => e.target.select()} />
          <button className={btnSecondary} onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">Meetings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Meeting length
            <select value={s.meetingDurationMin} onChange={num("meetingDurationMin")} className={inputCls}>
              {[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              {![15, 30, 45, 60].includes(s.meetingDurationMin) && <option value={s.meetingDurationMin}>{s.meetingDurationMin} minutes</option>}
            </select>
          </label>
          <label className="block text-sm font-medium">Offer a start time every
            <select value={s.slotIntervalMin} onChange={num("slotIntervalMin")} className={inputCls}>
              {[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Break between meetings
            <select value={s.bufferMin} onChange={num("bufferMin")} className={inputCls}>
              {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m === 0 ? "No break" : `${m} minutes`}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Minimum notice
            <select value={s.minNoticeMin} onChange={num("minNoticeMin")} className={inputCls}>
              {NOTICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!NOTICE.some(([v]) => v === s.minNoticeMin) && <option value={s.minNoticeMin}>{s.minNoticeMin} minutes</option>}
            </select>
          </label>
          <label className="block text-sm font-medium">People can book up to
            <select value={s.maxHorizonDays} onChange={num("maxHorizonDays")} className={inputCls}>
              {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days ahead</option>)}
              {![7, 14, 30, 60, 90, 180, 365].includes(s.maxHorizonDays) && <option value={s.maxHorizonDays}>{s.maxHorizonDays} days ahead</option>}
            </select>
          </label>
          <label className="block text-sm font-medium">Time zone
            <input readOnly value={s.timezone} className={`${inputCls} bg-stone-50`} />
          </label>
        </div>
        <p className="mt-3 text-xs text-stone-500">Changes apply to new bookings. Existing bookings keep their times.</p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">You</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Name shown to visitors
            <input value={s.ownerName} onChange={(e) => setS({ ...s, ownerName: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-sm font-medium">Email for booking notifications
            <input type="email" value={s.ownerEmail ?? ""} onChange={(e) => setS({ ...s, ownerEmail: e.target.value })} className={inputCls} />
          </label>
        </div>
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${emailOn ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
          {emailOn ? "Email notifications are switched on." : "Email notifications are not set up yet. Bookings work normally and show an on-screen confirmation."}
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={save}>Save settings</button>
        {status && <span role="status" className={`text-sm ${status.ok ? "text-teal-700" : "text-red-700"}`}>{status.text}</span>}
      </div>
    </div>
  );
}
