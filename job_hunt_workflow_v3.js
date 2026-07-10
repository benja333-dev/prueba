import { workflow, trigger, node, languageModel, newCredential, expr } from '@n8n/workflow-sdk';

// =====================================================================
// PERFIL DE BENJAMIN BRUNET (embebido para match %)
// =====================================================================
const CV_PROFILE = `PERFIL: Associate Partner McKinsey 9 años. MBA IE Business School Madrid. Ingeniero Civil Industrial UAI.
FORTALEZAS: Transformación operacional y comercial, P&L, procurement, supply chain, S&OP, M&A, due diligence, analytics avanzado, GenAI, Lean Manufacturing.
IMPACTO: +$500M EBITDA acumulado en proyectos. Proyectos individuales de $10M-$120M en ahorro/EBITDA.
INDUSTRIAS: CPG (bebidas, café, cerveza, aceites), Minería (cobre, explosivos), Aerolíneas/Logística, Retail, Automotriz.
EXPERIENCIA INTERNACIONAL: Chile, México, Guatemala, Colombia, Honduras, Ecuador, España.
IDIOMAS: Español nativo, Inglés fluido.
ROLES IDEALES: CEO, COO, Gerente General, Country Manager, VP/Director Operaciones, VP/Director Comercial, Chief Transformation Officer, Director Supply Chain, Director Estrategia.`;

// =====================================================================
// 1. SCHEDULE TRIGGER — todos los días a las 7AM
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
// 2. CODE — genera lista de búsquedas (8 queries distintos)
// =====================================================================
const defineQueries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Definir Busquedas',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
return [
  { json: { query: "CEO OR Gerente General OR COO Chile", categoria: "C-Suite" } },
  { json: { query: "Director Operaciones OR VP Operaciones OR Country Manager Chile", categoria: "Director / VP" } },
  { json: { query: "Director Comercial OR Director Supply Chain OR Director Estrategia Chile", categoria: "Director Comercial / SC" } }
];
`
    }
  }
});

// =====================================================================
// 3. HTTP REQUEST — JSearch API (agrega LinkedIn + Indeed + Glassdoor)
// Credencial requerida: HTTP Header Auth con X-RapidAPI-Key
// Registrarse gratis en: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
// =====================================================================
const searchJobs = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'JSearch - Buscar Jobs',
    parameters: {
      method: 'GET',
      url: 'https://jsearch.p.rapidapi.com/search',
      authentication: 'none',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'query', value: expr('{{ $json.query }}') },
          { name: 'page', value: '1' },
          { name: 'num_pages', value: '3' },
          { name: 'country', value: 'cl' },
          { name: 'date_posted', value: 'week' },
          { name: 'language', value: 'es' }
        ]
      },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'X-RapidAPI-Key', value: '745fc96366msh14a202f2263ec16p197990jsnb613a6a0d480' },
          { name: 'X-RapidAPI-Host', value: 'jsearch.p.rapidapi.com' }
        ]
      }
    }
  }
});

// =====================================================================
// 4. CODE — agrega y deduplica todos los resultados
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

for (const item of $input.all()) {
  const data = item.json;
  const jobs = data.data || [];

  for (const job of jobs) {
    const key = (job.job_title + '|' + job.employer_name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Filtrar roles muy junior
    const title = (job.job_title || '').toLowerCase();
    const juniorWords = ['analyst', 'analista', 'ejecutivo', 'practicante', 'intern', 'trainee', 'jefe de zona', 'vendedor', 'asesor'];
    const isJunior = juniorWords.some(w => title.includes(w));
    if (isJunior) continue;

    allJobs.push({
      titulo: job.job_title || 'N/A',
      empresa: job.employer_name || 'Confidencial',
      ubicacion: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || 'Chile',
      descripcion: (job.job_description || '').substring(0, 500).replace(/\\n/g, ' '),
      url: job.job_apply_link || job.job_google_link || '#',
      publicado: job.job_posted_at_datetime_utc ? job.job_posted_at_datetime_utc.substring(0, 10) : 'Reciente',
      fuente: job.job_publisher || 'Job Board',
      remoto: job.job_is_remote ? 'Remoto' : 'Presencial'
    });
  }
}

// Ordenar por fecha (más recientes primero)
allJobs.sort((a, b) => b.publicado.localeCompare(a.publicado));

return [{ json: { jobs: allJobs, total: allJobs.length, fecha: new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) } }];
`
    }
  }
});

