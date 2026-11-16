import Link from "next/link";
import { createStaffAccount, setStaffAccountActive, updateStaffAccount } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage, STAFF_ROLES } from "@/lib/auth";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const roleLabels: Record<string, string> = {
  CASHIER: "Kasir",
  STOCK_STAFF: "Staf stok",
  MANAGER: "Manajer",
  MARKETING: "Marketing",
  OWNER: "Pemilik",
};

export default function StaffAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  return <StaffAccountsContent searchParams={searchParams} />;
}

async function StaffAccountsContent({ searchParams }: { searchParams: SearchParams }) {
  const currentStaff = await requireStaffPage(["OWNER"]);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const editId = typeof params.edit === "string" ? params.edit : "";
  const [branches, users, editingUser] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ include: { branch: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    editId ? db.user.findUnique({ where: { id: editId }, include: { branch: true } }) : Promise.resolve(null),
  ]);
  return (
    <div className="page-content">
      <PageHeader eyebrow="PENGATURAN · AKSES" title="Akun staf" description="Kelola peran dan cabang. Menonaktifkan akun akan mencabut semua sesi, bukan menghapus riwayat." />
      <Notice status={status} />
      {editId && !editingUser && <Notice status="staff-not-found" />}
      <section className="management-grid">
        <div className="form-card">
          <h2>{editingUser ? "Ubah akun staf" : "Tambah akun staf"}</h2>
          <p>Password minimal 12 karakter. Saat memperbarui akun, password boleh dikosongkan agar tidak berubah.</p>
          <form action={editingUser ? updateStaffAccount : createStaffAccount}>
            {editingUser && <input type="hidden" name="userId" value={editingUser.id} />}
            <div className="form-grid">
              <div className="field full"><label htmlFor="staff-name">Nama staf</label><input id="staff-name" name="name" required maxLength={100} defaultValue={editingUser?.name ?? ""} autoComplete="name" /></div>
              <div className="field full"><label htmlFor="staff-email">Email login</label><input id="staff-email" name="email" type="email" required maxLength={254} defaultValue={editingUser?.email ?? ""} autoComplete="username" /></div>
              <div className="field"><label htmlFor="staff-role">Peran</label><select id="staff-role" name="role" required defaultValue={editingUser?.role ?? "CASHIER"}>{STAFF_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></div>
              <div className="field"><label htmlFor="staff-branch">Cabang</label><select id="staff-branch" name="branchId" defaultValue={editingUser?.branchId ?? ""}><option value="">Tidak terikat cabang (khusus Pemilik)</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><span className="field-hint">Wajib dipilih untuk semua peran selain Pemilik.</span></div>
              <div className="field"><label htmlFor="staff-password">{editingUser ? "Password baru (opsional)" : "Password"}</label><input id="staff-password" name="password" type="password" minLength={12} maxLength={200} required={!editingUser} autoComplete="new-password" /></div>
              <div className="field"><label htmlFor="staff-password-confirm">Ulangi password</label><input id="staff-password-confirm" name="passwordConfirm" type="password" minLength={12} maxLength={200} required={!editingUser} autoComplete="new-password" /></div>
            </div>
            <div className="form-actions">
              <button className="button" type="submit">{editingUser ? "Simpan perubahan" : "Buat akun"}</button>
              {editingUser && <Link className="button secondary" href="/akun">Batal</Link>}
            </div>
          </form>
        </div>
        <section className="table-card">
          <div className="table-titlebar"><div><h2>Daftar akun</h2><p>{users.length} akun staf terdaftar.</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>NAMA / EMAIL</th><th>PERAN</th><th>CABANG</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><br /><small>{user.email ?? "Belum memiliki email login"}</small>{user.id === currentStaff.id && <span className="tag staff-self-tag">Anda</span>}</td>
                <td>{roleLabels[user.role] ?? user.role}</td>
                <td>{user.branch?.name ?? "Semua cabang"}</td>
                <td><span className={`status ${user.active ? "" : "neutral"}`}>{user.active ? "Aktif" : "Nonaktif"}</span></td>
                <td><div className="customer-row-actions">
                  <Link className="inline-action" href={`/akun?edit=${encodeURIComponent(user.id)}`}>Ubah</Link>
                  {user.id !== currentStaff.id && <form action={setStaffAccountActive}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="active" value={String(!user.active)} />
                    {user.active
                      ? <ConfirmSubmitButton className="inline-action danger" confirmMessage={`Nonaktifkan akun ${user.name}? Semua sesi aktif akan dicabut.`}>Nonaktifkan</ConfirmSubmitButton>
                      : <button className="inline-action" type="submit">Aktifkan</button>}
                  </form>}
                </div></td>
              </tr>
            ))}
              {!users.length && <tr><td className="table-empty" colSpan={5}>Belum ada akun staf.</td></tr>}
            </tbody>
          </table></div>
        </section>
      </section>
    </div>
  );
}
