import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const visitorSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That email is too long.")
    .pipe(z.email("Please enter a valid email address.")),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\d\s.-]*$/, "Please enter a valid phone number.")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  title: optionalText(150),
  notes: optionalText(2000),
});

export const isoInstant = z.iso.datetime({ offset: true, message: "Invalid time." }).transform((s) => new Date(s));

export const publicBookingSchema = visitorSchema.extend({
  start: isoInstant,
  // Honeypot field: real visitors never fill it in.
  website: z.string().max(0).optional(),
});

export const rescheduleSchema = z.object({ start: isoInstant });

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");

export const adminBookingSchema = visitorSchema.extend({
  start: isoInstant,
  durationMin: z.number().int().min(5).max(480).optional(),
  outsideSchedule: z.boolean().optional(),
  notifyVisitor: z.boolean().optional(),
});

export const adminBookingUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), notifyVisitor: z.boolean().optional() }),
  z.object({
    action: z.literal("reschedule"),
    start: isoInstant,
    outsideSchedule: z.boolean().optional(),
    notifyVisitor: z.boolean().optional(),
  }),
  z.object({ action: z.literal("complete") }),
  z.object({
    action: z.literal("edit"),
    name: visitorSchema.shape.name.optional(),
    email: visitorSchema.shape.email.optional(),
    phone: visitorSchema.shape.phone,
    title: visitorSchema.shape.title,
    notes: visitorSchema.shape.notes,
  }),
]);

export const blockSchema = z
  .object({
    start: isoInstant,
    end: isoInstant,
    reason: optionalText(300),
    conflictAction: z.enum(["keep", "cancel"]).optional(),
  })
  .refine((b) => b.end > b.start, { message: "The end must be after the start.", path: ["end"] });

const weeklyWindow = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    active: z.boolean().default(true),
  })
  .refine((r) => r.endMinute > r.startMinute, { message: "Each period must end after it starts." });

export const rulesSchema = z.object({ rules: z.array(weeklyWindow).max(100) });

export const recurringBlocksSchema = z.object({
  blocks: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(1).max(7),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
          reason: optionalText(300),
          active: z.boolean().default(true),
        })
        .refine((r) => r.endMinute > r.startMinute, { message: "Each period must end after it starts." }),
    )
    .max(100),
});

export const settingsSchema = z.object({
  ownerName: z.string().trim().min(1).max(80).optional(),
  ownerEmail: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address.")).optional(),
  meetingDurationMin: z.number().int().min(5).max(480).optional(),
  slotIntervalMin: z.number().int().min(5).max(480).optional(),
  bufferMin: z.number().int().min(0).max(240).optional(),
  minNoticeMin: z.number().int().min(0).max(43200).optional(),
  maxHorizonDays: z.number().int().min(1).max(730).optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone.")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

export const setupSchema = z.object({
  code: z.string().min(1, "Please enter the setup code.").max(200),
  name: z.string().trim().min(1, "Please enter your name.").max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Please enter a valid email address.")),
  password: z.string().min(12, "The password needs at least 12 characters.").max(200),
});
