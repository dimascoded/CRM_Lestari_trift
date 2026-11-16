import { timingSafeEqual } from "node:crypto";
import { processDueReminders } from "@/lib/reminders";

export async function GET(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "Reminder scheduler is not configured." }, { status: 503 });
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const sent = await processDueReminders();
  return Response.json({ sent });
}
