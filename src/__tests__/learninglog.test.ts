import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningLogDoc } from '../index';

test('buildLearningLogDoc: poda undefined, calcula tokens, sin createdAt', () => {
  const doc = buildLearningLogDoc({
    type: 'inference',
    input: {
      raw: 'Pollo a la brasa familiar',
      normalized: 'pollo a la brasa familiar',
      channel: 'audio',
    },
    decision: {
      field: 'categoria',
      value: 'comida',
      source: 'llm',
      matchedTerm: undefined,
      confidence: undefined,
    },
  });

  assert.equal(doc.type, 'inference');
  assert.equal(doc.input.channel, 'audio');
  assert.deepEqual(doc.decision, {
    field: 'categoria',
    value: 'comida',
    source: 'llm',
  });
  assert.ok(!('matchedTerm' in doc.decision));
  assert.ok(!('confidence' in doc.decision));
  assert.ok(!('createdAt' in doc));
  assert.ok(!('expenseId' in doc));
  // tokens = tokenizeForLearning(normalized): ≥3 chars, sin stopwords.
  assert.ok(doc.tokens.includes('pollo'));
  assert.ok(doc.tokens.includes('brasa'));
  assert.ok(doc.tokens.includes('familiar'));
});

test('buildLearningLogDoc: conserva opcionales presentes y expenseId', () => {
  const doc = buildLearningLogDoc({
    expenseId: 'exp_1',
    type: 'user_correction',
    input: { raw: 'taxi', normalized: 'taxi', channel: 'text' },
    decision: {
      field: 'categoria',
      value: 'transporte',
      source: 'user_correction',
      matchedTerm: 'taxi',
      confidence: 90,
    },
  });

  assert.equal(doc.expenseId, 'exp_1');
  assert.equal(doc.type, 'user_correction');
  assert.equal(doc.decision.matchedTerm, 'taxi');
  assert.equal(doc.decision.confidence, 90);
  assert.deepEqual(doc.tokens, ['taxi']);
});
