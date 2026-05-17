/**
 * Parsing/normalización PURA de la respuesta del modelo al esquema
 * canónico. Tolerante a ```json fences``` y a texto alrededor.
 */

import {
  ReceiptExtraction,
  VoiceExtraction,
  ExtractionError,
  Moneda,
} from './types';

/** Extrae el bloque JSON de la respuesta del modelo. null si no hay. */
export function extractJsonBlock(responseText: string): string | null {
  const text = responseText.trim();
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence) return anyFence[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : null;
}

function parseJson(responseText: string): Record<string, unknown> | null {
  const block = extractJsonBlock(responseText);
  if (!block) return null;
  try {
    const v = JSON.parse(block);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isError(o: Record<string, unknown>): o is { error: string } {
  return typeof o.error === 'string' && o.error.length > 0;
}

function num(v: unknown, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.toLowerCase() !== 'null' ? t : null;
}

/** Acepta 0-1 (algunos prompts viejos) o 0-100 → siempre 0-100. */
function confidence(v: unknown): number {
  let c = num(v, 0);
  if (c > 0 && c <= 1) c = c * 100;
  return Math.max(0, Math.min(100, Math.round(c)));
}

function moneda(v: unknown): Moneda {
  return String(v ?? '').toUpperCase() === 'USD' ? 'USD' : 'PEN';
}

/** Comprobante: respuesta del modelo → canónico, o error, o null. */
export function parseReceipt(
  responseText: string,
): ReceiptExtraction | ExtractionError | null {
  const p = parseJson(responseText);
  if (!p) return null;
  if (isError(p)) return { error: p.error as string };
  if (p.monto === undefined || p.monto === null) {
    return { error: "Falta el campo 'monto' en la extracción" };
  }
  return {
    monto: num(p.monto),
    moneda: moneda(p.moneda),
    fecha:
      strOrNull(p.fecha)?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    hora: strOrNull(p.hora),
    metodoPago: (strOrNull(p.metodoPago) || 'efectivo').toLowerCase(),
    comercio: strOrNull(p.comercio) || '',
    numeroOperacion: strOrNull(p.numeroOperacion),
    categoria: strOrNull(p.categoria) || 'otros',
    subcategoria: strOrNull(p.subcategoria),
    descripcion:
      strOrNull(p.descripcion) || strOrNull(p.comercio) || 'Gasto detectado',
    confianza: confidence(p.confianza),
  };
}

/** Texto/voz: respuesta del modelo → canónico, o error, o null. */
export function parseVoice(
  responseText: string,
): VoiceExtraction | ExtractionError | null {
  const p = parseJson(responseText);
  if (!p) return null;
  if (isError(p)) return { error: p.error as string };
  if (p.monto === undefined || p.monto === null || !strOrNull(p.categoria)) {
    return { error: 'Respuesta incompleta del modelo' };
  }
  return {
    monto: num(p.monto),
    moneda: moneda(p.moneda),
    categoria: strOrNull(p.categoria) || 'otros',
    subcategoria: strOrNull(p.subcategoria),
    descripcion: strOrNull(p.descripcion) || '',
    metodoPago: strOrNull(p.metodoPago),
    fecha: strOrNull(p.fecha)?.slice(0, 10) || null,
    confianza: confidence(p.confianza),
  };
}

/** Type guard útil para los consumidores. */
export function isExtractionError(
  v: ReceiptExtraction | VoiceExtraction | ExtractionError | null,
): v is ExtractionError {
  return !!v && typeof (v as ExtractionError).error === 'string';
}
