import { redirect } from "next/navigation";
import { loginStaff } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { getStaffSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StaffLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getStaffSession(), searchParams]);
  if (session) redirect("/");
  const status = typeof params.status === "string" ? params.status : undefined;

  return (
    <div className="page-content portal-login">
      <PageHeader eyebrow="LESTARI THRIFT CRM" title="Masuk ke CRM" description="Gunakan akun staf yang dibuat oleh pengelola CRM." />
      <Notice status={status} />
      <section className="form-card login-card">
        <form action={loginStaff}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="staff-email">Email</label><input id="staff-email" name="email" type="email" autoComplete="username" required /></div>
            <div className="field full"><label htmlFor="staff-password">Password</label><input id="staff-password" name="password" type="password" autoComplete="current-password" required /></div>
          </div>
          <div className="form-actions"><button className="button" type="submit">Masuk</button></div>
        </form>
        <p className="field-hint">Akun awal dibuat melalui perintah `npm run user:create` di terminal server.</p>
      </section>
    </div>
  );
}
