import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminExists, currentAdmin } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · Booking Time with Donald", robots: { index: false } };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  if (!(await adminExists())) redirect("/admin/setup");
  return <LoginForm />;
}
