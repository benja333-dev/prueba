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
// 2. CODE — define todas las queries (12 total, una por rol)
// SerpAPI free: 100/día → 12 queries = 12% del límite diario
// =====================================================================
const defineQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Definir Todas las Queries',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [
  // --- Google Jobs (indexa LinkedIn + Laborum + Indeed + Bumeran) ---
  { json: { engine: "google_jobs", q: "CEO Chile",                        rol: "CEO" } },
  { json: { engine: "google_jobs", q: "Gerente General Chile",            rol: "Gerente General" } },
  { json: { engine: "google_jobs", q: "Director General Chile",           rol: "Director General" } },
  { json: { engine: "google_jobs", q: "Director Operaciones Chile",       rol: "Director Operaciones" } },
  { json: { engine: "google_jobs", q: "Director Comercial Chile",         rol: "Director Comercial" } },
  { json: { engine: "google_jobs", q: "Gerente Operaciones Chile",        rol: "Gerente Operaciones" } },
  { json: { engine: "google_jobs", q: "Gerente Comercial Chile",          rol: "Gerente Comercial" } },
  { json: { engine: "google_jobs", q: "VP Vicepresidente Chile",          rol: "VP" } },
  { json: { engine: "google_jobs", q: "Country Manager COO Chile",        rol: "Country Manager" } },
  // --- LinkedIn directo (site:linkedin.com/jobs) ---
  { json: { engine: "google", q: "site:linkedin.com/jobs CEO OR Gerente General Chile",          rol: "LinkedIn C-Suite" } },
  { json: { engine: "google", q: "site:linkedin.com/jobs Director Operaciones OR Director Comercial Chile", rol: "LinkedIn Director" } },
  { json: { engine: "google", q: "site:linkedin.com/jobs Gerente Operaciones OR Gerente Comercial Chile",   rol: "LinkedIn Gerente" } },
  { json: { engine: "google", q: "site:linkedin.com/jobs Vicepresidente OR VP Chile",            rol: "LinkedIn VP" } },
  { json: { engine: "google", q: "site:linkedin.com/jobs Director Supply Chain OR Director Estrategia Chile", rol: "LinkedIn Director SC" } }
];`
    }
  }
});

// =====================================================================
// 3. HTTP REQUEST — SerpAPI Google Jobs
// Google Jobs indexa LinkedIn, Laborum, Bumeran, Indeed, Trabajando
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
          { name: 'engine',   value: expr('{{ $json.engine }}') },
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
// 5. CODE — agrega y deduplica todos los resultados del loop
// Recibe los 12 responses acumulados al terminar el loop
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
const juniorWords = ['analyst','analista','practicante','intern','trainee','vendedor','asesor','ejecutivo de ventas','jefe de zona','tecnico','cajero','operario'];

for (const item of $input.all()) {
  const d = item.json;

  // --- Formato Google Jobs (engine: google_jobs) ---
  if (Array.isArray(d.jobs_results)) {
    for (const j of d.jobs_results) {
      const key = ((j.title||'')+'|'+(j.company_name||'')).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (juniorWords.some(w => (j.title||'').toLowerCase().includes(w))) continue;
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

  // --- Formato LinkedIn directo (engine: google, site:linkedin.com/jobs) ---
  if (Array.isArray(d.organic_results)) {
    for (const r of d.organic_results) {
      if (!(r.link||'').includes('linkedin.com')) continue;
      // Extraer titulo y empresa del título de la página LinkedIn
      const rawTitle = (r.title||'').replace(/\\s*[-–|]\\s*LinkedIn.*$/i,'').trim();
      const key = rawTitle.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (juniorWords.some(w => rawTitle.toLowerCase().includes(w))) continue;
      // snippet suele tener "Empresa · Ubicación · hace X días · descripción"
      const snippet = r.snippet || '';
      const parts = snippet.split('·');
      const empresa = parts[0]?.trim() || 'Confidencial';
      const ubicacion = parts[1]?.trim() || 'Chile';
      allJobs.push({
        titulo:      rawTitle,
        empresa,
        ubicacion,
        descripcion: snippet.substring(0,400),
        url:         r.link || '#',
        publicado:   parts[2]?.trim() || 'Reciente',
        fuente:      'LinkedIn'
      });
    }
  }
}

allJobs.sort((a, b) => b.publicado.localeCompare(a.publicado));

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
// 6. OPENAI LLM — n8n connect
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
// 7. AI AGENT — rankea por match % y genera HTML
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
- Nivel jerárquico (40%): CEO/Gerente General/COO/VP/Director = alto. Jefe/Supervisor = medio. Resto = bajo.
- Industria (30%): CPG/Minería/Retail/Aerolíneas/Automotriz = conocida (alto). Tech/Salud/Financiero = nueva (medio).
- Competencias (30%): transformación, operaciones, supply chain, P&L, M&A, analytics = alto.

Filtra match < 60%.

EMAIL HTML profesional:
- Fondo #f4f6f9. Header gradiente #1e3a5f→#2d5986, título "🎯 Radar Ejecutivo — [fecha]"
- Subtítulo "[N roles seleccionados de {{ $json.total }} analizados]"
- Sección "✅ POSTULAR URGENTE" (≥90%) fondo verde claro #e8f5e9
- Sección "👍 MUY RECOMENDABLE" (75-89%) fondo azul claro #e3f2fd
- Sección "💡 CONSIDERAR" (60-74%) fondo amarillo claro #fff8e1
- Omitir secciones vacías
- Por oferta: badge % | título negrita | empresa | ubicación | fuente | fecha publicación | descripción 3 líneas | "⭐ Por qué calza:" 1 línea específica | botón verde "Ver Oferta →" con href
- Ordenar mayor→menor match dentro de cada sección
- Footer: "Radar generado automáticamente · 12 búsquedas · bbrunetm@gmail.com"
- Max-width 700px, responsivo, Arial

DEVUELVE SOLO EL HTML COMPLETO.`),
      options: {
        systemMessage: 'Headhunter ejecutivo experto en Chile. Evalúas roles C-suite y directivos. Solo procesas datos recibidos y generas HTML. Sin búsquedas web.',
        maxIterations: 3,
        returnIntermediateSteps: false
      }
    },
    subnodes: { model: openaiLLM }
  }
});

// =====================================================================
// 8. GMAIL
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
// WORKFLOW: loop secuencial → acumula → envía
// =====================================================================
export default workflow('radar-ejecutivo-v6', 'Radar Ejecutivo v6 - 14 Queries')
  .add(scheduleTrigger)
  .to(defineQueries)
  .to(searchSerpApi)
  .to(aggregateJobs)
  .to(rankingAgent)
  .to(sendEmail);
