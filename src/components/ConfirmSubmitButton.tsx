"use client";

import type { MouseEvent, ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
  disabled = false,
}: {
  children: ReactNode;
  className: string;
  confirmMessage: string;
  disabled?: boolean;
}) {
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmMessage)) event.preventDefault();
  }

  return (
    <button className={className} type="submit" disabled={disabled} onClick={confirmSubmission}>
      {children}
    </button>
  );
}
