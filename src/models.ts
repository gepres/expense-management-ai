/**
 * Config de modelos por "tier" — PURA (el entorno se inyecta, no se lee
 * `process.env` aquí, para que sea testeable y agnóstica del runtime).
 *
 * `output_config.effort` SOLO lo aceptan Sonnet 4.6+ y Opus 4.5+. Haiku
 * 4.5 y Sonnet ≤4.5 devuelven 400 si se les envía `effort`. Esa regla
 * vive acá, acoplada al modelo resuelto (no en cada call-site).
 */

export type ModelTier = 'primary' | 'helper' | 'vision';

export interface ModelEnv {
  ANTHROPIC_MODEL_PRIMARY?: string;
  ANTHROPIC_MODEL_HELPER?: string;
  ANTHROPIC_MODEL_VISION?: string;
  OPENAI_MODEL_TRANSCRIBE?: string;
}

/** Defaults vigentes tras la migración 2026-05 (no se cae si falta la env). */
const DEFAULTS: Record<ModelTier, string> = {
  primary: 'claude-sonnet-4-6', // parseo principal (texto/voz)
  helper: 'claude-haiku-4-5', // fallbacks acotados (fecha/taxonomía/método)
  // OCR de comprobantes (imagen). Aislado de `primary` para poder bajarlo a
  // Haiku 4.5 (~3× más barato) sin afectar el parse de texto ni el chat.
  // Default = Sonnet → sin cambio de comportamiento hasta setear la env.
  vision: 'claude-sonnet-4-6',
};

const ENV_KEYS: Record<ModelTier, keyof ModelEnv> = {
  primary: 'ANTHROPIC_MODEL_PRIMARY',
  helper: 'ANTHROPIC_MODEL_HELPER',
  vision: 'ANTHROPIC_MODEL_VISION',
};

export function modelFor(tier: ModelTier, env: ModelEnv = {}): string {
  return env[ENV_KEYS[tier]]?.trim() || DEFAULTS[tier];
}

/**
 * `effort` (GA) lo soportan Sonnet 4.6+ y Opus 4.5+. Default conservador:
 * modelo no reconocido → NO se manda effort (un falso positivo es un 400
 * que rompe la llamada; omitirlo de más solo cuesta latencia/tokens).
 */
export function modelSupportsEffort(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return false;
  if (
    m.includes('opus-4-5') ||
    m.includes('opus-4-6') ||
    m.includes('opus-4-7')
  ) {
    return true;
  }
  if (m.includes('sonnet-4-6') || m.includes('sonnet-4-7')) return true;
  return false;
}

export interface ModelRequestParams {
  model: string;
  /** thinking off siempre: extracción/clasificación acotada, no razonamiento abierto. */
  thinking: { type: 'disabled' };
  output_config?: { effort: 'low' };
}

export function modelParams(
  tier: ModelTier,
  env: ModelEnv = {},
): ModelRequestParams {
  const model = modelFor(tier, env);
  const params: ModelRequestParams = {
    model,
    thinking: { type: 'disabled' },
  };
  if (modelSupportsEffort(model)) {
    params.output_config = { effort: 'low' };
  }
  return params;
}

const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

/** Modelo de transcripción de audio (OpenAI). El audio NO va por Claude. */
export function transcribeModel(env: ModelEnv = {}): string {
  return env.OPENAI_MODEL_TRANSCRIBE?.trim() || DEFAULT_TRANSCRIBE_MODEL;
}
