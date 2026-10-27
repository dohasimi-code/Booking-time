import type { Metadata } from "next";
import ManageBooking from "@/components/ManageBooking";
import { getPool } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking · Booking Time with Donald", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettings(getPool());
  return <ManageBooking token={token} ownerName={settings.ownerName} timezone={settings.timezone} />;
}
