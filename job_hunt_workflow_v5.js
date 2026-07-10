import { workflow, trigger, node, merge, languageModel, newCredential, expr } from '@n8n/workflow-sdk';

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
// RAMA A: JSEARCH (LinkedIn + Indeed + Glassdoor + más)
// Plan gratis: 10 req/mes → sube a Basic $10/mes para uso diario
// =====================================================================
const jsearchQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'JSearch - Queries',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [
  { json: { q: "CEO Chile", fuente: "jsearch" } },
  { json: { q: "Gerente General Chile", fuente: "jsearch" } },
  { json: { q: "VP Vicepresidente Vice President Chile", fuente: "jsearch" } },
  { json: { q: "Director Operaciones Director Comercial Chile", fuente: "jsearch" } },
  { json: { q: "Gerente Operaciones Gerente Comercial Chile", fuente: "jsearch" } },
  { json: { q: "COO Country Manager Chief Officer Chile", fuente: "jsearch" } }
];`
    }
  }
});

const jsearchHttp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'JSearch - HTTP',
    parameters: {
      method: 'GET',
      url: 'https://jsearch.p.rapidapi.com/search',
      authentication: 'none',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'query',      value: expr('{{ $json.q }}') },
          { name: 'page',       value: '1' },
          { name: 'num_pages',  value: '2' },
          { name: 'country',    value: 'cl' },
          { name: 'date_posted',value: 'week' }
        ]
      },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'X-RapidAPI-Key',  value: '745fc96366msh14a202f2263ec16p197990jsnb613a6a0d480' },
          { name: 'X-RapidAPI-Host', value: 'jsearch.p.rapidapi.com' }
        ]
      }
    }
  }
});

// =====================================================================
// RAMA B: SERPAPI (Google Jobs → indexa LinkedIn, Laborum, Bumeran, etc.)
// Plan gratis: 100 búsquedas/día
// Agrega en n8n Settings > Environment Variables: SERPAPI_KEY=tu_key
// =====================================================================
const serpApiQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'SerpAPI - Queries',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [
  { json: { q: "CEO Chile", fuente: "serpapi" } },
  { json: { q: "Gerente General Chile", fuente: "serpapi" } },
  { json: { q: "Director Operaciones Chile", fuente: "serpapi" } },
  { json: { q: "Director Comercial Chile", fuente: "serpapi" } },
  { json: { q: "Gerente Operaciones OR Gerente Comercial Chile", fuente: "serpapi" } },
  { json: { q: "VP Vicepresidente Vice President Chile", fuente: "serpapi" } }
];`
    }
  }
});

const serpApiHttp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'SerpAPI - HTTP',
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
          { name: 'api_key',  value: 'e94bae9ce27eb05fe2d73fdc3abfbb9fb1719a2fdabbdd7e8ad392ab3d9866c0' }
        ]
      }
    }
  }
});

// =====================================================================
// MERGE — combina resultados de ambas ramas
// =====================================================================
const mergeApis = merge({
  version: 3.2,
  config: {
    name: 'Merge JSearch + SerpAPI',
    parameters: { mode: 'append' }
  }
});

// =====================================================================
// AGGREGATE — deduplica y normaliza ambos formatos
// =====================================================================
const aggregateJobs = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Agregar y Deduplicar',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
const allJobs = [];
const seen = new Set();
const juniorWords = ['analyst','analista','practicante','intern','trainee','vendedor','asesor','ejecutivo de ventas','jefe de zona','tecnico'];

