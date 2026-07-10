import { workflow, trigger, node, languageModel, expr } from '@n8n/workflow-sdk';

// =====================================================================
// PERFIL BENJAMIN BRUNET
// =====================================================================
const CV_PROFILE = `Associate Partner McKinsey 9 años. MBA IE Business School Madrid. Ingeniero Civil Industrial UAI.
Expertise: transformación operacional y comercial, P&L, procurement, supply chain, S&OP, M&A, due diligence, analytics avanzado, GenAI, Lean Manufacturing.
Impacto demostrado: +$500M EBITDA acumulado en proyectos individuales de $10M-$120M.
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
// 2. CODE — define 3 búsquedas (respeta límite SerpAPI free: 100/día)
// =====================================================================
const defineQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Definir Busquedas',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [
  { json: { q: "CEO OR Gerente General OR COO Chile", label: "C-Suite" } },
  { json: { q: "Director OR Vicepresidente OR VP Operaciones OR Comercial Chile", label: "Director VP" } },
  { json: { q: "Gerente Operaciones OR Gerente Comercial OR Country Manager Chile", label: "Gerente" } }
];`
    }
  }
});

// =====================================================================
// 3. HTTP REQUEST — SerpAPI Google Jobs
// Registro gratis: https://serpapi.com (100 búsquedas/día gratis)
// Agrega tu API key en Settings > Environment Variables: SERPAPI_KEY
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
          { name: 'chips',    value: 'date_posted:today' },
          { name: 'api_key',  value: expr('{{ $env.SERPAPI_KEY }}') }
        ]
      }
    }
  }
});

// =====================================================================
// 4. CODE — agrega, deduplica y estructura resultados
// =====================================================================
const aggregateJobs = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Agregar y Deduplicar Jobs',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
const allJobs = [];
const seen = new Set();

const juniorWords = ['analyst','analista','practicante','intern','trainee','vendedor','asesor','ejecutivo de ventas','jefe de zona','tecnico'];

for (const item of $input.all()) {
  const jobs = item.json.jobs_results || [];
  for (const job of jobs) {
    const key = ((job.title || '') + '|' + (job.company_name || '')).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const title = (job.title || '').toLowerCase();
    if (juniorWords.some(w => title.includes(w))) continue;

    // Extraer URL de postulación
    let url = '#';
    if (job.apply_options && job.apply_options.length > 0) {
      url = job.apply_options[0].link || '#';
    } else if (job.related_links && job.related_links.length > 0) {
      url = job.related_links[0].link || '#';
    }

    allJobs.push({
      titulo:      job.title || 'N/A',
      empresa:     job.company_name || 'Confidencial',
      ubicacion:   job.location || 'Chile',
      descripcion: (job.description || '').substring(0, 500).replace(/\\n/g,' '),
      url:         url,
      publicado:   job.detected_extensions?.posted_at || 'Reciente',
      fuente:      (job.apply_options?.[0]?.title) || 'Google Jobs'
    });
  }
}

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
// 5. OPENAI LLM — usa n8n connect
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
      openAiApi: newCredential('n8n connect')
    }
  }
});

// =====================================================================
// 6. AI AGENT — rankea por match % y genera HTML
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

OFERTAS ENCONTRADAS:
{{ JSON.stringify($json.jobs) }}

INSTRUCCION:
Para cada oferta calcula MATCH % (0-100) considerando:
- Nivel jerarquico (40%): CEO/Gerente General/COO/VP/Director = alto. Jefe/Analista = bajo.
- Industria (30%): CPG/Minería/Retail/Aerolíneas/Automotriz = conocida (alto). Salud/Tech/Financiero = nueva (medio).
- Competencias (30%): transformación, operaciones, supply chain, P&L, M&A, analytics = alto. Ventas puras, IT = bajo.

Filtra todo lo que tenga match < 60%.

Genera el EMAIL HTML con este diseño:
- Fondo: #f4f6f9. Header: gradiente #1e3a5f → #2d5986, texto blanco, título "🎯 Radar Ejecutivo — [fecha]", subtítulo "[N] oportunidades analizadas para tu perfil"
- 3 secciones (solo mostrar si tienen ofertas):
  * "✅ POSTULAR URGENTE" (match ≥ 90%) — fondo #e8f5e9, borde izquierdo verde #27ae60
  * "👍 MUY RECOMENDABLE" (75–89%) — fondo #e3f2fd, borde izquierdo azul #2196f3
  * "💡 CONSIDERAR" (60–74%) — fondo #fff8e1, borde izquierdo amarillo #ffc107
- Por cada oferta:
  * Badge circular con el % (verde/azul/amarillo según sección)
  * Título en negrita azul #1e3a5f | Empresa en gris | Ubicación | Fuente | Publicado
  * Descripción (3 líneas máx)
  * "⭐ Por qué calza:" + 1 línea específica basada en el perfil
  * Botón "Ver Oferta →" con href al URL directo
- Ordenar de mayor a menor match dentro de cada sección
- Footer: "Radar generado automáticamente · bbrunetm@gmail.com · Solo roles con match ≥ 60%"
- Max-width 700px, responsivo, fuente Arial

DEVUELVE ÚNICAMENTE EL HTML COMPLETO. CERO TEXTO ADICIONAL.`),
      options: {
        systemMessage: 'Eres un headhunter ejecutivo experto en Chile. Evalúas roles C-suite y directivos con criterio riguroso. Generas emails HTML profesionales en español. No busques en internet — solo procesa los datos recibidos y genera el HTML.',
        maxIterations: 3,
        returnIntermediateSteps: false
      }
    },
    subnodes: { model: openaiLLM }
  }
});

// =====================================================================
// 7. GMAIL — envía el email
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
      subject: expr("🎯 Radar Ejecutivo {{ $now.format('EEEE d/M/yyyy') }}"),
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
export default workflow('radar-ejecutivo-v4', 'Radar Ejecutivo Diario v4 - 7AM')
  .add(scheduleTrigger)
  .to(defineQueries)
  .to(searchSerpApi)
  .to(aggregateJobs)
  .to(rankingAgent)
  .to(sendEmail);
