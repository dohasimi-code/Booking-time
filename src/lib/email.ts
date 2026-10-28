import { DateTime } from "luxon";
import type { BookingDetails } from "./services/bookings";
import { getSettings } from "./settings";
import { getPool } from "./db";

// Email notifications. Delivery is only attempted when RESEND_API_KEY and EMAIL_FROM are set;
// otherwise each notification is skipped and logged, and bookings still work normally.
// To use another provider, replace `sendEmail` only.

export type Notification =
  | { type: "booking_created"; booking: BookingDetails; manageToken: string }
  | { type: "booking_cancelled"; booking: BookingDetails; by: "visitor" | "admin"; notifyVisitor: boolean }
  | {
      type: "booking_rescheduled";
      booking: BookingDetails;
      previousStart: Date;
      by: "visitor" | "admin";
      notifyVisitor: boolean;
    };

interface Email {
  to: string;
  subject: string;
  text: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail(email: Email): Promise<void> {
  if (!emailConfigured()) {
    console.info(`[email] not configured, skipped: "${email.subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
}

function when(b: BookingDetails, zone: string) {
  const s = DateTime.fromJSDate(b.startsAt, { zone });
  const e = DateTime.fromJSDate(b.endsAt, { zone });
  return {
    date: s.setLocale("en-GB").toFormat("cccc, d LLLL yyyy"),
    time: `${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")} (${zone})`,
  };
}

export function buildEmails(n: Notification, ownerName: string, ownerEmail: string | null, zone: string): Email[] {
  // On Vercel the production URL is provided automatically if APP_URL isn't set.
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  const appUrl = (process.env.APP_URL || vercelUrl).replace(/\/$/, "");
  const b = n.booking;
  const w = when(b, zone);
  const lines = [`Date: ${w.date}`, `Time: ${w.time}`, b.title ? `Meeting: ${b.title}` : null, `Reference: ${b.reference}`]
    .filter(Boolean)
    .join("\n");
  const ownerDetails = [
    `Name: ${b.visitorName}`,
    `Email: ${b.visitorEmail}`,
    b.visitorPhone ? `Phone: ${b.visitorPhone}` : null,
    b.title ? `Meeting: ${b.title}` : null,
    b.notes ? `Notes: ${b.notes}` : null,
    `Date: ${w.date}`,
    `Time: ${w.time}`,
    `Reference: ${b.reference}`,
  ]
    .filter(Boolean)
    .join("\n");
  const out: Email[] = [];

  if (n.type === "booking_created") {
    const manage = `${appUrl}/booking/manage/${n.manageToken}`;
    out.push({
      to: b.visitorEmail,
      subject: `Your meeting with ${ownerName} is confirmed`,
      text: `Hi ${b.visitorName},\n\nYour meeting with ${ownerName} is confirmed.\n\n${lines}\n\nNeed to cancel or change the time? Use your personal link (don't share it):\n${manage}\n`,
    });
    if (ownerEmail) out.push({ to: ownerEmail, subject: `New booking: ${b.visitorName}, ${w.date}`, text: ownerDetails });
  } else if (n.type === "booking_cancelled") {
    if (n.notifyVisitor) {
      out.push({
        to: b.visitorEmail,
        subject: `Your meeting with ${ownerName} has been cancelled`,
        text: `Hi ${b.visitorName},\n\nThis meeting has been cancelled.\n\n${lines}\n`,
      });
    }
    if (ownerEmail && n.by === "visitor") {
      out.push({ to: ownerEmail, subject: `Cancelled: ${b.visitorName}, ${w.date}`, text: ownerDetails });
    }
  } else {
    if (n.notifyVisitor) {
      out.push({
        to: b.visitorEmail,
        subject: `Your meeting with ${ownerName} has moved`,
        text: `Hi ${b.visitorName},\n\nYour meeting has a new time.\n\n${lines}\n`,
      });
    }
    if (ownerEmail && n.by === "visitor") {
      out.push({ to: ownerEmail, subject: `Rescheduled: ${b.visitorName}, ${w.date}`, text: ownerDetails });
    }
  }
  return out;
}

/** Sends notifications without ever failing the booking itself. */
export async function notify(n: Notification): Promise<void> {
  try {
    const settings = await getSettings(getPool());
    const emails = buildEmails(n, settings.ownerName, settings.ownerEmail, settings.timezone);
    await Promise.all(emails.map((e) => sendEmail(e)));
  } catch (err) {
    console.error("[email] notification failed", err);
  }
}
