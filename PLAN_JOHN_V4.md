# Plan John v4 — Memoria del Juez + Régimen de Mercado + Nivel de Invalidación

Plan de implementación para potenciar el workflow n8n **"Radar Bursatil Chile 24/7"**. Autocontenido: todo lo necesario está en este documento. Construir con el MCP de n8n (`get_sdk_reference` primero si se crean nodos nuevos; aquí casi todo es `update_workflow` con `setNodeParameter`).

---

## 1. Sistema actual (v3) — contexto imprescindible

**Workflow principal:** `qAAZpz4X8sqhS0ca` ("Radar Bursatil Chile 24/7"), ACTIVO, cron horaria.
**Workflow hermano:** `c4jlVfSUX64KdU3j` ("Radar Chile - Scorecard Semanal"), ACTIVO, viernes 22:00 UTC.
**Proyecto n8n:** `9LwLovaCaV2j7Zul` (personal, Benjamin Brunet). Instancia: Railway `n8n-production-121a.up.railway.app`.

**Cadena del workflow principal (nombres exactos de nodos):**

```
Agenda 24/7 (cron 1h)
→ Definir Universo IPSA          (Code: 25 emisores con alias, sin ^IPSA)
→ Armar Lotes Spark              (Code: 2 lotes de 13/12 tickers)
→ Precios Yahoo via Jina         (HTTP: spark 1y/1d vía r.jina.ai, responseFormat text → campo `data`)
→ Calcular Senales Tecnicas      (Code: RSI/SMA/retornos/vol, benchmark = MEDIANA de los 25, gatillos)
→ Contexto Macro Global          (HTTP executeOnce: spark SPY,CPER,ALB,SUZ,USO,UUP,ECH vía Jina)
→ Construir Contexto Macro       (Code: parsea spark → {contexto_macro_texto, macro:{SYM:{ultimo,v1,v5,v21}}, etiquetas})
→ Barrido Noticias Mercado       (HTTP executeOnce: Google News RSS mercado chileno, text)
→ Barrido Hechos Esenciales      (HTTP executeOnce: Google News RSS "hecho esencial", text)
→ Detectar Candidatos            (Code: parsea ambos RSS, match por alias, candidatos = gatillo ∪ mención)
→ Leer Bitacora Reciente         (dataTable get returnAll, filtro decision isNotEmpty, executeOnce, alwaysOutputData)
→ Filtro Cooldown                (Code: 12h por ticker salvo clase de gatillo nueva)
→ Fundamentales Emisor           (HTTP por candidato: fundamentals-timeseries vía Jina)
→ Procesar Fundamentales         (Code: EERR trimestral + YoY + P/E → fundamentales_texto)
→ Buscar Noticias Emisor         (HTTP por candidato: Google News RSS focalizado when:30d)
→ Armar Dossier                  (Code: junta todo → dossier con secciones para el prompt)
→ Analista Editor                (Agent Gemini flash-lite + Parser Senal Estructurada: mesa bull/bear/juez)
→ Consolidar Analisis            (Code: valida/normaliza campos del agente → objeto `analisis`)
→ Guardar en Bitacora            (dataTable insert)
→ Filtrar NOTIFICAR → Formatear Telegram → Enviar a Telegram (bot John)
```

**Data table bitácora:** `bitacora_bursatil_chile` id `NjGmsMWlc1W0Hp4t`. Columnas: fecha, ts, ticker, empresa, origen, precio_clp, ret_1d_pct, ret_21d_pct, rsi_14, dist_max_52s_pct, vol_anual_pct, gatillo_tecnico, fuentes, senal, direccion, horizonte, decision, conviccion, calidad_evidencia, lectura, evidencia, riesgos, catalizadores.

**Credenciales (usar `setNodeCredential`, NUNCA asumir que quedan solas):**
- Jina AI: `DZBVx4rBrIU8MYoB` (key `jinaAiApi`)
- Gemini: `Cy6roFBuHaJWOf4P` (key `googlePalmApi`), modelo `models/gemini-3.1-flash-lite`
- Telegram John: `mvZZtdyv3HEZQcrB` (key `telegramApi`), chat_id `8913173208`