// =====================================================================
// 5. OPENAI LLM — para el agente de ranking y email
// =====================================================================
const openaiLLM = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'OpenAI GPT',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' },
      responsesApiEnabled: false,
      options: {
        maxTokens: 8000,
        temperature: 0.2
      }
    },
    credentials: {
      openAiApi: { id: 'cjetZrgB2dd22xkH', name: 'n8n free OpenAI API credits' }
    }
  }
});

// =====================================================================
// 6. AI AGENT — rankea por match % y genera email HTML
// =====================================================================
const rankingAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente Ranking y Email',
    parameters: {
      promptType: 'define',
      text: expr(`Hoy es {{ $json.fecha }}.

PERFIL DEL CANDIDATO:
${CV_PROFILE}

TOTAL DE OFERTAS ENCONTRADAS: {{ $json.total }}

LISTA DE OFERTAS (JSON):
{{ JSON.stringify($json.jobs) }}

TAREA:
Para cada oferta calcula un MATCH % considerando:
- Nivel jerarquico: ¿Es C-suite, Director, VP, Gerente? (peso 40%)
- Industria: ¿Es CPG, Mineria, Retail, Aerolineas, Automotriz u otra? Si conocida = mas match (peso 30%)
- Competencias: ¿Requiere transformacion, operaciones, supply chain, P&L, M&A, analytics? (peso 30%)

CRITERIOS:
- 90-100%: Nivel correcto + industria conocida + competencias exactas = POSTULAR URGENTE
- 75-89%: Nivel correcto + industria nueva o competencias parciales = MUY RECOMENDABLE
- 60-74%: Nivel correcto pero industria o competencias diferentes = CONSIDERAR
- Menos 60%: NO incluir

Genera el EMAIL HTML completo con este diseño:
- Header: gradiente azul (#1e3a5f a #2d5986), titulo "Radar Ejecutivo - [fecha]", subtitulo "{{ $json.total }} oportunidades analizadas"
- Seccion "POSTULAR URGENTE" (match >90%) con fondo verde claro #e8f5e9
- Seccion "MUY RECOMENDABLE" (match 75-89%) con fondo azul claro #e3f2fd
- Seccion "CONSIDERAR" (match 60-74%) con fondo gris claro #f5f5f5
- Para cada oferta dentro de su seccion:
  * Badge circular con el % (verde si >90%, azul si 75-89%, gris si <75%)
  * Titulo en negrita azul, empresa, ubicacion, fuente (LinkedIn/Indeed/etc), fecha publicacion
  * Descripcion del rol (3-4 lineas)
  * "Por que calza": 1-2 lineas especificas mencionando skills o industria del candidato
  * Boton "Ver Oferta" verde con href al URL
- Si no hay ofertas en alguna seccion, omitir esa seccion
- Footer: "Radar generado automaticamente | bbrunetm@gmail.com"
- Responsivo, max-width 700px, fuente Arial, padding generoso

DEVUELVE UNICAMENTE EL HTML COMPLETO. SIN TEXTO ADICIONAL.`),
      options: {
        systemMessage: 'Eres un headhunter ejecutivo de elite. Evaluas oportunidades laborales con criterio experto y generas emails HTML profesionales. No tienes acceso a herramientas de busqueda - solo procesas los datos que recibes y generas HTML.',
        maxIterations: 3,
        returnIntermediateSteps: false
      }
    },
    subnodes: {
      model: openaiLLM
    }
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
      subject: expr("[RADAR EJECUTIVO] {{ $now.format('EEEE d/M/yyyy') }} - Oportunidades rankeadas por match"),
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
// COMPOSICION DEL WORKFLOW
// =====================================================================
export default workflow('radar-ejecutivo-v3', 'Radar Ejecutivo Diario v3 - 7AM')
  .add(scheduleTrigger)
  .to(defineQueries)
  .to(searchJobs)
  .to(aggregateJobs)
  .to(rankingAgent)
  .to(sendEmail);
