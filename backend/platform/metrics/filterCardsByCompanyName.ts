export function filterCardsByCompanyName<T extends { company_name: string }>(
  cards: T[],
  q: string | undefined,
): T[] {
  const needle = (q ?? "").trim().toLowerCase();
  if (!needle) return cards;
  return cards.filter((c) => c.company_name.toLowerCase().includes(needle));
}