**Campos que produce el parser del agente hoy:** senal, direccion (alza|baja|neutro), horizonte (dias|semanas|meses), decision (NOTIFICAR|SOLO_REGISTRAR), conviccion, calidad_evidencia, titular, caso_alcista, caso_bajista, lectura, evidencia, riesgos, catalizadores, que_observar.

---

## 2. Módulo A — Memoria del Juez (patrón FinMem, arXiv 2311.13743)

**Idea:** antes de fallar sobre un emisor, el juez lee sus propias llamadas anteriores sobre ese emisor CON el resultado real (precio de entonces vs precio de ahora). Cero nodos nuevos: los datos ya están cargados en la ejecución.

**Cambio 1 — `Armar Dossier` (setNodeParameter path `/jsCode`):** agregar al inicio la construcción del historial y al Object.assign el campo `historial_juez_texto`.

Lógica a insertar (los datos vienen de nodos que YA corren antes):

```js
// Precios actuales por ticker (ya calculados esta corrida)
var preciosHoy = {};
for (const it of $('Calcular Senales Tecnicas').all()) {
  var s = it.json || {};
  if (s.ticker) preciosHoy[s.ticker] = s.precio_clp;
}
// Historial desde la bitácora (ya cargada por 'Leer Bitacora Reciente')
var historial = {};
for (const it of $('Leer Bitacora Reciente').all()) {
  var r = it.json || {};
  if (!r.ticker || !r.ts || !r.direccion) continue;
  if (!historial[r.ticker]) historial[r.ticker] = [];
  historial[r.ticker].push(r);
}
function historialTexto(ticker) {
  var rows = (historial[ticker] || []).slice();
  rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
  rows = rows.slice(0, 3); // últimas 3 llamadas
  if (!rows.length) return 'Sin llamadas previas del juez sobre este emisor.';
  var pAhora = preciosHoy[ticker];
  var lineas = rows.map(function (r) {
    var dias = Math.round((Date.now() - Date.parse(r.ts)) / 86400000);
    var base = '- Hace ' + dias + 'd: ' + r.direccion + ' (' + (r.conviccion || 'n/d') + ', ' + (r.decision || '') + ') a ' + r.precio_clp + ' CLP';
    var p0 = Number(r.precio_clp);
    if (p0 && pAhora) {
      var ret = Math.round((pAhora / p0 - 1) * 1000) / 10;
      var ok = 'EN CURSO';
      if (dias >= 2) {
        if (r.direccion === 'alza') ok = ret >= 1 ? 'ACIERTO' : (ret <= -1 ? 'FALLO' : 'PLANO');
        else if (r.direccion === 'baja') ok = ret <= -1 ? 'ACIERTO' : (ret >= 1 ? 'FALLO' : 'PLANO');
        else ok = 'NEUTRO';
      }
      base += ' -> retorno desde entonces: ' + (ret > 0 ? '+' : '') + ret + '% [' + ok + ']';
    }
    return base;
  });
  return lineas.join('\n');
}
// ...y dentro del loop de candidatos, en el Object.assign:
//   historial_juez_texto: historialTexto(c.ticker),
```

**Cambio 2 — `Analista Editor` (path `/text`):** agregar sección antes de la instrucción final:

```
=== 9. TU HISTORIAL RECIENTE EN ESTE EMISOR (memoria del juez) ===
{{ $json.historial_juez_texto }}
```

**Cambio 3 — `Analista Editor` (path `/options/systemMessage`):** agregar al bloque del PASO 3 (juez):

> MEMORIA: revisa tu historial reciente en el emisor. Si tu ultima llamada fue ACIERTO y la tesis sigue vigente, puedes sostenerla con mas conviccion. Si fue FALLO, explica que cambio antes de repetir la misma direccion, o corrige. No repitas mecanicamente la llamada anterior: el historial es evidencia, no inercia.

---

## 3. Módulo B — Régimen de Mercado (risk-on / risk-off)

**Idea:** semáforo de mercado calculado determinísticamente; el juez ajusta la vara según el régimen. Cero nodos nuevos.

