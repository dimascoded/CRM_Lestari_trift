import { processDueReminders } from "@/lib/reminders";

export async function GET() {
  const sent = await processDueReminders();
  return Response.json({ sent });
}
