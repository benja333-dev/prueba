# S&OP / IBP — Resumen 360 + Chatbot Analista

Código fuente versionado de los dos workflows n8n que producen el portal del ciclo S&OP
de la Red de Chocolates (100 SKUs, 6 familias, 2 plantas, horizonte 6 meses, CLP).

## Workflows en n8n

| Workflow | ID | Endpoint |
| --- | --- | --- |
| `IBP · 8 · Portal IBP (Dashboard)` | `ap4DTqlLG2OyfOxn` | `GET /webhook/ibp-portal?run_id=…` |
| `IBP · 9 · Chatbot Analista (Q&A)` | `ofG62y7g1ygIX4G2` | `POST /webhook/ibp-chat` |

Host: `https://n8n-production-121a.up.railway.app`. Sin `run_id` el portal muestra el último run.

## Qué se agregó

### 1. Tab «Resumen 360» (primer tab del portal)

Consolida las 6 reuniones del ciclo en una sola vista: 14 KPIs, 7 gráficos y 8 tablas.

- **KPIs**: forecast consenso y uplift IA, producción, fill rate (con semáforo), quiebre,
  ingresos, margen vs objetivo 45%, venta perdida, inventario promedio y cobertura vs norma
  de 45 días, SKUs bajo stock de seguridad, sobre-stock >90 días, gasto de materias primas
  y órdenes urgentes, costo del programa y % de horas en changeover, utilización de plantas,
  decisiones automáticas.
- **Gráficos**: historia vs forecast estadístico vs consenso vs producción; inventario y
  cobertura contra la norma (doble eje); atendida vs quiebre con fill rate; inventario y
  forecast por familia; P&L mensual con margen %; gasto por proveedor; barras de utilización
  por línea.
- **Tablas**: semáforo por familia; foto mes a mes de todas las etapas; SKUs más críticos por
  nivel de inventario; dónde se pierde la venta; **proyecciones más atípicas** (z-score del
  forecast contra el promedio histórico de 12 meses); materias primas en riesgo (explosión de
  BOM); cumplimiento de política ABC; matriz ABC/XYZ; ajustes del motor de IA con su razón.

### 2. Chatbot «Analista IBP» dentro del HTML

Botón flotante → panel lateral con sugerencias, memoria de conversación y render de markdown
(tablas, listas, negritas). El navegador hace `POST` al workflow 9 con
`{ pregunta, run_id, session_id }` y recibe `{ ok, respuesta, run_id, session_id, ts }`.

La URL del chat **no va fija**: el cliente la deriva de su propia dirección (reemplaza
`ibp-portal` por `ibp-chat`), lo que garantiza mismo origen y mismo prefijo, y cae a una URL
absoluta de respaldo si eso no aplica. Ojo: el nodo Webhook de n8n usa `isFullPath`, así que la
ruta real **no lleva el UUID del nodo** aunque la API lo reporte así — usarla da 404 sin
cabeceras CORS, que el navegador muestra como `Failed to fetch`.

**Las cifras las calcula el Code node, no el LLM.** El workflow 9 lee las 14 Data Tables
`IBP_*` y precalcula un digest determinista (~105 KB) con KPIs, series por mes/familia/clase
ABC, capacidad por línea, materias primas, ajustes de IA, rankings de criticidad, outliers y
la ficha de los 100 SKUs. Ese digest va completo al system prompt de Gemini, que solo lee,
explica y recomienda.

Modelo: `models/gemini-3.1-flash-lite` (credencial `Google Gemini(PaLM) Api account`).
Para análisis más profundo se puede cambiar a `models/gemini-3.1-pro-preview` en el nodo
`Gemini Analista`.

### 3. Rendimiento del portal

Todas las lecturas de Data Table quedaron con `executeOnce: true`. Antes cada tabla se releía
una vez por fila de la tabla anterior; ahora el portal completo responde en ~1 s.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `ibp8_portal_construir_portal.js` | Code node «Construir Portal» (genera el HTML completo) |
| `ibp8_portal_ibp.workflow.json` | Export del workflow 8 |
| `ibp9_construir_contexto_analitico.js` | Code node que arma el digest analítico del chatbot |
| `ibp9_system_prompt.txt` | System prompt del agente Analista IBP |
| `ibp9_formatear_respuesta.js` | Formateo de la respuesta (tolerante a fallos del LLM) |
| `ibp9_chatbot_analista.workflow.ts` | Fuente SDK del workflow 9 |
| `ibp9_chatbot_analista.workflow.json` | Export del workflow 9 |
| `ejemplo_portal_generado.html` | Salida real del portal para el run `RUN-20260705-201200` |

## Verificación

El portal se probó renderizando el HTML real y ejecutándolo en Chromium: los 8 tabs cargan,
12 gráficos se construyen, 0 errores de consola y 0 `undefined`/`NaN`. El chatbot se probó
contra los datos reales y respondió con SKUs, cifras en CLP y tabla markdown en ~4 s.

Para volver a verificar tras un cambio en el Code node del portal:

```bash
# extraer el HTML de una ejecución del workflow 8 y abrirlo en Chromium
node verify.js   # ver el script de verificación en el historial de la sesión
```
