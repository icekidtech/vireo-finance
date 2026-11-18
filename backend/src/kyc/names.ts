function tokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Both the first and the last name must appear in `fullName`, in any order (ignores case, accents, punctuation). */
export function nameMatches(fullName: string, firstName: string, lastName: string): boolean {
  const have = new Set(tokens(fullName));
  const first = tokens(firstName);
  const last = tokens(lastName);
  return (
    first.length > 0 &&
    last.length > 0 &&
    first.every((t) => have.has(t)) &&
    last.every((t) => have.has(t))
  );
}

const FILLER = new Set([
  'ltd',
  'limited',
  'llc',
  'plc',
  'nig',
  'nigeria',
  'enterprises',
  'enterprise',
  'and',
  'co',
  'company',
  'services',
  'global',
  'international',
  'ventures',
  'venture',
  'the',
  'of',
]);

/** Share of the business name's significant words that also appear in the registered name (0 to 1). */
export function businessNameSimilarity(a: string, b: string): number {
  const significant = (s: string) => tokens(s).filter((t) => !FILLER.has(t));
  const left = significant(a);
  const right = new Set(significant(b));
  if (left.length === 0 || right.size === 0) return 0;
  return left.filter((t) => right.has(t)).length / left.length;
}
