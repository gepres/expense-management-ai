/**
 * Utilidades de texto PURAS para matching/clasificación (single source of
 * truth para web + WhatsApp). Sin IO. Migradas 1:1 desde
 * gastos-firebase-functions (MessageParser.normalizeForMatching +
 * learning-log.service tokenize/overlap + inference.service phraseMatches)
 * para que el comportamiento sea idéntico en ambos repos.
 */

/**
 * Normaliza para comparar: NFD sin diacríticos, lowercase, espacios
 * colapsados, trim. Idéntico a MessageParser.normalizeForMatching.
 */
export function normalizeForMatching(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿`needle` aparece como palabra/frase COMPLETA dentro de `haystack`?
 * Ambos ya normalizados. Evita el falso positivo de substring
 * (p.ej. "ropa" NO matchea en "europa").
 */
export function phraseMatches(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystack);
}

const TOKEN_MIN_LENGTH = 3;
const TOKEN_STOPWORDS = new Set([
  'del', 'las', 'los', 'por', 'con', 'para', 'que', 'una', 'uno',
  'soles', 'sol', 'gaste', 'pague', 'compre',
]);

/**
 * Tokeniza una descripción normalizada para similitud. Tokens ≥ 3 chars,
 * sin stopwords ES, únicos, cap a 10 (límite array-contains-any de
 * Firestore — se conserva el cap para que el score sea idéntico al del
 * historial persistido en functions).
 */
export function tokenizeForLearning(normalized: string): string[] {
  const words = normalized
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= TOKEN_MIN_LENGTH && !TOKEN_STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 10);
}

/**
 * Overlap coefficient: |∩| / min(|a|,|b|). Más tolerante que Jaccard a
 * diferencias de longitud (una corrección corta "taxi" sigue aplicando a
 * "taxi al centro comercial"). 0 si alguno está vacío.
 */
export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  return inter / Math.min(setA.size, setB.size);
}
