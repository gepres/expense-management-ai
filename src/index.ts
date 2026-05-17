/**
 * @gastos/expense-ai — lógica pura compartida de extracción de gastos.
 *
 * Single source of truth para gastos-backend (web) y
 * gastos-firebase-functions (WhatsApp). SIN IO: prompts, config de
 * modelos y parsing/normalización. La inferencia contra la taxonomía
 * del usuario y el acceso a Firestore viven en cada repo (adaptador).
 */

export * from './types';
export * from './models';
export * from './prompts';
export * from './parse';
