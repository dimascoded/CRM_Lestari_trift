"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { setActiveRole } from "@/app/actions";

type Role = "kasir" | "stok" | "manajer" | "marketing" | "pemilik";
type NavigationItem = { href: string; label: string; icon: string; section: string };

const allNavigation: NavigationItem[] = [
  { href: "/", label: "Beranda", icon: "⌂", section: "UTAMA" },
  { href: "/kasir", label: "Kasir", icon: "◉", section: "OPERASIONAL" },
  { href: "/pelanggan", label: "Database pelanggan", icon: "♧", section: "OPERASIONAL" },
  { href: "/stok", label: "Stok", icon: "▦", section: "OPERASIONAL" },
  { href: "/manajemen", label: "Manajemen", icon: "↗", section: "MANAJEMEN" },
];

const menuByRole: Record<Role, string[]> = {
  kasir: ["/kasir", "/pelanggan"],
  stok: ["/stok"],
  manajer: ["/kasir", "/stok", "/manajemen", "/pelanggan"],
  marketing: ["/manajemen"],
  pemilik: allNavigation.map(({ href }) => href),
};

const roleLabels: Record<Role, string> = {
  kasir: "Kasir",
  stok: "Staf stok",
  manajer: "Manajer",
  marketing: "Marketing",
  pemilik: "Pemilik",
};

export function AppShell({
  children,
  role,
  branchCount,
}: {
  children: ReactNode;
  role: Role;
  branchCount: number;
}) {
  const pathname = usePathname();
  const navigation = allNavigation.filter(({ href }) => menuByRole[role].includes(href));
  const showSectionHeading = (index: number) =>
    index === 0 || navigation[index - 1].section !== navigation[index].section;
  const currentPage = navigation.find(({ href }) => href === pathname)
    ?? navigation.find(({ href }) => href !== "/" && pathname.startsWith(href));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>
          <span className="brand-copy"><strong>lestari</strong><small>THRIFT CRM</small></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-picker">
          <span className="workspace-avatar">LT</span>
          <span><strong>Lestari Thrift</strong><small>{branchCount} cabang terhubung</small></span>
          <span className="chevron">⌄</span>
        </div>
        <nav className="side-nav" aria-label="Navigasi utama">
          {navigation.map((item, index) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <div key={item.href}>
                {showSectionHeading(index) && <div className="nav-section">{item.section}</div>}
                <Link className={`nav-link${active ? " active" : ""}`} href={item.href}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-icon">✳</span>
            <strong>Butuh bantuan?</strong>
            <p>Hubungi tim support Lestari.</p>
            <a href="mailto:halo@lestarithrift.id">Hubungi kami <span>↗</span></a>
          </div>
          <div className="user-profile">
            <div className="user-avatar">{roleLabels[role].slice(0, 2).toUpperCase()}</div>
            <div><strong>{roleLabels[role]}</strong><small>Peran simulasi</small></div>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Lestari Thrift</span><b>/</b><strong>{currentPage?.label ?? "CRM"}</strong></div>
          <div className="topbar-actions">
            <span className="live-status"><i /> {branchCount} cabang terhubung</span>
            <form action={setActiveRole} className="role-switcher">
              <label htmlFor="active-role">Peran</label>
              <select id="active-role" name="role" defaultValue={role}>
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button className="button small secondary" type="submit">Ganti</button>
            </form>
          </div>
        </header>
        {children}
        <footer className="app-footer">Lestari Thrift CRM <span>·</span> Purwarupa operasional</footer>
      </main>
    </div>
  );
}
