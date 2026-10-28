"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";

const AdminContext = createContext({ timezone: "Europe/Tirane", publicSlug: "donald" });
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: "/admin", label: "Bookings" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/blocks", label: "Block time" },
  { href: "/admin/availability", label: "Weekly hours" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminShell({
  children,
  adminName,
  timezone,
  publicSlug,
}: {
  children: React.ReactNode;
  adminName: string;
  timezone: string;
  publicSlug: string;
}) {
  const pathname = usePathname();
  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <AdminContext.Provider value={{ timezone, publicSlug }}>
      <div className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-teal-700">Booking Time with Donald</p>
              <p className="text-sm text-stone-600">Signed in as {adminName}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <a href={`/book/${publicSlug}`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 text-stone-700 hover:bg-stone-100">
                View booking page ↗
              </a>
              <button onClick={signOut} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-700 hover:bg-stone-50">
                Sign out
              </button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-teal-700 text-teal-800" : "border-transparent text-stone-500 hover:text-stone-900"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
