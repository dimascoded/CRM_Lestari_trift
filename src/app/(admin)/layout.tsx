import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getStaffSession } from "@/lib/auth";
import { db } from "@/lib/db";

const roleLabels = {
  CASHIER: "kasir",
  STOCK_STAFF: "stok",
  MANAGER: "manajer",
  MARKETING: "marketing",
  OWNER: "pemilik",
} as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

async function AdminShell({ children }: { children: ReactNode }) {
  const [session, branchCount] = await Promise.all([getStaffSession(), db.branch.count()]);
  if (!session) redirect("/login");
  const role = roleLabels[session.user.role as keyof typeof roleLabels];
  if (!role) redirect("/login");
  return <AppShell role={role} userName={session.user.name} branchCount={branchCount}>{children}</AppShell>;
}
