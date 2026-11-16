export const STAFF_ROLES = ["CASHIER", "STOCK_STAFF", "MANAGER", "MARKETING", "OWNER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
