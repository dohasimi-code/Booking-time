"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import SlotPicker, { type PublicSlot } from "./SlotPicker";
import { locales, strings, type Lang } from "@/lib/i18n";

interface Booking {
  reference: string;
  name: string;
  email: string;
  title: string | null;
  start: string;
  end: string;
  status: "confirmed" | "cancelled" | "completed";
}

const text = {
  en: {
    heading: "Your booking",
    notFound: "We couldn't find this booking. Please check the link.",
    statusConfirmed: "Confirmed",
    statusCancelled: "Cancelled",
    statusCompleted: "Completed",
    cancel: "Cancel booking",
    cancelConfirm: "Yes, cancel it",
    cancelAsk: "Are you sure you want to cancel this meeting?",
    keep: "Keep booking",
    reschedule: "Change time",
    saveNew: "Move to this time",
    cancelled: "Your booking has been cancelled.",
    moved: "Your booking has been moved.",
    bookNew: "Book a new time",
  },
  sq: {
    heading: "Rezervimi juaj",
    notFound: "Ky rezervim nuk u gjet. Ju lutemi kontrolloni lidhjen.",
    statusConfirmed: "I konfirmuar",
    statusCancelled: "I anuluar",
    statusCompleted: "I përfunduar",
    cancel: "Anulo rezervimin",
    cancelConfirm: "Po, anuloje",
    cancelAsk: "Jeni i sigurt që doni ta anuloni këtë takim?",
    keep: "Mbaje rezervimin",
    reschedule: "Ndrysho orën",
    saveNew: "Zhvendose në këtë orë",
    cancelled: "Rezervimi juaj u anulua.",
    moved: "Rezervimi juaj u zhvendos.",
    bookNew: "Rezervo një orë të re",
  },
};

export default function ManageBooking({ token, ownerName, timezone }: { token: string; ownerName: string; timezone: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = strings[lang];
  const m = text[lang];
  const locale = locales[lang];
  const [booking, setBooking] = useState<Booking | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("btd-lang");
      if (saved === "sq" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/public/manage/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return setState("missing");
    setBooking(await res.json());
    setState("ready");
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(body: object, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/public/manage/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBooking(data);
        setMode("view");
        setSlot(null);
        setMessage({ kind: "ok", text: okText });
      } else {
        setMessage({ kind: "error", text: data.error === "slot_unavailable" ? t.takenError : (data.message ?? t.genericError) });
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setMessage({ kind: "error", text: t.genericError });
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string, f: string) => DateTime.fromISO(iso, { zone: timezone }).setLocale(locale).toFormat(f);
  const statusLabel = booking
    ? { confirmed: m.statusConfirmed, cancelled: m.statusCancelled, completed: m.statusCompleted }[booking.status]
    : "";
  const canChange = booking?.status === "confirmed" && new Date(booking.start) > new Date();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">{t.title}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{m.heading}</h1>
        </div>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {(["en", "sq"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`rounded-md px-3 py-1 ${lang === l ? "bg-stone-900 text-white" : "text-stone-600"}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {message && (
        <div role="status" className={`mb-6 rounded-xl border px-4 py-3 text-sm ${message.kind === "ok" ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {message.text}
        </div>
      )}

      <main className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        {state === "loading" && <p className="text-stone-500">{t.loading}</p>}
        {state === "missing" && (
          <div className="text-center">
            <p className="text-stone-700">{m.notFound}</p>
            <Link href="/" className="mt-4 inline-block font-medium text-teal-700 underline">{m.bookNew}</Link>
          </div>
        )}
        {state === "ready" && booking && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{booking.title ?? `${ownerName}`}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${booking.status === "confirmed" ? "bg-teal-100 text-teal-800" : "bg-stone-100 text-stone-600"}`}>
                {statusLabel}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-stone-500">{t.date}</dt><dd className="font-medium capitalize">{fmt(booking.start, "cccc, d LLLL yyyy")}</dd></div>
              <div><dt className="text-stone-500">{t.time}</dt><dd className="font-medium">{fmt(booking.start, "HH:mm")}–{fmt(booking.end, "HH:mm")} ({timezone})</dd></div>
              <div><dt className="text-stone-500">{t.name}</dt><dd className="font-medium">{booking.name}</dd></div>
              <div><dt className="text-stone-500">{t.reference}</dt><dd className="font-mono font-medium">{booking.reference}</dd></div>
            </dl>

            {canChange && mode === "view" && (
              <div className="mt-8 flex flex-col gap-3 border-t border-stone-100 pt-6 sm:flex-row">
                <button type="button" onClick={() => setMode("reschedule")} className="rounded-xl bg-teal-700 px-5 py-2.5 font-medium text-white hover:bg-teal-800">{m.reschedule}</button>
                <button type="button" onClick={() => setMode("cancel")} className="rounded-xl border border-stone-300 px-5 py-2.5 font-medium text-stone-800 hover:bg-stone-50">{m.cancel}</button>
              </div>
            )}

            {mode === "cancel" && (
              <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="font-medium text-red-900">{m.cancelAsk}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button type="button" disabled={busy} onClick={() => act({ action: "cancel" }, m.cancelled)} className="rounded-xl bg-red-700 px-5 py-2.5 font-medium text-white hover:bg-red-800 disabled:opacity-60">{m.cancelConfirm}</button>
                  <button type="button" onClick={() => setMode("view")} className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 font-medium">{m.keep}</button>
                </div>
              </div>
            )}

            {mode === "reschedule" && (
              <div className="mt-8 border-t border-stone-100 pt-6">
                <SlotPicker t={t} locale={locale} timezone={timezone} selected={slot} onSelect={setSlot} refreshKey={refreshKey} />
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => { setMode("view"); setSlot(null); }} className="rounded-xl border border-stone-300 px-5 py-2.5 font-medium">{t.back}</button>
                  <button type="button" disabled={!slot || busy} onClick={() => slot && act({ action: "reschedule", start: slot.start }, m.moved)} className="rounded-xl bg-teal-700 px-5 py-2.5 font-medium text-white disabled:bg-stone-300">
                    {m.saveNew}{slot ? ` · ${fmt(slot.start, "d LLL HH:mm")}` : ""}
                  </button>
                </div>
              </div>
            )}
            {booking.status === "cancelled" && (
              <Link href="/" className="mt-8 inline-block font-medium text-teal-700 underline">{m.bookNew}</Link>
            )}
          </>
        )}
      </main>
    </div>
  );
}
