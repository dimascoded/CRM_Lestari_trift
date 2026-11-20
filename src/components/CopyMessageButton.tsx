"use client";

import { useState } from "react";

export function CopyMessageButton({ message }: { message: string }) {
  const [status, setStatus] = useState("");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Tersalin. Kirim manual di luar aplikasi.");
    } catch {
      setStatus("Gagal menyalin pesan. Periksa izin clipboard browser.");
    }
  }

  return <div className="copy-message">
    <button className="inline-action" type="button" onClick={copyMessage}>Salin pesan</button>
    {status && <small role="status">{status}</small>}
  </div>;
}
