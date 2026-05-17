# @gastos/expense-ai

**Single source of truth** de la lógica IA de extracción de gastos,
compartida por `gastos-backend` (web) y `gastos-firebase-functions`
(WhatsApp). Es TS **puro** (sin IO): prompts, config de modelos y
parsing/normalización al esquema canónico (español).

Lo que **NO** vive aquí: acceso a Firestore, clientes Anthropic/OpenAI,
inferencia contra la taxonomía del usuario (Fase 2) y el `learning_log`
(Fase 3) — eso es el adaptador de cada repo.

## API

- `models`: `modelFor`, `modelSupportsEffort`, `modelParams`,
  `transcribeModel` (el entorno se **inyecta** como param, no lee `process.env`).
- `prompts`: `buildReceiptExtractionPrompt()`, `buildVoiceExpensePrompt(transcript, todayISO)`.
- `parse`: `extractJsonBlock`, `parseReceipt`, `parseVoice`, `isExtractionError`.
- `types`: `ReceiptExtraction`, `VoiceExtraction`, `ExtractionError`, `Moneda`.

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
