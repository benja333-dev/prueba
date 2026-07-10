import { workflow, trigger, node, languageModel, expr } from '@n8n/workflow-sdk';

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

// 2. OpenAI LLM with built-in web search (no SerpAPI needed)
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
        maxTokens: 4096
      }
    },
    credentials: {
      openAiApi: { id: 'cjetZrgB2dd22xkH', name: 'n8n free OpenAI API credits' }
    }
  }
});

// 3. AI Agent - searches for executive jobs and generates HTML email
const jobHunterAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agente Buscador de Empleos Ejecutivos',
    parameters: {
      promptType: 'define',
      text: expr("Hoy es {{ $now.format('EEEE d MMMM yyyy') }}.\n\nTu mision:\n1. Busca en LinkedIn Jobs Chile posiciones ejecutivas con estos titulos: Director, VP, Vice President, CEO, Gerente General, Gerente. Excluye posiciones junior, practicante o internship.\n2. Busca tambien en Google Jobs Chile y otras plataformas de empleo chilenas las mismas posiciones.\n3. Compila todos los resultados y devuelve UNICAMENTE el codigo HTML completo de un email profesional.\n\nEl email HTML debe:\n- Tener diseno profesional: fondo #f4f6f9, header con gradiente azul oscuro (#1e3a5f a #2d5986), fuente Arial/sans-serif\n- Mostrar la fecha de hoy en el header con el texto 'Oportunidades Ejecutivas del Dia'\n- Mostrar el total de oportunidades encontradas en un banner destacado\n- Para cada posicion: titulo en negrita (azul #1e3a5f), empresa en gris, ubicacion, descripcion de 2-3 lineas\n- Boton verde (#27ae60) 'Ver Oferta Completa' con enlace href clickeable a cada job listing\n- Agrupa las posiciones: primero CEO/Gerente General, luego Director, luego VP/Vice President, luego Gerente\n- Footer con texto: 'Boletin generado automaticamente por tu asistente de busqueda ejecutiva'\n- Diseno responsivo para movil y desktop con max-width 700px\n\nDevuelve UNICAMENTE el codigo HTML completo sin texto adicional ni bloques markdown."),
      options: {
        systemMessage: "Eres un asistente ejecutivo especializado en busqueda de empleo de alto nivel en Chile. Usa la herramienta de busqueda web para encontrar las ofertas mas recientes publicadas en linkedin.com/jobs y plataformas chilenas de empleo (laborum.com, trabajando.com, bumeran.cl, indeed.cl). Busca posiciones con titulos: Director, VP, Vice President, CEO, Gerente General, Gerente. Siempre incluye los enlaces directos a las ofertas. Genera emails HTML completos, bien estructurados y visualmente atractivos en espanol.",
        maxIterations: 15,
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
    name: 'Enviar Email con Oportunidades',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: 'bbrunetm@gmail.com',
      subject: expr("[EMPLEOS] Oportunidades Ejecutivas - {{ $now.format('EEEE d/M/yyyy') }}"),
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
export default workflow('exec-job-hunt', 'Daily Executive Job Hunt - 7AM')
  .add(scheduleTrigger)
  .to(jobHunterAgent)
  .to(sendEmail);
