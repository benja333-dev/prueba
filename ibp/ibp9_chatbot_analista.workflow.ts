import { workflow, node, trigger, sticky, languageModel, memory, expr } from '@n8n/workflow-sdk';

const webhookChat = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook Chat',
    parameters: { httpMethod: 'POST', path: 'ibp-chat', responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    position: [0, 400]
  },
  output: [{ body: { pregunta: 'Cuales son los SKUs con inventario mas bajo?', run_id: '', session_id: 'sesion-1' } }]
});

const leerSkus = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer SKUs',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'ODnCATjYdcBBpjoX', cachedResultName: 'IBP_SKU_Master' }, returnAll: true },
    executeOnce: true,
    position: [220, 400]
  },
  output: [{ sku_id: 'SKU-001', nombre: 'Barra leche 100g', familia: 'BAR-LECHE', clase_abc: 'A', clase_xyz: 'X', precio_venta: 1890, costo_conversion: 1100, stock_seguridad: 2500, inventario_inicial: 4000, capacidad_linea_mensual: 17000, batch_minimo: 1000, categoria: 'BARRAS' }]
});

const leerHistoria = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Demanda Historica',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'PUhklrBDyXNehfKs', cachedResultName: 'IBP_Demanda_Historica' }, returnAll: true },
    executeOnce: true,
    position: [420, 400]
  },
  output: [{ sku_id: 'SKU-001', mes: '2025-12', unidades: 19100 }]
});

const leerForecast = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Forecast',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: '6QKIRWw04TQf3xdf', cachedResultName: 'IBP_Forecast' }, returnAll: true },
    executeOnce: true,
    position: [620, 400]
  },
  output: [{ run_id: 'RUN-1', sku_id: 'SKU-001', mes: '2026-07', forecast_estadistico: 16000, factor_ai: 1.05, forecast_consenso: 16800, razon_ai: 'invierno' }]
});

const leerPlan = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Plan Produccion',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'BJICXWY5p4sGhopK', cachedResultName: 'IBP_Plan_Produccion' }, returnAll: true },
    executeOnce: true,
    position: [820, 400]
  },
  output: [{ run_id: 'RUN-1', sku_id: 'SKU-001', mes: '2026-07', produccion: 17000, inventario_final: 4200, demanda_atendida: 16800, quiebre: 0 }]
});

const leerSchedule = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Schedule',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'HjhL6P7SLoNtD9Bk', cachedResultName: 'IBP_Schedule' }, returnAll: true },
    executeOnce: true,
    position: [1020, 400]
  },
  output: [{ run_id: 'RUN-1', mes: '2026-07', fabrica_id: 'FAB-S', linea_id: 'LIN-S1', secuencia: 1, tipo: 'PRODUCCION', familia: 'BAR-LECHE', unidades: 17000, horas: 120, dia_inicio: 1, dia_fin: 8, turnos: 2, costo_clp: 4200000 }]
});

const leerCompras = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Compras',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: '4vpYRReeynJmttV4', cachedResultName: 'IBP_Plan_Compras' }, returnAll: true },
    executeOnce: true,
    position: [1220, 400]
  },
  output: [{ run_id: 'RUN-1', material_id: 'MAT-CACAO', mes: '2026-07', cantidad: 12000, costo_total: 18000000, fecha_orden: '2026-06-01', proveedor: 'Cacao Andes', alerta: '' }]
});

const leerPyL = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer PyL',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'sTuBcxdDmHmAo3g6', cachedResultName: 'IBP_PL_Financiero' }, returnAll: true },
    executeOnce: true,
    position: [1420, 400]
  },
  output: [{ run_id: 'RUN-1', familia: 'BAR-LECHE', mes: '2026-07', ingresos: 31752000, cogs: 18480000, margen_bruto: 13272000, margen_pct: 41.8, venta_perdida: 0 }]
});

const leerResumen = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Resumen Ejecutivo',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'sdArBbNUEQZ4DYtP', cachedResultName: 'IBP_Resumen_Ejecutivo' }, returnAll: true },
    executeOnce: true,
    position: [1620, 400]
  },
  output: [{ run_id: 'RUN-1', fecha: '2026-07-01', resumen: 'Ciclo conciliado', decisiones: 'a|b', alertas: 'c|d', ingresos_totales: 190000000, margen_pct: 43.1, venta_perdida_total: 5200000, fill_rate_pct: 97.4 }]
});

const leerMinutas = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Minutas',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'y7hwtJjbE3Y07PJ9', cachedResultName: 'IBP_Minutas' }, returnAll: true },
    executeOnce: true,
    position: [1820, 400]
  },
  output: [{ run_id: 'RUN-1', paso: 1, agente: 'Demand Planning', reunion: 'Reunion de Demanda', logica: 'regresion|estacionalidad', conclusiones: 'x', decisiones_json: '[]', riesgos: 'y', handoff: 'z', fecha: '2026-07-01' }]
});

const leerMateriales = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Materiales',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: '5X7W9dLJdgo76WaF', cachedResultName: 'IBP_Materiales' }, returnAll: true },
    executeOnce: true,
    position: [2020, 400]
  },
  output: [{ material_id: 'MAT-CACAO', nombre: 'Licor de cacao', stock_actual: 8000, lead_time_dias: 45, moq: 5000, costo_unitario: 1500, proveedor: 'Cacao Andes' }]
});

const leerParametros = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Parametros',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: '4aaMPxy84paqdpQt', cachedResultName: 'IBP_Parametros' }, returnAll: true },
    executeOnce: true,
    position: [2220, 400]
  },
  output: [{ clave: 'horizonte_meses', valor: 6, descripcion: 'Horizonte de planificacion' }]
});