for (const item of $input.all()) {
  const d = item.json;

  // --- Formato JSearch ---
  if (d.data && Array.isArray(d.data)) {
    for (const j of d.data) {
      const key = ((j.job_title||'')+'|'+(j.employer_name||'')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const t = (j.job_title||'').toLowerCase();
      if (juniorWords.some(w => t.includes(w))) continue;
      let url = j.job_apply_link || j.job_google_link || '#';
      allJobs.push({
        titulo:      j.job_title || 'N/A',
        empresa:     j.employer_name || 'Confidencial',
        ubicacion:   [j.job_city, j.job_country].filter(Boolean).join(', ') || 'Chile',
        descripcion: (j.job_description||'').substring(0,500).replace(/\\n/g,' '),
        url,
        publicado:   j.job_posted_at_datetime_utc ? j.job_posted_at_datetime_utc.substring(0,10) : 'Reciente',
        fuente:      j.job_publisher || 'LinkedIn/Indeed'
      });
    }
  }

  // --- Formato SerpAPI ---
  if (d.jobs_results && Array.isArray(d.jobs_results)) {
    for (const j of d.jobs_results) {
      const key = ((j.title||'')+'|'+(j.company_name||'')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const t = (j.title||'').toLowerCase();
      if (juniorWords.some(w => t.includes(w))) continue;
      let url = '#';
      if (j.apply_options?.length) url = j.apply_options[0].link || '#';
      else if (j.related_links?.length) url = j.related_links[0].link || '#';
      allJobs.push({
        titulo:      j.title || 'N/A',
        empresa:     j.company_name || 'Confidencial',
        ubicacion:   j.location || 'Chile',
        descripcion: (j.description||'').substring(0,500).replace(/\\n/g,' '),
        url,
        publicado:   j.detected_extensions?.posted_at || 'Reciente',
        fuente:      j.apply_options?.[0]?.title || 'Google Jobs'
      });
    }
  }
}

allJobs.sort((a,b) => b.publicado.localeCompare(a.publicado));

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
// OPENAI — n8n connect
// =====================================================================
const openaiLLM = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'OpenAI - n8n connect',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' },
      responsesApiEnabled: false,
      options: { maxTokens: 8000, temperature: 0.2 }
    },
    credentials: {
      openAiApi: { id: 'cjetZrgB2dd22xkH', name: 'n8n free OpenAI API credits' }
    }
  }
});

// =====================================================================
// AI AGENT — ranking por match % + email HTML
// =====================================================================
const rankingAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente Ranking y Email',
    parameters: {
      promptType: 'define',
      text: expr(`Fecha: {{ $json.fecha }} | Total ofertas: {{ $json.total }}

PERFIL CANDIDATO:
${CV_PROFILE}

OFERTAS (JSON):
{{ JSON.stringify($json.jobs) }}

TAREA:
Calcula MATCH % por oferta (0-100):
- Nivel jerárquico (40%): CEO/Gerente General/COO/VP/Director = alto. Jefe = medio. Resto = bajo.
- Industria (30%): CPG/Minería/Retail/Aerolíneas/Automotriz = conocida (alto). Tech/Salud/Financiero = nueva (medio).
- Competencias (30%): transformación, operaciones, supply chain, P&L, M&A, analytics = alto.

Filtra match < 60%.

EMAIL HTML — diseño profesional:
- Fondo #f4f6f9. Header gradiente #1e3a5f→#2d5986, título "🎯 Radar Ejecutivo — [fecha]", subtítulo "[N] oportunidades de {{ $json.total }} analizadas"
- Sección "✅ POSTULAR URGENTE" (≥90%) fondo #e8f5e9, borde verde
- Sección "👍 MUY RECOMENDABLE" (75-89%) fondo #e3f2fd, borde azul
- Sección "💡 CONSIDERAR" (60-74%) fondo #fff8e1, borde amarillo
- Omitir secciones vacías
- Por oferta: badge % | título negrita | empresa | ubicación | fuente | fecha | descripción 3 líneas | "⭐ Por qué calza:" 1 línea específica | botón verde "Ver Oferta →" con href
- Ordenar mayor→menor match dentro de cada sección
- Footer: "Radar generado automáticamente · JSearch + SerpAPI · bbrunetm@gmail.com"
- Max-width 700px, responsivo, Arial

DEVUELVE SOLO EL HTML COMPLETO.`),
      options: {
        systemMessage: 'Headhunter ejecutivo experto en Chile. Solo procesa datos recibidos y genera HTML. Sin búsquedas web.',
        maxIterations: 3,
        returnIntermediateSteps: false
      }
    },
    subnodes: { model: openaiLLM }
  }
});

// =====================================================================
// GMAIL
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
      subject: expr("🎯 Radar Ejecutivo {{ $now.format('EEEE d/M/yyyy') }} — JSearch + SerpAPI"),
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
// COMPOSICIÓN PARALELA
// =====================================================================
export default workflow('radar-ejecutivo-v5', 'Radar Ejecutivo Diario v5 - Paralelo')
  .add(scheduleTrigger)
  .to(jsearchQueries.to(jsearchHttp).to(mergeApis.input(0)))
  .add(scheduleTrigger)
  .to(serpApiQueries.to(serpApiHttp).to(mergeApis.input(1)))
  .add(mergeApis)
  .to(aggregateJobs)
  .to(rankingAgent)
  .to(sendEmail);
