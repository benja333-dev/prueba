import { workflow, trigger, node, languageModel, expr } from '@n8n/workflow-sdk';

// PERFIL DE BENJAMIN BRUNET (usado para calcular match %)
const CV_PROFILE = `
PERFIL EJECUTIVO - BENJAMIN BRUNET
===================================
CARGO ACTUAL: Associate Partner & Orphoz Latam Director en McKinsey & Company (Ene 2024 - presente)
TRAYECTORIA McKINSEY: 9 años (Associate → Associate Partner)
EDUCACION: MBA Internacional IE Business School Madrid (2015) + Ingeniero Civil Industrial UAI (2009, egresó 1 año antes)

COMPETENCIAS CLAVE:
- Transformación holística de negocios (operacional + comercial)
- Excelencia operacional: procurement, manufactura, logística, supply chain, S&OP
- Estrategia comercial: pricing, efectividad de ventas, portfolio
- Gestión de P&L / mejora de EBITDA (impactos de $10M–$120M por proyecto, total +$500M acumulado)
- Liderazgo de equipos y gestión de talento (creó oficina Guatemala de 0, crecimiento 100% headcount)
- M&A y due diligence (comercial y operacional)
- Analytics avanzado y GenAI (Berkeley Haas Certificate)
- Lean Manufacturing

INDUSTRIAS CON EXPERIENCIA PROFUNDA:
- CPG / consumo masivo (bebidas, café, cerveza, aceites)
- Minería (cobre, explosivos)
- Aerolíneas / logística / cargo
- Retail (operaciones y supply chain)
- Automotriz (Lean, after sales)

EXPERIENCIA INTERNACIONAL: Chile, México, Guatemala, Colombia, Honduras, Ecuador, España

IDIOMAS: Español (nativo), Inglés (fluido)

ROLES IDEALES (por orden de fit):
1. CEO / Gerente General / Country Manager
2. COO / VP Operaciones / Director de Operaciones
3. Chief Transformation Officer / Director de Transformación
4. VP Comercial / Director Comercial
5. VP Supply Chain / Director Supply Chain
6. Director de Estrategia / VP Estrategia
7. VP / Director en áreas de: manufactura, procurement, logística
`;

// 1. Schedule Trigger - every day at 7am
const scheduleTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Todos los dias a las 7AM',
    parameters: {
      rule: {
        interval: [
          {
            field: 'days',
            daysInterval: 1,
            triggerAtHour: 7,
            triggerAtMinute: 0
          }
        ]
      }
    }
  }
});

// 2. OpenAI LLM with built-in web search (high context for exhaustive searching)
const openaiLLM = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'OpenAI con Web Search',
    parameters: {
      model: { __rl: true, mode: 'list', value: 'gpt-4o-mini', cachedResultName: 'gpt-4o-mini' },
      responsesApiEnabled: true,
      builtInTools: {
        webSearch: {
          searchContextSize: 'high',
          country: 'cl',
          city: 'Santiago'
        }
      },
      options: {
        maxTokens: 8000
      }
    },
    credentials: {
      openAiApi: { id: 'cjetZrgB2dd22xkH', name: 'n8n free OpenAI API credits' }
    }
  }
});