const leerLineas = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Lineas',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'IRvuLUZBJA6gZbQL', cachedResultName: 'IBP_Lineas' }, returnAll: true },
    executeOnce: true,
    position: [2420, 400]
  },
  output: [{ linea_id: 'LIN-S1', fabrica_id: 'FAB-S', nombre: 'Moldeo 1 alta velocidad', turnos_base: 2, turnos_max: 3, horas_turno: 8, oee_pct: 70, operadores_por_turno: 6, costo_hora_clp: 45000 }]
});

const leerFabricas = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer Fabricas',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'oHmHvbFieo8WQaeP', cachedResultName: 'IBP_Fabricas' }, returnAll: true },
    executeOnce: true,
    position: [2620, 400]
  },
  output: [{ fabrica_id: 'FAB-S', nombre: 'Planta Santiago', ciudad: 'Santiago', operadores_pool_turno: 24, dias_habiles_mes: 22, costo_fijo_mensual_clp: 180000000 }]
});

const leerBom = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Leer BOM',
    parameters: { operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'eslBeZxbU6cRBCfF', cachedResultName: 'IBP_BOM' }, returnAll: true },
    executeOnce: true,
    position: [2820, 400]
  },
  output: [{ familia: 'BAR-LECHE', material_id: 'MAT-CACAO', cantidad_por_unidad: 0.35 }]
});

const construirContexto = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Construir Contexto Analitico',
    parameters: { jsCode: 'return [{ json: { pendiente: true } }];' },
    executeOnce: true,
    position: [3020, 400]
  },
  output: [{ pregunta: 'Cuales son los SKUs con inventario mas bajo?', session_id: 'sesion-1', run_id: 'RUN-1', runs_disponibles: ['RUN-1'], sin_datos: false, pregunta_vacia: false, contexto_json: '{}', tamano_contexto: 48210 }]
});

const geminiAnalista = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini Analista',
    parameters: { modelName: 'models/gemini-3.1-flash-lite', options: { temperature: 0.2, maxOutputTokens: 4096 } },
    credentials: { googlePalmApi: { id: 'Cy6roFBuHaJWOf4P', name: 'Google Gemini(PaLM) Api account' } },
    position: [3020, 640]
  }
});

const memoriaChat = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.4,
  config: {
    name: 'Memoria de Conversacion',
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: expr('{{ $("Webhook Chat").first().json.body?.session_id || "anon" }}'),
      contextWindowLength: 10
    },
    position: [3240, 640]
  }
});

const analistaIbp = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Analista IBP',
    parameters: {
      promptType: 'define',
      text: expr('{{ $json.pregunta || "El analista no escribio ninguna pregunta. Pide amablemente que formule su consulta e incluye tres ejemplos utiles de preguntas sobre este ciclo S&OP." }}'),
      options: { systemMessage: 'Eres el Analista IBP. Reemplazado tras la creacion.', maxIterations: 3, enableStreaming: false }
    },
    onError: 'continueRegularOutput',
    position: [3240, 400],
    subnodes: { model: geminiAnalista, memory: memoriaChat }
  },
  output: [{ output: 'Los tres SKUs con menor cobertura son SKU-047, SKU-012 y SKU-088.' }]
});

const formatearRespuesta = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Formatear Respuesta',
    parameters: { jsCode: 'return [{ json: { pendiente: true } }];' },
    position: [3460, 400]
  },
  output: [{ ok: true, respuesta: 'Los tres SKUs con menor cobertura son SKU-047, SKU-012 y SKU-088.', run_id: 'RUN-1', session_id: 'sesion-1', runs_disponibles: ['RUN-1'], tamano_contexto: 48210, ts: '2026-07-30T12:00:00.000Z' }]
});

const responderChat = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder Chat',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify($json) }}'),
      options: {
        enableStreaming: false,
        responseHeaders: { entries: [
          { name: 'Content-Type', value: 'application/json; charset=utf-8' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'no-store' }
        ] }
      }
    },
    position: [3680, 400]
  }
});

const notaChat = sticky('## IBP 9 - Chatbot Analista (Q&A del ciclo S&OP)\n\nPOST /webhook/ibp-chat con body JSON { pregunta, run_id opcional, session_id }.\nResponde { ok, respuesta markdown, run_id, session_id, ts }.\n\nLee todas las Data Tables IBP_* y precalcula un digest analitico determinista (KPIs, series por mes, familia y clase ABC, capacidad por linea, materias primas, ajustes de IA, rankings de criticidad, outliers de proyeccion y la ficha de los 100 SKUs). El digest completo va al system prompt, por lo que las cifras las calcula el Code node y no el LLM.\n\nMemoria por session_id (10 turnos). CORS abierto para que el Portal IBP (workflow 8) lo consuma desde el navegador.', [webhookChat], { color: 4, width: 460, height: 300 });

export default workflow('ibp-9-chatbot-analista', 'IBP - 9 - Chatbot Analista (Q&A)')
  .add(webhookChat)
  .to(leerSkus)
  .to(leerHistoria)
  .to(leerForecast)
  .to(leerPlan)
  .to(leerSchedule)
  .to(leerCompras)
  .to(leerPyL)
  .to(leerResumen)
  .to(leerMinutas)
  .to(leerMateriales)
  .to(leerParametros)
  .to(leerLineas)
  .to(leerFabricas)
  .to(leerBom)
  .to(construirContexto)
  .to(analistaIbp)
  .to(formatearRespuesta)
  .to(responderChat)
  .add(notaChat);
