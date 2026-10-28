import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Booking Time with Donald", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  const settings = await getSettings(getPool());
  return (
    <AdminShell adminName={admin.name} timezone={settings.timezone} publicSlug={settings.publicSlug}>
      {children}
    </AdminShell>
  );
}
