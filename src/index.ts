/**
 * @gastos/expense-ai — lógica pura compartida de extracción de gastos.
 *
 * Single source of truth para gastos-backend (web) y
 * gastos-firebase-functions (WhatsApp). SIN IO: prompts, config de
 * modelos, parsing/normalización y el RANKING de clasificación contra la
 * taxonomía del usuario. El acceso a Firestore (categorías, métodos,
 * learning_log) y la llamada LLM acotada se inyectan desde cada repo
 * (adaptador) vía `ClassifyDeps`.
 */

export * from './types';
export * from './models';
export * from './prompts';
export * from './parse';
export * from './text';
export * from './classify';
