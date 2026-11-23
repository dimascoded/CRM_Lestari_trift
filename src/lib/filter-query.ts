export function buildFilterQuery(entries: Iterable<[string, string]>): string {
  const params = new URLSearchParams();
  for (const [name, value] of entries) {
    const trimmedValue = value.trim();
    if (trimmedValue) params.append(name, trimmedValue);
  }
  return params.toString();
}
