"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = "/admin";
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Sign-in failed. Please try again.");
    } catch {
      setError("Sign-in failed. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Booking Time with Donald</p>
        <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-stone-600">For Donald only. Visitors don&apos;t need an account.</p>
        <label className="mt-6 block">
          <span className="text-sm font-medium">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30" />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30" />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-teal-700 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
