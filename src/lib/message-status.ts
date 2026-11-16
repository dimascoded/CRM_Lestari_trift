export const MESSAGE_STATUSES = ["SIMULATED_SENT"] as const;
export const SIMULATED_SENT_STATUS = MESSAGE_STATUSES[0];

export function describeMessageStatus(status: string) {
  const isSimulated = MESSAGE_STATUSES.some((knownStatus) => knownStatus === status);
  return {
    isSimulated,
    label: isSimulated ? "Terkirim (simulasi)" : `Status tidak dikenal (simulasi): ${status}`,
  };
}