**Cambio 1 — `Construir Contexto Macro` (path `/jsCode`):** este nodo corre DESPUÉS de `Calcular Senales Tecnicas`, así que puede leerlo. Agregar al final, antes del return:

```js
// Amplitud del mercado local
var sobre50 = 0, sobre200 = 0, total = 0;
var medians = null;
for (const it of $('Calcular Senales Tecnicas').all()) {
  var s = it.json || {};
  if (!s.ticker) continue;
  total++;
  if (s.precio_clp && s.sma_50 && s.precio_clp > s.sma_50) sobre50++;
  if (s.precio_clp && s.sma_200 && s.precio_clp > s.sma_200) sobre200++;
  if (medians === null) medians = { m21: s.mercado_ret_21d_pct, m1: s.mercado_ret_1d_pct };
}
var pct50 = total ? Math.round(sobre50 / total * 100) : 0;
var pct200 = total ? Math.round(sobre200 / total * 100) : 0;
var ech21 = (macro.ECH || {}).v21;
var spy21 = (macro.SPY || {}).v21;
var puntos = 0;
if (pct50 >= 55) puntos++; if (pct50 <= 40) puntos--;
if (ech21 !== undefined && ech21 > 1) puntos++; if (ech21 !== undefined && ech21 < -4) puntos--;
if (spy21 !== undefined && spy21 > 0) puntos++; if (spy21 !== undefined && spy21 < -4) puntos--;
var regimen = puntos >= 2 ? 'RISK_ON' : (puntos <= -2 ? 'RISK_OFF' : 'NEUTRO');
var regimen_texto = 'REGIMEN: ' + regimen +
  ' | Amplitud local: ' + pct50 + '% de los 25 papeles sobre su SMA50, ' + pct200 + '% sobre su SMA200' +
  ' | Mercado local 21d (mediana): ' + (medians ? medians.m21 : '?') + '%' +
  ' | Chile en USD (ECH) 21d: ' + (ech21 !== undefined ? ech21 : '?') + '%' +
  ' | S&P 500 21d: ' + (spy21 !== undefined ? spy21 : '?') + '%';
// return: agregar regimen y regimen_texto al json del item de salida
```

**Cambio 2 — `Armar Dossier`:** pasar `regimen_texto: macroInfo.regimen_texto || 'Regimen no disponible'` en el Object.assign (macroInfo ya se lee ahí).

**Cambio 3 — `Analista Editor` `/text`:** nueva sección (puede ir junto al macro):

```
=== 3b. REGIMEN DE MERCADO ===
{{ $json.regimen_texto }}
```

**Cambio 4 — systemMessage, reglas del juez:**

> REGIMEN: en RISK_OFF una tesis alcista individual necesita evidencia fundamental o noticiosa FUERTE (no basta la tecnica); las tesis bajistas ganan un punto de conviccion. En RISK_ON, lo inverso. En NEUTRO no ajustes.

---

## 4. Módulo C — Nivel de Invalidación

**Idea:** cada señal declara el precio concreto donde su propia tesis queda invalidada (soporte/resistencia objetivo: SMA relevante, mínimo/máximo 52s, nivel redondo). Es el dato más accionable para decidir si entrar.

**Cambio 1 — `Parser Senal Estructurada` (path `/jsonSchemaExample`):** agregar al JSON de ejemplo:

```json
"nivel_invalidacion": "Precio concreto en CLP donde la tesis queda invalidada y por que (ej: 64.600 CLP, la SMA200; un cierre bajo ese nivel anula el sesgo)."
```

**Cambio 2 — systemMessage, lista de CAMPOS:**

> - nivel_invalidacion: el PRECIO CONCRETO (numero en CLP) donde tu tesis queda invalidada, anclado a un nivel objetivo de los datos (SMA20/50/200, minimo o maximo de 52s). Para sesgo alza suele ser un soporte bajo el precio; para baja, una resistencia sobre el precio. Si la direccion es neutro, escribe "n/a".

**Cambio 3 — `Consolidar Analisis` `/jsCode`:** agregar `nivel_invalidacion: o.nivel_invalidacion || ''` al objeto `analisis`.

