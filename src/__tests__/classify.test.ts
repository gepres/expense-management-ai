import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForMatching,
  phraseMatches,
  tokenizeForLearning,
  tokenOverlap,
  categoryIdForTerm,
  classifyByTaxonomy,
  classifyByHistory,
  resolvePaymentMethod,
  resolveCurrency,
  inferVoucherType,
  classifyExpense,
  UNCLASSIFIED_CATEGORY,
  type TaxonomyCategory,
  type HistoryEntry,
  type ClassifyDeps,
} from '../index';

test('normalizeForMatching: NFD, lowercase, espacios', () => {
  assert.equal(normalizeForMatching('  Alimentación  '), 'alimentacion');
  assert.equal(normalizeForMatching('Pollo  a  la  Brasa'), 'pollo a la brasa');
});

test('phraseMatches: palabra completa, no substring', () => {
  assert.equal(phraseMatches('compre ropa nueva', 'ropa'), true);
  assert.equal(phraseMatches('viaje a europa', 'ropa'), false);
  assert.equal(
    phraseMatches('pollo a la brasa familiar', 'pollo a la brasa'),
    true,
  );
  assert.equal(phraseMatches('almuerzo', 'almuerzo'), true);
  assert.equal(phraseMatches('almuerzos del mes', 'almuerzo'), false);
  assert.equal(phraseMatches('cualquier cosa', ''), false);
});

test('tokenizeForLearning: filtra cortas y stopwords, cap 10', () => {
  const t = tokenizeForLearning('gaste 50 soles en almuerzo familiar');
  assert.ok(t.includes('almuerzo'));
  assert.ok(t.includes('familiar'));
  assert.ok(!t.includes('soles'));
  assert.ok(!t.includes('gaste'));
  assert.ok(!t.includes('en'));
  assert.ok(t.length <= 10);
});

test('tokenOverlap: overlap coef tolerante a longitud', () => {
  assert.equal(tokenOverlap([], ['taxi']), 0);
  assert.equal(tokenOverlap(['taxi'], ['taxi']), 1);
  assert.equal(tokenOverlap(['taxi', 'centro', 'comercial'], ['taxi']), 1);
  assert.equal(tokenOverlap(['pago', 'realizado'], ['taxi']), 0);
  assert.equal(tokenOverlap(['almuerzo', 'pollo'], ['almuerzo', 'trabajo']), 0.5);
});

const cats: TaxonomyCategory[] = [
  {
    id: 'transporte',
    nombre: 'Transporte',
    subcategorias: [{ id: 'taxi', nombre: 'Taxi' }],
  },
  {
    id: 'comida',
    nombre: 'Alimentación',
    subcategorias: [
      { id: 'pollo', nombre: 'Pollería', suggestions_ideas: ['pollo a la brasa'] },
    ],
  },
];

test('categoryIdForTerm: id, nombre, diacríticos, frase', () => {
  assert.equal(categoryIdForTerm('transporte', cats), 'transporte');
  assert.equal(categoryIdForTerm('Transporte', cats), 'transporte');
  assert.equal(categoryIdForTerm('comida', cats), 'comida');
  assert.equal(categoryIdForTerm('alimentacion', cats), 'comida');
  assert.equal(categoryIdForTerm('transporte publico', cats), 'transporte');
  assert.equal(categoryIdForTerm('salud', cats), null);
  assert.equal(categoryIdForTerm('', cats), null);
});

test('classifyByTaxonomy: suggestion > subcategory > category', () => {
  const s = classifyByTaxonomy('pague pollo a la brasa', cats);
  assert.deepEqual(s, {
    categoria: 'comida',
    subcategoria: 'pollo',
    matchedTerm: 'pollo a la brasa',
    matchedLevel: 'suggestion',
    needsClassification: false,
  });
  const sub = classifyByTaxonomy('un taxi al centro', cats);
  assert.equal(sub?.matchedLevel, 'subcategory');
  assert.equal(sub?.subcategoria, 'taxi');
  const cat = classifyByTaxonomy('gasto de transporte', cats);
  assert.equal(cat?.matchedLevel, 'category');
  assert.equal(cat?.subcategoria, null);
  assert.equal(classifyByTaxonomy('algo raro', cats), null);
});

