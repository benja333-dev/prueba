import { workflow, trigger, node, languageModel, expr } from '@n8n/workflow-sdk';

// =====================================================================
// PERFIL BENJAMIN BRUNET
// =====================================================================
const CV_PROFILE = `Associate Partner McKinsey 9 años. MBA IE Business School Madrid. Ingeniero Civil Industrial UAI.
Expertise: transformación operacional y comercial, P&L, procurement, supply chain, S&OP, M&A, due diligence, analytics avanzado, GenAI, Lean Manufacturing.
Impacto: +$500M EBITDA acumulado. Proyectos individuales $10M-$120M.
Industrias: CPG (bebidas, café, cerveza, aceites), Minería (cobre, explosivos), Aerolíneas/Logística, Retail, Automotriz.
Experiencia internacional: Chile, México, Guatemala, Colombia, Honduras, Ecuador, España.
Idiomas: Español nativo, Inglés fluido.
Roles ideales: CEO, COO, Gerente General, Country Manager, VP/Director Operaciones, VP/Director Comercial, Chief Transformation Officer, Director Supply Chain, Director Estrategia.`;

// =====================================================================
// 1. SCHEDULE TRIGGER — 7AM diario
// =====================================================================
const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Todos los dias a las 7AM',
    parameters: {
      rule: {
        interval: [{
          field: 'days',
          daysInterval: 1,
          triggerAtHour: 7,
          triggerAtMinute: 0
        }]
      }
    }
  }
});

// =====================================================================
// 2. CODE — define queries (todas engine: google_jobs que SÍ indexa LinkedIn)
// 14 queries × hasta 20 resultados = hasta 280 ofertas brutas
// =====================================================================
const defineQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Definir Todas las Queries',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [
  { json: { q: "CEO Chile",                                      rol: "CEO" } },
  { json: { q: "Chief Executive Officer Chile",                  rol: "CEO inglés" } },
  { json: { q: "Gerente General Chile",                          rol: "Gerente General" } },
  { json: { q: "Director General Chile",                         rol: "Director General" } },
  { json: { q: "COO Chief Operating Officer Chile",              rol: "COO" } },
  { json: { q: "Director de Operaciones Chile",                  rol: "Director Operaciones" } },
  { json: { q: "Director Comercial Chile",                       rol: "Director Comercial" } },
  { json: { q: "Gerente de Operaciones Chile",                   rol: "Gerente Operaciones" } },
  { json: { q: "Gerente Comercial Chile",                        rol: "Gerente Comercial" } },
  { json: { q: "Vicepresidente VP Chile",                        rol: "VP" } },
  { json: { q: "Vice President Latam Chile",                     rol: "VP Latam" } },
  { json: { q: "Country Manager Chile",                          rol: "Country Manager" } },
  { json: { q: "Director Supply Chain Logistica Chile",          rol: "Director Supply Chain" } },
  { json: { q: "Director de Estrategia Transformacion Chile",    rol: "Director Estrategia" } },
];`
    }
  }
});

// =====================================================================
// 3. HTTP REQUEST — SerpAPI Google Jobs (indexa LinkedIn, Laborum, Bumeran, Indeed)
// num=20 para obtener hasta 20 resultados por query
// =====================================================================
const searchSerpApi = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'SerpAPI - Google Jobs',
    parameters: {
      method: 'GET',
      url: 'https://serpapi.com/search.json',
      authentication: 'none',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'engine',   value: 'google_jobs' },
          { name: 'q',        value: expr('{{ $json.q }}') },
          { name: 'location', value: 'Chile' },
          { name: 'hl',       value: 'es' },
          { name: 'gl',       value: 'cl' },
          { name: 'num',      value: '20' },
          { name: 'api_key',  value: 'e94bae9ce27eb05fe2d73fdc3abfbb9fb1719a2fdabbdd7e8ad392ab3d9866c0' }
        ]
      }
    }
  }
});

// =====================================================================
// 4. CODE — agrega y deduplica, filtra basura
// =====================================================================
const aggregateJobs = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Agregar y Deduplicar Todos',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
const allJobs = [];
const seen = new Set();

// Palabras que indican cargo junior/no ejecutivo
const juniorWords = [
  'practicante','intern','trainee','cajero','operario','bodeguero',
  'vendedor externo','ejecutivo de ventas','jefe de zona','técnico',
  'asistente','auxiliar','recepcionista','secretaria'
];

// Títulos basura de Google Jobs (páginas de búsqueda, no empleos reales)
const junkPatterns = [
  /\\d+\\+?\\s*(empleos|jobs|ofertas)/i,
  /empleos de /i,
  /jobs in /i,
  /^\\d+ /,           // empieza con número
];

for (const item of $input.all()) {
  const d = item.json;

  if (!Array.isArray(d.jobs_results)) continue;

  for (const j of d.jobs_results) {
    const title = (j.title || '').trim();
    const company = (j.company_name || 'Confidencial').trim();
    const key = (title + '|' + company).toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);

    // Filtrar basura
    if (junkPatterns.some(p => p.test(title))) continue;

    // Filtrar cargos junior
    const tl = title.toLowerCase();
    if (juniorWords.some(w => tl.includes(w))) continue;

    // Obtener URL de aplicación
    let url = '#';
    if (j.apply_options?.length) url = j.apply_options[0].link || '#';
    else if (j.related_links?.length) url = j.related_links[0].link || '#';

    // Detectar fuente (LinkedIn tiene prioridad en display)
    const fuente = j.apply_options?.find(o => /linkedin/i.test(o.title))?.title
                || j.apply_options?.[0]?.title
                || 'Google Jobs';

    // Si hay opción LinkedIn, usar ese link
    const linkedinOpt = j.apply_options?.find(o => /linkedin/i.test(o.title));
    if (linkedinOpt?.link) url = linkedinOpt.link;

    allJobs.push({
      titulo:      title,
      empresa:     company,
      ubicacion:   j.location || 'Chile',
      descripcion: (j.description||'').substring(0,600).replace(/\\n/g,' '),
      url,
      publicado:   j.detected_extensions?.posted_at || 'Reciente',
      fuente,
      via:         j.via || ''
    });
  }
}

// Ordenar por fecha más reciente primero (aproximado)
const dateScore = (p) => {
  if (!p || p === 'Reciente') return 999;
  const m = p.match(/(\\d+)/);
  if (!m) return 999;
  const n = parseInt(m[1]);
  if (/hora|hour/i.test(p)) return n / 24;
  if (/día|day/i.test(p)) return n;
  if (/semana|week/i.test(p)) return n * 7;
  if (/mes|month/i.test(p)) return n * 30;
  return 999;
};
allJobs.sort((a, b) => dateScore(a.publicado) - dateScore(b.publicado));

return [{ json: {
  jobs: allJobs,
  total: allJobs.length,
  fecha: new Date().toLocaleDateString('es-CL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
}}];
`
    }
  }
});