// 3. AI Agent - exhaustive job search with CV matching
const jobHunterAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente Buscador Ejecutivo con Match CV',
    parameters: {
      promptType: 'define',
      text: expr(`Hoy es {{ $now.format('EEEE d MMMM yyyy') }}.

PERFIL DEL CANDIDATO:
${CV_PROFILE}

TU MISION - BUSQUEDA EXHAUSTIVA:
Debes hacer MULTIPLES busquedas en paralelo para encontrar el maximo de oportunidades ejecutivas en Chile. Busca en estas plataformas:

1. LinkedIn Jobs Chile: site:linkedin.com/jobs - busca CEO, Gerente General, COO, Director Operaciones, VP Operaciones, Director Comercial, Country Manager, Director Transformacion, Director Supply Chain, Director Estrategia
2. Laborum Chile: site:laborum.com - mismos titulos
3. Bumeran Chile: site:bumeran.cl - mismos titulos
4. Trabajando.com Chile: site:trabajando.com - mismos titulos
5. Indeed Chile: site:indeed.com/cl o site:cl.indeed.com - mismos titulos
6. Acwork Chile: site:acwork.com - mismos titulos
7. Glassdoor Chile: site:glassdoor.com - mismos titulos
8. Busca tambien "confidencial" + "gerente general" OR "CEO" Chile para roles anonimos de headhunters

IMPORTANTE: Busca roles en TODAS las industrias (no solo marketing): operaciones, supply chain, retail, consumo masivo, mineria, manufactura, logistica, aereolineas, transformacion, estrategia, finanzas corporativas, etc.

Para CADA oportunidad encontrada, debes:
1. Extraer: titulo, empresa (o "Confidencial"), industria, ubicacion, descripcion breve del rol
2. Obtener el URL directo a la oferta
3. Calcular un PORCENTAJE DE MATCH (0-100%) comparando el rol con el perfil del candidato, considerando:
   - Nivel jerarquico del rol vs experiencia del candidato
   - Industria del rol vs industrias donde tiene experiencia
   - Competencias requeridas vs competencias del candidato
   - Si el rol es en Chile o Latam (el candidato tiene experiencia regional)

CRITERIOS DE MATCH:
- 90-100%: Rol perfecto - mismo nivel jerarquico, industria conocida, competencias exactas
- 70-89%: Muy buen match - nivel correcto, industria nueva pero transferible, competencias similares
- 50-69%: Match moderado - puede aplicar pero hay brechas (industria muy diferente o nivel algo distinto)
- Menos de 50%: No incluir en el email (filtrar)

FORMATO DEL EMAIL HTML QUE DEBES GENERAR:
- Header: gradiente azul oscuro (#1e3a5f a #2d5986), titulo "Radar Ejecutivo - [fecha]"
- Banner estadisticas: total de oportunidades encontradas, distribucion por nivel
- Ordenar oportunidades de MAYOR a MENOR match %
- Para cada oportunidad mostrar:
  * Badge con % de match (verde >85%, amarillo 70-84%)
  * Titulo del cargo (negrita, azul #1e3a5f)
  * Empresa / Confidencial
  * Industria y ubicacion
  * Descripcion del rol (3-4 lineas)
  * Por que calza con tu perfil (1-2 lineas especificas)
  * Boton verde "Ver Oferta" con link directo
- Separador visual entre grupos: "MATCH EXCELENTE (>85%)" y "BUEN MATCH (70-84%)"
- Footer: "Radar generado automaticamente basado en tu perfil McKinsey"
- Diseno responsivo, max-width 700px, fuente Arial

DEVUELVE UNICAMENTE EL CODIGO HTML COMPLETO SIN TEXTO ADICIONAL NI MARKDOWN.`),
      options: {
        systemMessage: `Eres un headhunter ejecutivo de elite especializado en posiciones C-Suite y directivas en Chile. Tienes acceso a busqueda web. Tu trabajo es encontrar el MAXIMO numero de oportunidades relevantes buscando exhaustivamente en multiples plataformas. Haz al menos 8-10 busquedas diferentes variando plataformas y titulos. El candidato tiene un perfil McKinsey senior muy valioso - busca roles a su altura (CEO, COO, VP, Director, Gerente General). Filtra roles menores al nivel de Gerente/Director. Siempre incluye links directos. Se muy especifico en el razonamiento del match %.`,
        maxIterations: 20,
        returnIntermediateSteps: false
      }
    },
    subnodes: {
      model: openaiLLM
    }
  }
});

// 4. Gmail - send the email
const sendEmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Enviar Radar Ejecutivo',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: 'bbrunetm@gmail.com',
      subject: expr("[RADAR EJECUTIVO] Oportunidades del {{ $now.format('EEEE d/M/yyyy') }}"),
      emailType: 'html',
      message: expr('{{ $json.output }}'),
      options: {
        appendAttribution: false
      }
    },
    credentials: {
      gmailOAuth2: { id: 'qZUnlDLFotZpwtDv', name: 'Gmail OAuth2 API' }
    }
  }
});

// Compose workflow
export default workflow('exec-job-hunt-v2', 'Radar Ejecutivo Diario - 7AM')
  .add(scheduleTrigger)
  .to(jobHunterAgent)
  .to(sendEmail);