test('classifyByHistory: corrección gana, score, recencia', () => {
  const h: HistoryEntry[] = [
    {
      field: 'categoria', value: 'otros', source: 'llm', type: 'inference',
      hasFeedback: false, tokens: ['taxi'], normalizedInput: 'taxi centro',
      createdAtMs: 100,
    },
    {
      field: 'categoria', value: 'transporte', source: 'user_correction',
      type: 'user_correction', hasFeedback: true, tokens: ['taxi'],
      normalizedInput: 'taxi', createdAtMs: 50,
    },
  ];
  const r = classifyByHistory(['taxi', 'noche'], h);
  assert.equal(r?.categoria, 'transporte');
  assert.equal(r?.matchedLevel, 'history');
  // Nunca reusa el centinela ni historial irrelevante.
  assert.equal(
    classifyByHistory(['pan'], [{
      field: 'categoria', value: UNCLASSIFIED_CATEGORY, source: 'default',
      type: 'inference', hasFeedback: false, tokens: ['pan'],
      normalizedInput: 'pan', createdAtMs: 1,
    }]),
    null,
  );
});

test('resolvePaymentMethod: text > inferred > fallback', () => {
  const methods = [{ id: 'bcp', nombre: 'BCP' }];
  assert.deepEqual(resolvePaymentMethod('pague con yape', methods), {
    metodoPago: 'yape', source: 'text', needsReview: false,
  });
  assert.equal(resolvePaymentMethod('compre en bcp algo', methods).metodoPago, 'bcp');
  assert.deepEqual(resolvePaymentMethod('almuerzo', methods, 'yape'), {
    metodoPago: 'yape', source: 'inferred', needsReview: false,
  });
  assert.deepEqual(resolvePaymentMethod('almuerzo', methods, 'bitcoin'), {
    metodoPago: 'otro', source: 'fallback', needsReview: true,
  });
  assert.deepEqual(resolvePaymentMethod('almuerzo', methods), {
    metodoPago: 'efectivo', source: 'fallback', needsReview: false,
  });
});

test('resolveCurrency / inferVoucherType', () => {
  assert.equal(resolveCurrency('pague 10 dolares', 'PEN').moneda, 'USD');
  assert.equal(resolveCurrency('10 soles', 'USD').moneda, 'PEN');
  assert.deepEqual(resolveCurrency('almuerzo', 'PEN'), {
    moneda: 'PEN', source: 'account',
  });
  assert.equal(inferVoucherType('me dieron factura'), 'factura');
  assert.equal(inferVoucherType('un recibo de luz'), 'recibo');
  assert.equal(inferVoucherType('nota de venta'), 'nota_venta');
  assert.equal(inferVoucherType('compra normal'), 'boleta');
});

test('classifyExpense: orden 1→6 con deps inyectadas', async () => {
  const calls: string[] = [];
  const deps: ClassifyDeps = {
    getCategories: async () => {
      calls.push('cats');
      return cats;
    },
    getHistory: async () => {
      calls.push('hist');
      return [];
    },
    llmClassify: async () => {
      calls.push('llm');
      return 'Transporte';
    },
  };
  // Match en taxonomía → no toca history ni llm.
  const a = await classifyExpense({ description: 'pollo a la brasa' }, deps);
  assert.equal(a.matchedLevel, 'suggestion');
  assert.deepEqual(calls, ['cats']);

  // Sin match → hint del LLM mapea (5a, costo cero, no llama llmClassify).
  calls.length = 0;
  const b = await classifyExpense(
    { description: 'algo raro xyz', llmCategoryHint: 'transporte' },
    deps,
  );
  assert.equal(b.categoria, 'transporte');
  assert.equal(b.matchedLevel, 'llm');
  assert.deepEqual(calls, ['cats', 'hist']);

  // Sin match ni hint → llamada LLM acotada (5b).
  calls.length = 0;
  const c = await classifyExpense({ description: 'algo raro xyz' }, deps);
  assert.equal(c.categoria, 'transporte');
  assert.deepEqual(calls, ['cats', 'hist', 'llm']);

  // LLM no resuelve → sin_clasificar (6).
  const d = await classifyExpense({ description: 'zzz' }, {
    ...deps,
    llmClassify: async () => null,
  });
  assert.equal(d.categoria, UNCLASSIFIED_CATEGORY);
  assert.equal(d.needsClassification, true);
});
