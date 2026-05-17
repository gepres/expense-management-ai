import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modelFor,
  modelSupportsEffort,
  modelParams,
  transcribeModel,
  buildReceiptExtractionPrompt,
  buildVoiceExpensePrompt,
  extractJsonBlock,
  parseReceipt,
  parseVoice,
  isExtractionError,
} from '../index';

test('modelFor: default y override por env', () => {
  assert.equal(modelFor('primary'), 'claude-sonnet-4-6');
  assert.equal(modelFor('helper'), 'claude-haiku-4-5');
  assert.equal(
    modelFor('primary', { ANTHROPIC_MODEL_PRIMARY: 'claude-opus-4-7' }),
    'claude-opus-4-7',
  );
});

test('modelSupportsEffort: Haiku no, Sonnet4.6+/Opus4.5+ sí', () => {
  assert.equal(modelSupportsEffort('claude-haiku-4-5'), false);
  assert.equal(modelSupportsEffort('claude-sonnet-4-6'), true);
  assert.equal(modelSupportsEffort('claude-opus-4-7'), true);
  assert.equal(modelSupportsEffort('claude-sonnet-4-20250514'), false);
});

test('modelParams: effort solo si el modelo lo soporta', () => {
  const primary = modelParams('primary');
  assert.equal(primary.thinking.type, 'disabled');
  assert.deepEqual(primary.output_config, { effort: 'low' });
  const helper = modelParams('helper');
  assert.equal(helper.output_config, undefined);
});

test('transcribeModel: default y override', () => {
  assert.equal(transcribeModel(), 'gpt-4o-mini-transcribe');
  assert.equal(
    transcribeModel({ OPENAI_MODEL_TRANSCRIBE: 'whisper-1' }),
    'whisper-1',
  );
});

test('prompts: contienen el esquema canónico y el caso error', () => {
  const r = buildReceiptExtractionPrompt();
  assert.match(r, /"monto"/);
  assert.match(r, /"comercio"/);
  assert.match(r, /No se pudo extraer/);
  const v = buildVoiceExpensePrompt('gasté 10 en pan', '2026-05-17');
  assert.match(v, /2026-05-17/);
  assert.match(v, /"categoria"/);
});

test('extractJsonBlock: fenced y bare', () => {
  assert.equal(extractJsonBlock('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonBlock('texto {"a":2} fin'), '{"a":2}');
  assert.equal(extractJsonBlock('sin json'), null);
});

test('parseReceipt: normaliza, confianza 0-1→0-100, error y faltante', () => {
  const ok = parseReceipt(
    '{"monto":"25.5","moneda":"usd","fecha":"2026-05-01T00:00:00","metodoPago":"YAPE","comercio":"Polleria","confianza":0.9}',
  );
  assert.ok(ok && !isExtractionError(ok));
  if (ok && !isExtractionError(ok)) {
    assert.equal(ok.monto, 25.5);
    assert.equal(ok.moneda, 'USD');
    assert.equal(ok.fecha, '2026-05-01');
    assert.equal(ok.metodoPago, 'yape');
    assert.equal(ok.confianza, 90);
  }
  assert.deepEqual(parseReceipt('{"error":"no es comprobante"}'), {
    error: 'no es comprobante',
  });
  assert.ok(isExtractionError(parseReceipt('{"comercio":"x"}')!));
  assert.equal(parseReceipt('nada'), null);
});

test('parseVoice: incompleto → error; ok normaliza', () => {
  assert.ok(isExtractionError(parseVoice('{"monto":10}')!));
  const ok = parseVoice(
    '{"monto":10,"categoria":"alimentacion","descripcion":"pan"}',
  );
  assert.ok(ok && !isExtractionError(ok));
  if (ok && !isExtractionError(ok)) {
    assert.equal(ok.categoria, 'alimentacion');
    assert.equal(ok.moneda, 'PEN');
    assert.equal(ok.fecha, null);
  }
});
