/**
 * Esquema CANÓNICO de extracción de gastos (español).
 *
 * Es el contrato único que devuelven los prompts de este paquete y al que
 * ambos repos (gastos-backend web, gastos-firebase-functions WhatsApp)
 * mapean en su frontera. No incluye inferencia (categoría/método contra la
 * taxonomía del usuario) — eso es Fase 2 y vive en cada adaptador.
 */

export type Moneda = 'PEN' | 'USD';

/** Resultado de OCR de comprobante (Yape/Plin/boleta/factura/transferencia). */
export interface ReceiptExtraction {
  /** Monto numérico (sin símbolo). */
  monto: number;
  moneda: Moneda;
  /** Fecha de la transacción, YYYY-MM-DD. */
  fecha: string;
  /** Hora 24h HH:mm:ss si está visible, si no null. */
  hora: string | null;
  /** Hint del modelo: yape | plin | transferencia | efectivo | tarjeta. */
  metodoPago: string;
  /** Comercio o destinatario (en Yape/Plin = destinatario). */
  comercio: string;
  /** Nº de operación si existe. */
  numeroOperacion: string | null;
  /** Hint de categoría (se valida contra la taxonomía del usuario en Fase 2). */
  categoria: string;
  /** Hint de subcategoría o null. */
  subcategoria: string | null;
  descripcion: string;
  /** Confianza 0-100. */
  confianza: number;
}

/** Resultado de parseo de gasto desde texto (voz transcrita o mensaje). */
export interface VoiceExtraction {
  monto: number;
  moneda: Moneda;
  categoria: string;
  subcategoria: string | null;
  descripcion: string;
  /** Hint de método de pago o null. */
  metodoPago: string | null;
  /** Fecha YYYY-MM-DD si se menciona, si no null. */
  fecha: string | null;
  confianza: number;
}

/** Marcador de "no es un gasto" que el modelo puede devolver. */
export interface ExtractionError {
  error: string;
}
