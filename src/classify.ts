/**
 * Clasificación PURA de gastos contra la taxonomía del usuario
 * (single source of truth para web + WhatsApp). Sin IO.
 *
 * Migrado 1:1 desde gastos-firebase-functions/src/services/inference.service
 * (flujo ROADMAP § B.5 + § G.3 + § A.1 C). El acceso a Firestore (categorías,
 * métodos, learning_log) y la llamada LLM acotada viven en cada repo como
 * adaptador y se inyectan vía `ClassifyDeps`. El orden estricto 1→6 vive
 * UNA sola vez, aquí.
 */

import {
  normalizeForMatching,
  phraseMatches,
  tokenizeForLearning,
  tokenOverlap,
} from './text';

/** Centinela: descripción que no mapeó a ninguna categoría del usuario. */
export const UNCLASSIFIED_CATEGORY = 'sin_clasificar';

/**
 * Solape mínimo de tokens para reusar una decisión del historial (paso 4).
 * Evita falsos positivos por 1 token común entre descripciones largas.
 */
export const MIN_HISTORY_OVERLAP = 0.5;

/** Tokens de método de pago conocidos por la app (no dependen del usuario). */
export const DEFAULT_PAYMENT_TOKENS = [
  'yape', 'plin', 'efectivo', 'transferencia', 'tarjeta',
] as const;

export type MatchedLevel =
  | 'suggestion'
  | 'subcategory'
  | 'category'
  | 'history'
  | 'llm'
  | 'user_correction'
  | 'default';

export type PaymentMethodSource = 'text' | 'inferred' | 'fallback';

export interface TaxonomySubcategory {
  id: string;
  nombre: string;
  suggestions_ideas?: string[];
}

export interface TaxonomyCategory {
  id: string;
  nombre: string;
  subcategorias?: TaxonomySubcategory[];
}

export interface TaxonomyPaymentMethod {
  id: string;
  nombre: string;
}

/**
 * Entrada de historial NEUTRA a Firestore (sin Timestamp). El adaptador
 * de cada repo mapea su `learning_log` a esta forma; el backend pasa `[]`
 * en Fase 2 (learning_log compartido = Fase 3).
 */
export interface HistoryEntry {
  /** `decision.field` — solo se usa el historial de `categoria`. */
  field: string;
  /** `decision.value`. */
  value: string | number;
  /** `userFeedback?.correctedValue` (gana sobre `value`). */
  correctedValue?: string | number | null;
  /** `decision.source`. */
  source: string;
  /** `entry.type`. */
  type: string;
  /** `!!entry.userFeedback`. */
  hasFeedback: boolean;
  /** `entry.tokens` ya tokenizados (o `[]`). */
  tokens: string[];
  /** `input.normalized` → se persiste como `matchedTerm`. */
  normalizedInput: string;
  /** `createdAt.toMillis()` — desempate por recencia. */
  createdAtMs: number;
}

export interface ClassificationResult {
  categoria: string;
  subcategoria: string | null;
  matchedTerm: string | null;
  matchedLevel: MatchedLevel;
  needsClassification: boolean;
}

export interface PaymentMethodResolution {
  metodoPago: string;
  source: PaymentMethodSource;
  needsReview: boolean;
}

export interface CurrencyResolution {
  moneda: string;
  source: 'text' | 'account';
}

/**
 * Mapea un término (hint libre del LLM o candidato elegido) a una
 * categoría del usuario por `id` exacto o `nombre` (palabra completa, en
 * cualquier dirección). null si no corresponde. ROADMAP § A.1 (C).
 */
export function categoryIdForTerm(
  term: string,
  categories: TaxonomyCategory[],
): string | null {
  const norm = normalizeForMatching(term);
  if (!norm) return null;
  for (const cat of categories) {
    if (cat.id && normalizeForMatching(cat.id) === norm) {
      return cat.id;
    }
    const nameNorm = normalizeForMatching(cat.nombre || '');
    if (
      nameNorm &&
      (nameNorm === norm ||
        phraseMatches(norm, nameNorm) ||
        phraseMatches(nameNorm, norm))
    ) {
      return cat.id;
    }
  }
  return null;
}

/**
 * Pasos 1-3 (taxonomía del usuario): suggestions_ideas → nombre de
 * subcategoría → nombre de categoría. `description` se normaliza aquí.
 * Devuelve el match o null.
 */
