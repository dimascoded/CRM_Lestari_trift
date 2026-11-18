import { LOCAL_SCHEDULER_INTERVAL_MINUTES } from "./lib/business-rules";

declare global {
  var __lestariReminderScheduler: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_LOCAL_SCHEDULER !== "true") return;
  if (globalThis.__lestariReminderScheduler) return;
  const { processDueReminders } = await import("./lib/reminders");
  globalThis.__lestariReminderScheduler = setInterval(() => {
    void processDueReminders().catch((error: unknown) => {
      console.error("Local reminder scheduler failed.", error);
    });
  }, LOCAL_SCHEDULER_INTERVAL_MINUTES * 60 * 1000);
}
