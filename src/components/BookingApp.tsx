"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import SlotPicker, { type PublicSlot } from "./SlotPicker";
import { locales, strings, type Lang } from "@/lib/i18n";
import { buildIcs, downloadIcs } from "@/lib/ics";

interface Props {
  ownerName: string;
  timezone: string;
  durationMinutes: number;
  emailEnabled: boolean;
}

type Step = "pick" | "details" | "review" | "done";

interface Form {
  name: string;
  email: string;
  phone: string;
  title: string;
  notes: string;
  website: string; // honeypot
}

interface Confirmation {
  reference: string;
  start: string;
  end: string;
  name: string;
  title: string | null;
  manageToken: string;
}

const EMPTY: Form = { name: "", email: "", phone: "", title: "", notes: "", website: "" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function BookingApp({ ownerName, timezone, durationMinutes, emailEnabled }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const t = strings[lang];
  const locale = locales[lang];
  const [step, setStep] = useState<Step>("pick");
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [done, setDone] = useState<Confirmation | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("btd-lang");
      if (saved === "sq" || saved === "en") setLang(saved);
      else if (navigator.language?.toLowerCase().startsWith("sq")) setLang("sq");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("btd-lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const viewerZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;
  const inZone = (iso: string, zone = timezone) => DateTime.fromISO(iso, { zone }).setLocale(locale);
  const dateLabel = (iso: string) => inZone(iso).toFormat("cccc, d LLLL yyyy");
  const range = (s: string, e: string, zone = timezone) => `${inZone(s, zone).toFormat("HH:mm")}–${inZone(e, zone).toFormat("HH:mm")}`;
  const differentZone = slot && inZone(slot.start).offset !== inZone(slot.start, viewerZone).offset;

  function validate(): boolean {
    const e: typeof errors = {};
    if (form.name.trim().length < 2) e.name = t.nameError;
    if (!EMAIL_RE.test(form.email.trim())) e.email = t.emailError;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function confirm() {
    if (!slot) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, start: slot.start }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setDone(body);
        setStep("done");
        return;
      }
      if (body.error === "slot_unavailable") {
        setNotice(t.takenError);
        setSlot(null);
        setRefreshKey((k) => k + 1);
        setStep("pick");
        return;
      }
      if (body.error === "invalid_input") {
        const fieldErrors: typeof errors = {};
        for (const i of body.issues ?? []) fieldErrors[i.field as keyof Form] = i.message;
        setErrors(fieldErrors);
        setStep("details");
      }
      setNotice(body.message ?? t.genericError);
    } catch {
      setNotice(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setSlot(null);
    setForm(EMPTY);
    setRefreshKey((k) => k + 1);
    setStep("pick");
  }

  const manageUrl = done && typeof window !== "undefined" ? `${window.location.origin}/booking/manage/${done.manageToken}` : "";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xl font-semibold text-white"
          >
            {ownerName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{t.title}</h1>
            <p className="mt-1 max-w-xl text-stone-600">{t.intro(ownerName)}</p>
          </div>
        </div>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm" role="group" aria-label="Language">
          {(["en", "sq"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`rounded-md px-3 py-1 ${lang === l ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"}`}
            >
              {l === "en" ? "EN" : "SQ"}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
        <span>⏱ {t.minutes(durationMinutes)}</span>
        <span>🌍 {t.tzNote(timezone.replace("_", " "))}</span>
      </div>

      {notice && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </div>
      )}

      <main className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        {step === "pick" && (
          <>
            <SlotPicker
              t={t}
              locale={locale}
              timezone={timezone}
              selected={slot}
              onSelect={(s) => {
                setSlot(s);
                setNotice(null);
              }}
              refreshKey={refreshKey}
            />
            <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-stone-100 pt-6 sm:flex-row sm:items-center">
              <p className="text-sm text-stone-600">
                {slot ? (
                  <>
                    <span className="font-medium capitalize text-stone-900">{dateLabel(slot.start)}</span> ·{" "}
                    {range(slot.start, slot.end)}
                  </>
                ) : (
                  t.pickTime
                )}
              </p>
              <button
                type="button"
                disabled={!slot}
                onClick={() => setStep("details")}
                className="rounded-xl bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {t.continue}
              </button>
            </div>
          </>
        )}

        {step === "details" && slot && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) setStep("review");
            }}
            className="mx-auto max-w-lg"
          >
            <h2 className="text-lg font-semibold text-stone-900">3. {t.stepDetails}</h2>
            <p className="mt-1 text-sm capitalize text-stone-600">
              {dateLabel(slot.start)} · {range(slot.start, slot.end)}
            </p>
            <div className="mt-6 space-y-4">
              <Field label={t.fullName} hint={t.required} error={errors.name}>
                <input
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputCls(!!errors.name)}
                  maxLength={120}
                  autoFocus
                />
              </Field>
              <Field label={t.email} hint={t.required} error={errors.email}>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls(!!errors.email)}
                  maxLength={254}
                />
              </Field>
              <Field label={t.phone} hint={t.optional} error={errors.phone}>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputCls(!!errors.phone)}
                  maxLength={40}
                />
              </Field>
              <Field label={t.meetingTitle} hint={t.optional} error={errors.title}>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={inputCls(!!errors.title)}
                  maxLength={150}
                />
              </Field>
              <Field label={t.notes} hint={t.optional} error={errors.notes}>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={inputCls(!!errors.notes)}
                  maxLength={2000}
                />
              </Field>
              <div className="hidden" aria-hidden>
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </label>
              </div>
              <p className="text-xs text-stone-500">🔒 {t.privacy}</p>
            </div>
            <div className="mt-8 flex justify-between gap-3">
              <button type="button" onClick={() => setStep("pick")} className={secondaryBtn}>
                {t.back}
              </button>
              <button type="submit" className={primaryBtn}>
                {t.continue}
              </button>
            </div>
          </form>
        )}

        {step === "review" && slot && (
          <div className="mx-auto max-w-lg">
            <h2 className="text-lg font-semibold text-stone-900">4. {t.reviewHeading}</h2>
            <dl className="mt-6 divide-y divide-stone-100 rounded-xl border border-stone-200">
              <Row label={t.date} value={<span className="capitalize">{dateLabel(slot.start)}</span>} />
              <Row
                label={t.time}
                value={
                  <>
                    {range(slot.start, slot.end)}
                    {differentZone && (
                      <span className="block text-xs text-stone-500">{t.yourTime(range(slot.start, slot.end, viewerZone))}</span>
                    )}
                  </>
                }
              />
              <Row label={t.duration} value={t.minutes(durationMinutes)} />
              <Row label={t.name} value={form.name} />
              {form.title && <Row label={t.meetingTitle} value={form.title} />}
            </dl>
            <div className="mt-8 flex flex-col-reverse justify-between gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setSlot(null);
                  setStep("pick");
                }}
                className={secondaryBtn}
              >
                {t.changeTime}
              </button>
              <button type="button" onClick={confirm} disabled={submitting} className={primaryBtn}>
                {submitting ? t.confirming : t.confirm}
              </button>
            </div>
          </div>
        )}

        {step === "done" && done && (
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-2xl text-teal-700">✓</div>
            <h2 className="mt-4 text-2xl font-semibold text-stone-900">{t.doneHeading}</h2>
            <p className="mt-1 text-stone-600">{t.doneText(ownerName)}</p>
            <dl className="mt-6 divide-y divide-stone-100 rounded-xl border border-stone-200 text-left">
              <Row label={t.date} value={<span className="capitalize">{dateLabel(done.start)}</span>} />
              <Row label={t.time} value={range(done.start, done.end)} />
              {done.title && <Row label={t.meetingTitle} value={done.title} />}
              <Row label={t.reference} value={<span className="font-mono font-semibold tracking-wide">{done.reference}</span>} />
            </dl>
            <div className="mt-6 rounded-xl bg-stone-50 p-4 text-left text-sm">
              <p className="text-stone-700">{t.manageText}</p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={manageUrl} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600" onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 font-medium text-stone-800 hover:bg-stone-100"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(manageUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {}
                  }}
                >
                  {copied ? t.copied : t.copy}
                </button>
              </div>
            </div>
            {!emailEnabled && <p className="mt-4 text-xs text-stone-500">{t.emailPending}</p>}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                className={secondaryBtn}
                onClick={() =>
                  downloadIcs(
                    `meeting-${done.reference}.ics`,
                    buildIcs({
                      uid: `${done.reference}@booking-time-with-donald`,
                      start: done.start,
                      end: done.end,
                      summary: done.title ? `${done.title} (${ownerName})` : `Meeting with ${ownerName}`,
                      description: `Reference: ${done.reference}\nManage: ${manageUrl}`,
                    }),
                  )
                }
              >
                📅 {t.addToCalendar}
              </button>
              <button type="button" className={secondaryBtn} onClick={reset}>
                {t.bookAnother}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const primaryBtn =
  "rounded-xl bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-70";
const secondaryBtn = "rounded-xl border border-stone-300 bg-white px-6 py-3 font-medium text-stone-800 hover:bg-stone-50";

function inputCls(error: boolean) {
  return `mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-teal-600/30 ${
    error ? "border-red-400 focus:border-red-500" : "border-stone-300 focus:border-teal-600"
  }`;
}

function Field({ label, hint, error, children }: { label: string; hint: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-800">
        {label} <span className="font-normal text-stone-400">({hint})</span>
      </span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-900">{value}</dd>
    </div>
  );
}