**Cambio 4 — `Formatear Telegram` `/jsCode`:** después de `que_observar`:

```js
if (a.nivel_invalidacion && a.nivel_invalidacion !== 'n/a') p.push('🚧 <b>Invalidacion:</b> ' + esc(a.nivel_invalidacion));
```

**Cambio 5 — bitácora:** `add_data_table_column` (dataTableId `NjGmsMWlc1W0Hp4t`, projectId `9LwLovaCaV2j7Zul`, name `nivel_invalidacion`, type string) + en `Guardar en Bitacora` agregar mapping `setNodeParameter` path `/columns/value/nivel_invalidacion` valor `={{ $json.analisis.nivel_invalidacion }}`.

---

## 5. Protocolo de prueba (OBLIGATORIO antes de dar por terminado)

1. Aplicar cambios con `update_workflow` (los cambios quedan en el BORRADOR; producción sigue con la versión publicada — eso protege).
2. **Prueba quirúrgica:** reemplazar temporalmente el jsCode de `Filtro Cooldown` por un filtro que deje pasar solo `['SQM-B.SN', 'FALABELLA.SN']` ignorando cooldown (patrón ya usado en v3, ver historial del workflow). Ejecutar manual (`execute_workflow`).
3. Verificar en la ejecución (`get_execution` con `nodeNames` y `truncateData` — el output es enorme, usar el archivo guardado + python):
   - `Armar Dossier`: items traen `historial_juez_texto` y `regimen_texto` con contenido real.
   - `Construir Contexto Macro`: item trae `regimen` y `regimen_texto` coherentes con la amplitud.
   - `Consolidar Analisis`: `analisis.nivel_invalidacion` con un precio numérico y ancla técnica.
   - `Enviar a Telegram`: status success, message_id nuevos, mensaje muestra 🚧 Invalidación.
4. **Restaurar** el jsCode real de `Filtro Cooldown` (12h; el código exacto está en el nodo publicado — leerlo ANTES de pisarlo con el filtro temporal, guardarlo, y restaurarlo idéntico).
5. **`publish_workflow`** — sin esto producción NO toma los cambios. Verificar `activeVersionId` nuevo.

## 6. Trampas conocidas (lecciones ya pagadas — no re-descubrirlas)

- **Yahoo bloquea la IP de Railway (429 en TODO endpoint)**: siempre vía proxy `https://r.jina.ai/<url-yahoo>` con credencial Jina y `responseFormat: text` → el JSON llega como string en `$json.data`, a veces envuelto en markdown de Jina. Parsear con "buscar primer `{` → JSON.parse → si tiene `.data.content` string, parsear eso".
- **NUNCA usar tickers con `^` o `=` en URLs de nodos n8n** (doble-encoding los rompe silenciosamente: Yahoo omite el símbolo). Solo tickers planos. Por eso el benchmark es la mediana y los proxies macro son ETFs (SPY, CPER, ALB, SUZ, USO, UUP, ECH).
- **`fundamentals-timeseries` exige `period2` = epoch ACTUAL** (`{{ Math.floor(Date.now()/1000) }}`); con un valor futuro fijo devuelve series vacías.
- **`create_workflow_from_code` / `update_workflow` NO enlazan credenciales declaradas en código**: siempre rematar con op `setNodeCredential` por nodo y verificar.
- **Gemini devuelve niveles sucios** ("Media." con punto): `Consolidar Analisis` ya normaliza — mantener esa normalización al editar.
- **Ejecuciones grandes**: `get_execution` puede exceder el límite → usar `nodeNames` + `truncateData` y procesar el archivo guardado con python.
- El editor del SDK n8n no permite `.join()` ni métodos de array a nivel de SDK (solo dentro de strings jsCode).

## 7. Criterio de éxito

Una corrida manual de prueba donde un candidato con historial previo en la bitácora recibe: análisis que MENCIONA su historial, régimen aplicado en la lectura del juez, y mensaje de Telegram con nivel de invalidación numérico. Después: cooldown restaurado + publicado + una corrida de producción (cron) sin errores.
