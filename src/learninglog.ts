/**
 * Esquema CANÓNICO de la bitácora de aprendizaje (`users/{uid}/learning_log`),
 * compartido tal cual por gastos-backend (web) y gastos-firebase-functions
 * (WhatsApp). La colección Firestore es la MISMA (mismo proyecto): una
 * corrección hecha por WhatsApp mejora la web y viceversa — por eso el
 * documento escrito debe ser byte-compatible. `buildLearningLogDoc` es la
 * ÚNICA forma de construir ese doc (evita drift); cada repo solo añade su
 * `createdAt` (Timestamp propio de su SDK) al persistir.
 */

import { tokenizeForLearning } from './text';

/** Canal de entrada que originó la decisión. */
export type LearningLogChannel = 'text' | 'image' | 'audio';

/** Decisión registrada (p.ej. categoría inferida). `value` casi siempre string. */
export interface LearningLogDecisionInput {
  field: string;
  value: string | number;
  /** Origen: regex | llm | history | user_correction | default (libre). */
  source: string;
  matchedTerm?: string;
  confidence?: number;
}

export interface LearningLogInput {
  raw: string;
  /** Texto normalizado (normalizeForMatching) — base de `tokens`. */
  normalized: string;
  channel: LearningLogChannel;
}

export interface LearningLogEntryInput {
  expenseId?: string;
  /** `inference` (decisión automática) | `user_correction` (corrección). */
  type: string;
  input: LearningLogInput;
  decision: LearningLogDecisionInput;
}

/**
 * Documento listo para persistir SALVO `createdAt` (cada repo añade el
 * Timestamp de su SDK). `tokens` y la poda de opcionales viven aquí para
 * que ambos repos escriban exactamente lo mismo.
 */
export interface LearningLogDoc {
  type: string;
  input: LearningLogInput;
  decision: LearningLogDecisionInput;
  tokens: string[];
  expenseId?: string;
}

/**
 * Construye el documento canónico: poda opcionales `undefined` (Firestore
 * los rechaza, incl. anidados) y calcula `tokens` desde `input.normalized`.
 * NO incluye `createdAt` — lo añade el caller con su propio Timestamp.
 */
export function buildLearningLogDoc(
  entry: LearningLogEntryInput,
): LearningLogDoc {
  const decision: LearningLogDecisionInput = {
    field: entry.decision.field,
    value: entry.decision.value,
    source: entry.decision.source,
  };
  if (entry.decision.matchedTerm !== undefined) {
    decision.matchedTerm = entry.decision.matchedTerm;
  }
  if (entry.decision.confidence !== undefined) {
    decision.confidence = entry.decision.confidence;
  }

  const doc: LearningLogDoc = {
    type: entry.type,
    input: entry.input,
    decision,
    tokens: tokenizeForLearning(entry.input.normalized),
  };
  if (entry.expenseId !== undefined) {
    doc.expenseId = entry.expenseId;
  }
  return doc;
}
