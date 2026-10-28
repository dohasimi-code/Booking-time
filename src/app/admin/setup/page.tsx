import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminExists, setupCodeConfigured } from "@/lib/auth";
import SetupForm from "@/components/admin/SetupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up · Booking Time with Donald", robots: { index: false } };

export default async function SetupPage() {
  if (await adminExists()) redirect("/admin/login");
  return <SetupForm enabled={setupCodeConfigured()} />;
}
