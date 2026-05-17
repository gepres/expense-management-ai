# @gastos/expense-ai

**Single source of truth** de la lógica IA de extracción **y clasificación**
de gastos, compartida por `gastos-backend` (web) y
`gastos-firebase-functions` (WhatsApp). Es TS **puro** (sin IO): prompts,
config de modelos, parsing/normalización al esquema canónico (español) y el
**ranking de clasificación** contra la taxonomía del usuario.

Lo que **NO** vive aquí: acceso a Firestore, clientes Anthropic/OpenAI y el
`learning_log` (Fase 3). El acceso a datos (categorías/métodos/historial) y
la llamada LLM acotada se **inyectan** desde cada repo vía `ClassifyDeps`.

## API

- `models`: `modelFor`, `modelSupportsEffort`, `modelParams`,
  `transcribeModel` (el entorno se **inyecta** como param, no lee `process.env`).
- `prompts`: `buildReceiptExtractionPrompt()`, `buildVoiceExpensePrompt(transcript, todayISO)`.
- `parse`: `extractJsonBlock`, `parseReceipt`, `parseVoice`, `isExtractionError`.
- `text`: `normalizeForMatching`, `phraseMatches`, `tokenizeForLearning`, `tokenOverlap`.
- `classify`: `classifyExpense(input, deps)` (orquesta orden 1→6) +
  puros `classifyByTaxonomy`, `classifyByHistory`, `categoryIdForTerm`,
  `resolvePaymentMethod`, `resolveCurrency`, `inferVoucherType`.
  Cada repo implementa `ClassifyDeps` (`getCategories`/`getHistory`/`llmClassify`).
- `learninglog`: `buildLearningLogDoc(entry)` — constructor ÚNICO del doc
  `users/{uid}/learning_log` (poda undefined + `tokens`; sin `createdAt`,
  lo añade cada repo). La colección Firestore es la misma para web y
  WhatsApp → el doc debe ser byte-compatible. Tipos `LearningLogEntryInput`,
  `LearningLogDoc`, `LearningLogChannel`.
- `types`: `ReceiptExtraction`, `VoiceExtraction`, `ExtractionError`, `Moneda`,
  `TaxonomyCategory`, `HistoryEntry`, `ClassificationResult`, `ClassifyDeps`.

## Sinergia entre repos (cómo evitar drift)

1. **Editá SOLO acá.** Este paquete es el único lugar de la lógica IA compartida.
2. Subí la versión en `package.json` si cambia el contrato.
3. `npm test` (node:test, sin deps).
4. `npm run sync` → compila, empaqueta y copia el `.tgz` a
   `../gastos-backend/vendor/` y `../gastos-firebase-functions/vendor/`.
5. En **cada** repo: `npm i` (la dep es `file:vendor/gastos-expense-ai-<v>.tgz`,
   commiteada → Vercel/Firebase la suben en su build aislado).

> Mejora futura (decisión del dueño, infra externa): mover este paquete a
> su propio repo en `github.com/gepres/` y cambiar la dep a
> `git+https://…#<tag>` — elimina el vendoreo manual del `.tgz`.

## Scripts

```bash
npm run build   # tsc → dist/
npm test        # build + node --test
npm run sync    # build + pack + copia .tgz a ambos repos
```
