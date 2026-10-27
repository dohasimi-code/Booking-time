import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BookingApp from "@/components/BookingApp";
import { getPool } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking Time with Donald",
  openGraph: { title: "Booking Time with Donald", description: "Pick a free time and book a meeting with Donald." },
};

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const settings = await getSettings(getPool());
  if (slug.toLowerCase() !== settings.publicSlug) notFound();
  return (
    <BookingApp
      ownerName={settings.ownerName}
      timezone={settings.timezone}
      durationMinutes={settings.meetingDurationMin}
      emailEnabled={emailConfigured()}
    />
  );
}
