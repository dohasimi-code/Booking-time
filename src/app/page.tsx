import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getSettings(getPool());
  redirect(`/book/${settings.publicSlug}`);
}