export function classifyByTaxonomy(
  description: string,
  categories: TaxonomyCategory[],
): ClassificationResult | null {
  const norm = normalizeForMatching(description);

  // 1. suggestions_ideas
  for (const cat of categories) {
    for (const sub of cat.subcategorias || []) {
      for (const idea of sub.suggestions_ideas || []) {
        if (phraseMatches(norm, normalizeForMatching(idea))) {
          return {
            categoria: cat.id,
            subcategoria: sub.id,
            matchedTerm: idea,
            matchedLevel: 'suggestion',
            needsClassification: false,
          };
        }
      }
    }
  }

  // 2. nombre de subcategoría
  for (const cat of categories) {
    for (const sub of cat.subcategorias || []) {
      if (phraseMatches(norm, normalizeForMatching(sub.nombre))) {
        return {
          categoria: cat.id,
          subcategoria: sub.id,
          matchedTerm: sub.nombre,
          matchedLevel: 'subcategory',
          needsClassification: false,
        };
      }
    }
  }

  // 3. nombre de categoría (subcategoría queda null por decisión § E)
  for (const cat of categories) {
    if (phraseMatches(norm, normalizeForMatching(cat.nombre))) {
      return {
        categoria: cat.id,
        subcategoria: null,
        matchedTerm: cat.nombre,
        matchedLevel: 'category',
        needsClassification: false,
      };
    }
  }

  return null;
}

/**
 * Paso 4 (historial del usuario): elige por similitud de tokens
 * (overlap ≥ MIN_HISTORY_OVERLAP), priorizando correcciones explícitas,
 * luego score, luego recencia. Nunca reusa el centinela `sin_clasificar`.
 * `queryTokens` = tokenizeForLearning(normalizado).
 */
export function classifyByHistory(
  queryTokens: string[],
  history: HistoryEntry[],
): ClassificationResult | null {
  const best = history
    .filter((e) => {
      if (e.field !== 'categoria') return false;
      const value = e.correctedValue ?? e.value;
      return (
        typeof value === 'string' &&
        value !== '' &&
        value !== UNCLASSIFIED_CATEGORY
      );
    })
    .map((e) => ({
      e,
      isCorrection:
        e.type === 'user_correction' ||
        e.source === 'user_correction' ||
        e.hasFeedback,
      score: tokenOverlap(queryTokens, e.tokens),
    }))
    .filter((c) => c.score >= MIN_HISTORY_OVERLAP)
    .sort((a, b) => {
      if (a.isCorrection !== b.isCorrection) return a.isCorrection ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return b.e.createdAtMs - a.e.createdAtMs;
    })[0]?.e;

  if (!best) return null;
  return {
    categoria: String(best.correctedValue ?? best.value),
    subcategoria: null,
    matchedTerm: best.normalizedInput,
    matchedLevel: 'history',
    needsClassification: false,
  };
}

/**
 * Validación/resolución de método de pago (ROADMAP § B.3). PURO:
 * `methods` son los métodos del usuario ya cargados por el adaptador.
 *  - Token explícito en texto → "text".
 *  - explicitHint (imagen/LLM) que mapea → "inferred"; que no mapea →
 *    "otro" + needsReview.
 *  - Sin señal alguna → "efectivo" fallback, sin review.
 */
export function resolvePaymentMethod(
  description: string,
  methods: TaxonomyPaymentMethod[],
  explicitHint?: string,
): PaymentMethodResolution {
  const norm = normalizeForMatching(description);

  for (const d of DEFAULT_PAYMENT_TOKENS) {
    if (phraseMatches(norm, d)) {
      return { metodoPago: d, source: 'text', needsReview: false };
    }
  }
  for (const m of methods) {
    if (phraseMatches(norm, normalizeForMatching(m.nombre))) {
      return { metodoPago: m.id, source: 'text', needsReview: false };
    }
  }

  if (explicitHint && explicitHint.trim()) {
    const hint = normalizeForMatching(explicitHint);
    for (const d of DEFAULT_PAYMENT_TOKENS) {
      if (phraseMatches(hint, d) || hint === d) {
        return { metodoPago: d, source: 'inferred', needsReview: false };
      }
    }
    for (const m of methods) {
      const mNorm = normalizeForMatching(m.nombre);
      if (phraseMatches(hint, mNorm) || hint === mNorm) {
        return { metodoPago: m.id, source: 'inferred', needsReview: false };
      }
    }
    return { metodoPago: 'otro', source: 'fallback', needsReview: true };
  }

  return { metodoPago: 'efectivo', source: 'fallback', needsReview: false };
}

