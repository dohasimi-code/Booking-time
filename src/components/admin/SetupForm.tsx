"use client";

import { useState } from "react";

const field =
  "mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30";

export default function SetupForm({ enabled }: { enabled: boolean }) {
  const [form, setForm] = useState({ code: "", name: "Donald", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        window.location.href = "/admin";
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body.error === "already_set_up") window.location.href = "/admin/login";
      setError(body.message ?? "Setup failed. Please try again.");
    } catch {
      setError("Setup failed. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Booking Time with Donald</p>
        <h1 className="mt-1 text-2xl font-semibold">Create your login</h1>
        <p className="mt-1 text-sm text-stone-600">Krijoni hyrjen tuaj. Kjo bëhet vetëm një herë.</p>
        {!enabled ? (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Setup is switched off. Add ADMIN_SETUP_CODE in your hosting settings and redeploy.
          </p>
        ) : (
          <>
            <label className="mt-6 block">
              <span className="text-sm font-medium">Setup code / Kodi</span>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={field} autoComplete="off" />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium">Name / Emri</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium">Email</span>
              <input type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium">Password / Fjalëkalimi</span>
              <input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
              <span className="mt-1 block text-xs text-stone-500">At least 12 characters / Të paktën 12 shkronja</span>
            </label>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            <button disabled={busy} className="mt-6 w-full rounded-xl bg-teal-700 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
              {busy ? "Saving…" : "Create login / Krijo hyrjen"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
