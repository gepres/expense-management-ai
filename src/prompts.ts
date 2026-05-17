/**
 * Prompts FUSIONADOS (single source of truth para web + WhatsApp).
 *
 * Fusiona lo mejor de ambos repos:
 *  - de gastos-backend: heurísticas peruanas detalladas (logos Yape/Plin,
 *    hora, nº de operación, confianza, hint de subcategoría por descripción).
 *  - de gastos-firebase-functions: instrucciones explícitas de interfaz
 *    Yape/Plin y el caso "no es un gasto" (objeto `{ "error": ... }`).
 *
 * Salida: SIEMPRE el esquema CANÓNICO en español (ver types.ts). Cada repo
 * mapea ese canónico a su forma de respuesta en su propia frontera.
 */

/** Prompt de OCR de comprobante (se envía junto con la imagen). */
export function buildReceiptExtractionPrompt(): string {
  return `Analiza esta imagen de un comprobante, recibo o captura de pago peruano (Yape, Plin, transferencia, boleta, factura) y extrae la información.

IMPORTANTE: Responde SOLO con el objeto JSON, sin texto adicional, sin markdown, sin explicaciones.

{
  "monto": número (monto total, solo el número, sin símbolo),
  "moneda": "PEN" o "USD",
  "fecha": "YYYY-MM-DD" (fecha de la transacción),
  "hora": "HH:mm:ss" (hora 24h si está visible, si no null),
  "metodoPago": "yape" | "plin" | "transferencia" | "efectivo" | "tarjeta",
  "comercio": "nombre del comercio o destinatario del pago",
  "numeroOperacion": "número de operación si existe, si no null",
  "categoria": "sugerencia: alimentacion|transporte|entretenimiento|salud|educacion|servicios|compras|vivienda|otros",
  "subcategoria": "subcategoría sugerida o null. Fíjate en la descripción del comprobante (Yape/Plin): suele SER la subcategoría (ej: polleria, bodega, panaderia, farmacia, menu, cena)",
  "descripcion": "descripción breve del gasto",
  "confianza": número 0-100 (tu confianza en TODOS los datos extraídos)
}

Si la imagen NO es un comprobante válido o no puedes extraer la info, responde EXACTAMENTE:
{ "error": "No se pudo extraer información del comprobante" }

Reglas:
- Si un campo no está visible o no estás seguro, usa null.
- Formatos peruanos: "S/" = soles (PEN).
- CAPTURAS DE YAPE/PLIN: busca el monto enviado/recibido, el nombre del destinatario y la fecha. Si ves el logo o interfaz de Yape (morado) → metodoPago "yape"; si es Plin (azul/verde) → "plin".
- RECIBOS/BOLETAS: nombre del comercio, monto total, fecha de emisión. FACTURAS: extrae RUC si está visible.
- Fechas DD/MM/YYYY → conviértelas a YYYY-MM-DD.
- "monto" solo el número, sin símbolo de moneda.
- En Yape/Plin el destinatario ES el "comercio".
- Infiere "categoria" por el nombre del comercio o el concepto.`;
}

/**
 * Prompt de parseo de gasto desde TEXTO (voz transcrita o mensaje).
 * @param transcript texto del usuario
 * @param todayISO fecha de hoy YYYY-MM-DD (contexto para fechas relativas)
 */
export function buildVoiceExpensePrompt(
  transcript: string,
  todayISO: string,
): string {
  return `Eres un asistente que extrae información de un gasto desde texto en español (Perú).
Fecha de hoy: ${todayISO}

Texto del usuario: "${transcript}"

Responde SOLO con un objeto JSON con esta forma exacta:
{
  "monto": número (sin símbolos),
  "moneda": "PEN" o "USD",
  "categoria": "alimentacion|transporte|entretenimiento|salud|educacion|servicios|compras|vivienda|otros",
  "subcategoria": "subcategoría si se menciona, si no null",
  "descripcion": "descripción breve y clara del gasto",
  "metodoPago": "yape|plin|efectivo|transferencia|tarjeta_debito|tarjeta_credito|otros, o null si no se menciona",
  "fecha": "YYYY-MM-DD si se menciona o se infiere de una fecha relativa, si no null",
  "confianza": número 0-100
}

Si el texto NO contiene información de un gasto, responde EXACTAMENTE:
{ "error": "No se pudo identificar información de gasto en el mensaje" }

Reglas:
- Si no se menciona la moneda, asume PEN.
- Conserva los decimales del monto.
- Infiere la categoría del contexto si no se menciona explícitamente.
- Métodos peruanos comunes: "yape", "plin", "transferencia".
- Fechas relativas ("ayer", "el lunes pasado", "hace una semana") → resuélvelas contra la fecha de hoy y devuelve YYYY-MM-DD.
- Si falta info crítica (monto o categoría), baja la "confianza" (< 60).

Ejemplos:
- "Gasté 25 soles en almuerzo" → {"monto":25,"moneda":"PEN","categoria":"alimentacion","descripcion":"almuerzo"}
- "50 en taxi en efectivo" → {"monto":50,"moneda":"PEN","categoria":"transporte","descripcion":"taxi","metodoPago":"efectivo"}
- "Compré medicina por 80 ayer" → {"monto":80,"moneda":"PEN","categoria":"salud","descripcion":"medicina","fecha":"<ayer>"}`;
}