/**
 * Moneda heredada de la cuenta activa salvo override explícito en el
 * texto (ROADMAP § B.2). Substring deliberado (no phraseMatches): "$"
 * y abreviaturas deben matchear pegadas al monto.
 */
export function resolveCurrency(
  description: string,
  accountMoneda: string,
): CurrencyResolution {
  const desc = description.toLowerCase();
  if (
    desc.includes('dólar') ||
    desc.includes('dolar') ||
    desc.includes('usd') ||
    desc.includes('$')
  ) {
    return { moneda: 'USD', source: 'text' };
  }
  if (
    desc.includes('soles') ||
    desc.includes('sol') ||
    desc.includes('pen')
  ) {
    return { moneda: 'PEN', source: 'text' };
  }
  return { moneda: accountMoneda, source: 'account' };
}

/** Tipo de comprobante por palabra clave; default "boleta". */
export function inferVoucherType(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('factura')) return 'factura';
  if (desc.includes('recibo')) return 'recibo';
  if (desc.includes('nota de venta') || desc.includes('nota venta')) {
    return 'nota_venta';
  }
  return 'boleta';
}

/**
 * Dependencias de IO inyectadas por cada repo (adaptador). El orquestador
 * no sabe de Firestore ni de Anthropic; solo del orden de decisión.
 */
export interface ClassifyDeps {
  /** Categorías del usuario (`users/{uid}/categories`). */
  getCategories(): Promise<TaxonomyCategory[]>;
  /**
   * Historial relevante a `normalizedDescription` (learning_log).
   * Backend Fase 2 pasa siempre `[]` (learning_log compartido = Fase 3).
   */
  getHistory(normalizedDescription: string): Promise<HistoryEntry[]>;
  /**
   * Clasificación LLM acotada a `candidateNames`. Devuelve el nombre
   * elegido o null. Solo se invoca en el paso 5b (miss total).
   */
  llmClassify(
    description: string,
    candidateNames: string[],
  ): Promise<string | null>;
}

export interface ClassifyInput {
  description: string;
  /**
   * Hint de categoría que el LLM ya devolvió (canal imagen/audio/fallback).
   * Si mapea a una categoría del usuario, el paso 5a lo reusa (costo cero).
   */
  llmCategoryHint?: string;
}

/**
 * Orquesta el flujo de clasificación ROADMAP § B.5 + § G.3 + § A.1 (C):
 *   1-3. taxonomía del usuario (suggestions → subcat → cat)
 *   4.   historial (learning_log) por similitud de tokens
 *   5a.  reusar hint libre del LLM (mapea a categoría del usuario)
 *   5b.  LLM acotado a la taxonomía (1 llamada, solo en miss)
 *   6.   sin_clasificar (needsClassification)
 * Los errores del LLM se tragan (se cae al paso 6).
 */
export async function classifyExpense(
  input: ClassifyInput,
  deps: ClassifyDeps,
): Promise<ClassificationResult> {
  const { description, llmCategoryHint } = input;
  const norm = normalizeForMatching(description);
  const categories = await deps.getCategories();

  // 1-3
  const byTaxonomy = classifyByTaxonomy(description, categories);
  if (byTaxonomy) return byTaxonomy;

  // 4
  const history = await deps.getHistory(norm);
  const byHistory = classifyByHistory(tokenizeForLearning(norm), history);
  if (byHistory) return byHistory;

  // 5
  if (categories.length > 0) {
    if (llmCategoryHint) {
      const mapped = categoryIdForTerm(llmCategoryHint, categories);
      if (mapped) {
        return {
          categoria: mapped,
          subcategoria: null,
          matchedTerm: llmCategoryHint,
          matchedLevel: 'llm',
          needsClassification: false,
        };
      }
    }
    const candidates = categories
      .map((c) => c.nombre)
      .filter((n): n is string => !!n);
    if (candidates.length > 0) {
      try {
        const picked = await deps.llmClassify(description, candidates);
        const mapped = picked ? categoryIdForTerm(picked, categories) : null;
        if (mapped) {
          return {
            categoria: mapped,
            subcategoria: null,
            matchedTerm: picked,
            matchedLevel: 'llm',
            needsClassification: false,
          };
        }
      } catch {
        // LLM falló → se cae a sin_clasificar (paso 6).
      }
    }
  }

  // 6
  return {
    categoria: UNCLASSIFIED_CATEGORY,
    subcategoria: null,
    matchedTerm: null,
    matchedLevel: 'default',
    needsClassification: true,
  };
}
