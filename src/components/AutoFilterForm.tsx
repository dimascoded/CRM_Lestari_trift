"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useTransition } from "react";
import { buildFilterQuery } from "@/lib/filter-query";

type AutoFilterFormProps = {
  className?: string;
  children: ReactNode;
  searchDebounceMs?: number;
};

function getFormQuery(form: HTMLFormElement): string {
  const entries = Array.from(new FormData(form).entries()).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return buildFilterQuery(entries);
}

export function AutoFilterForm({ className, children, searchDebounceMs = 300 }: AutoFilterFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const [isPending, startTransition] = useTransition();

  const clearDebounce = useCallback(() => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const updateFilter = useCallback((form: HTMLFormElement) => {
    clearDebounce();
    const query = getFormQuery(form);
    if (query === currentQuery) return;
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }, [clearDebounce, currentQuery, pathname, router, startTransition]);

  useEffect(() => {
    clearDebounce();
    const form = formRef.current;
    if (form && getFormQuery(form) !== currentQuery) form.reset();
  }, [clearDebounce, currentQuery]);

  useEffect(() => clearDebounce, [clearDebounce]);

  const handleChange = useCallback((event: ChangeEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      updateFilter(form);
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type === "checkbox" || target.type === "radio") {
      updateFilter(form);
      return;
    }
    if (target.type === "search" || target.type === "text") {
      clearDebounce();
      debounceTimer.current = setTimeout(() => updateFilter(form), searchDebounceMs);
    }
  }, [clearDebounce, searchDebounceMs, updateFilter]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateFilter(event.currentTarget);
  }, [updateFilter]);

  return (
    <form
      ref={formRef}
      className={className}
      method="get"
      onChange={handleChange}
      onSubmit={handleSubmit}
      aria-busy={isPending ? "true" : undefined}
      data-pending={isPending ? "" : undefined}
    >
      {children}
      {isPending && <span className="filter-status" role="status">Memuat…</span>}
      <noscript><button className="button" type="submit">Terapkan filter</button></noscript>
    </form>
  );
}
