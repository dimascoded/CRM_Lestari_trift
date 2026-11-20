export const MESSAGE_TABS = [
  { id: "antrean", label: "Antrean" },
  { id: "reminder", label: "Reminder" },
  { id: "notifikasi", label: "Notifikasi" },
  { id: "log", label: "Log" },
] as const;

export type MessageTab = (typeof MESSAGE_TABS)[number]["id"];

export function visibleMessageTabs(role: string) {
  return MESSAGE_TABS.filter(({ id }) =>
    id !== "reminder" || ["OWNER", "MANAGER", "MARKETING"].includes(role),
  );
}

export function resolveMessageTab(role: string, requested: string | undefined): MessageTab {
  const tab = visibleMessageTabs(role).find(({ id }) => id === requested);
  return tab?.id ?? "antrean";
}
