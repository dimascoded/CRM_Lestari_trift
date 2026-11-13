import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { db } from "@/lib/db";

const roles = ["kasir", "stok", "manajer", "marketing", "pemilik"] as const;
type Role = (typeof roles)[number];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

async function AdminShell({ children }: { children: ReactNode }) {
  const [cookieStore, branchCount] = await Promise.all([cookies(), db.branch.count()]);
  const value = cookieStore.get("role")?.value;
  const role: Role = roles.find((candidate) => candidate === value) ?? "pemilik";
  return <AppShell role={role} branchCount={branchCount}>{children}</AppShell>;
}
