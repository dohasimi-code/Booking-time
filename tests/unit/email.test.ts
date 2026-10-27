import { describe, expect, it } from "vitest";
import { buildEmails } from "@/lib/email";
import type { BookingDetails } from "@/lib/services/bookings";

const booking: BookingDetails = {
  id: "00000000-0000-0000-0000-000000000001",
  reference: "BTD-ABCD-EFGH",
  visitorName: "Arta Krasniqi",
  visitorEmail: "arta@example.com",
  visitorPhone: "+355 69 123 4567",
  title: "Partnership chat",
  notes: "Private note",
  startsAt: new Date("2026-11-02T07:00:00Z"),
  endsAt: new Date("2026-11-02T07:30:00Z"),
  status: "confirmed",
  source: "public",
  createdAt: new Date(),
  cancelledAt: null,
  cancelledBy: null,
};

describe("notification emails", () => {
  it("sends the visitor the time, reference and their private link, and Donald the details", () => {
    process.env.APP_URL = "https://book.example.com";
    const [visitor, owner] = buildEmails(
      { type: "booking_created", booking, manageToken: "tok123" },
      "Donald",
      "donald@example.com",
      "Europe/Tirane",
    );
    expect(visitor.to).toBe("arta@example.com");
    expect(visitor.text).toContain("Monday, 2 November 2026");
    expect(visitor.text).toContain("08:00–08:30");
    expect(visitor.text).toContain("BTD-ABCD-EFGH");
    expect(visitor.text).toContain("https://book.example.com/booking/manage/tok123");
    expect(visitor.text).not.toContain("Private note");
    expect(owner.to).toBe("donald@example.com");
    expect(owner.text).toContain("+355 69 123 4567");
    expect(owner.text).toContain("Private note");
    expect(owner.text).not.toContain("tok123");
  });

  it("skips Donald's copy when no notification address is set", () => {
    const emails = buildEmails({ type: "booking_created", booking, manageToken: "t" }, "Donald", null, "Europe/Tirane");
    expect(emails).toHaveLength(1);
  });
});
