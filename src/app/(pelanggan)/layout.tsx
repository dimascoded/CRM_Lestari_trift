import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  { href: "/portal?tab=beranda", label: "Beranda", icon: "⌂" },
  { href: "/portal?tab=katalog", label: "Katalog", icon: "▦" },
  { href: "/portal?tab=wishlist", label: "Wishlist", icon: "♡" },
  { href: "/portal?tab=profil", label: "Profil", icon: "○" },
];

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <Link className="portal-brand" href="/portal">Lestari <span>THRIFT · PORTAL PELANGGAN</span></Link>
        <nav className="portal-top-nav" aria-label="Navigasi portal">
          {links.map(({ href, label }) => <Link href={href} key={label}>{label}</Link>)}
        </nav>
      </header>
      <main>{children}</main>
      <nav className="portal-bottom-nav" aria-label="Navigasi portal pelanggan">
        {links.map(({ href, label, icon }) => <Link href={href} key={label}><span>{icon}</span>{label}</Link>)}
      </nav>
    </div>
  );
}