// =====================================================================
// 5. OPENAI LLM — n8n connect
// =====================================================================
const openaiLLM = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'OpenAI - n8n connect',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' },
      responsesApiEnabled: false,
      options: { maxTokens: 10000, temperature: 0.2 }
    },
    credentials: {
      openAiApi: { id: 'cjetZrgB2dd22xkH', name: 'n8n free OpenAI API credits' }
    }
  }
});

// =====================================================================
// 6. AI AGENT — rankea TODOS los trabajos (sin filtrar por %)
// =====================================================================
const rankingAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente Ranking y Email',
    parameters: {
      promptType: 'define',
      text: expr(`Fecha: {{ $json.fecha }} | Total ofertas encontradas: {{ $json.total }}

PERFIL CANDIDATO:
${CV_PROFILE}

OFERTAS (JSON):
{{ JSON.stringify($json.jobs) }}

TAREA:
Para cada oferta calcula MATCH % (0-100):
- Nivel jerárquico (40%): CEO/Gerente General/COO/VP/Director/Country Manager = 85-100. Gerente funcional = 60-80. Jefe/Supervisor = 20-40.
- Industria (30%): CPG/Minería/Retail/Aerolíneas/Automotriz/Logística = 85-100. Manufactura/Energía = 60-80. Tech/Salud/Financiero = 40-60.
- Competencias requeridas (30%): transformación, operaciones, supply chain, P&L, M&A, analytics, estrategia = alto. Ventas puras, RRHH, Marketing = bajo.

IMPORTANTE: Incluye TODOS los trabajos con match ≥ 40%. NO descartes empleos que se vean relevantes aunque tengan match medio. Es mejor mostrar de más que de menos.

EMAIL HTML profesional:
- Fondo #f4f6f9. Header gradiente #1e3a5f→#2d5986, título "🎯 Radar Ejecutivo — [fecha]"
- Subtítulo "[N roles seleccionados de {{ $json.total }} analizados]"
- Sección "✅ POSTULAR URGENTE" (≥85%) fondo verde claro #e8f5e9
- Sección "👍 MUY RECOMENDABLE" (70-84%) fondo azul claro #e3f2fd
- Sección "💡 CONSIDERAR" (40-69%) fondo amarillo claro #fff8e1
- Omitir secciones vacías
- Por oferta: badge % | título negrita | empresa | ubicación | fuente | fecha publicación | descripción 3 líneas | "⭐ Por qué calza:" 1 línea específica | botón verde "Ver Oferta →" con href del url
- Ordenar mayor→menor match dentro de cada sección
- Footer: "Radar generado automáticamente · 14 búsquedas Google Jobs · bbrunetm@gmail.com"
- Max-width 700px, responsivo, Arial

DEVUELVE SOLO EL HTML COMPLETO.`),
      options: {
        systemMessage: 'Headhunter ejecutivo experto en Chile. Evalúas roles C-suite y directivos para un candidato senior de McKinsey. Eres INCLUSIVO: muestras todos los roles relevantes, nunca descartas por exceso de precaución. Solo generas HTML, sin búsquedas web.',
        maxIterations: 3,
        returnIntermediateSteps: false
      }
    },
    subnodes: { model: openaiLLM }
  }
});

// =====================================================================
// 7. GMAIL
// =====================================================================
const sendEmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Enviar Radar Ejecutivo',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: 'bbrunetm@gmail.com',
      subject: expr("🎯 Radar Ejecutivo {{ $now.format('EEEE d/M/yyyy') }} — Google Jobs + LinkedIn"),
      emailType: 'html',
      message: expr('{{ $json.output }}'),
      options: { appendAttribution: false }
    },
    credentials: {
      gmailOAuth2: { id: 'qZUnlDLFotZpwtDv', name: 'Gmail OAuth2 API' }
    }
  }
});

// =====================================================================
// WORKFLOW
// =====================================================================
export default workflow('radar-ejecutivo-v7', 'Radar Ejecutivo v7 - 14 Queries Google Jobs')
  .add(scheduleTrigger)
  .to(defineQueries)
  .to(searchSerpApi)
  .to(aggregateJobs)
  .to(rankingAgent)
  .to(sendEmail);
