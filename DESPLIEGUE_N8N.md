# Runbook: desplegar el Boletín Empresarial Chile en n8n vía API

> Documento de traspaso para la sesión de Claude Code que ejecute el despliegue.
> El workflow a desplegar es `noticias_empresariales_chile.json` (este repo, esta rama).
> **Ninguna clave va en este repo.** Benjamín pega las claves en el chat de la sesión.

## Contexto

- Instancia n8n: `https://n8n-production-121a.up.railway.app` (self-hosted en Railway).
- El usuario (Benjamín) entrega por chat: API key de n8n, `TAVILY_API_KEY`, `RAPIDAPI_KEY` (JSearch). Opcionales: `SERPAPI_KEY`, `APIFY_TOKEN`.
- Credenciales que ya existen en esa instancia n8n (IDs tomados de `susi_fixed.json`):
  - Gemini `googlePalmApi`: id `InzYRDhfDgJFmwlQ`
  - Gmail `gmailOAuth2`: id `GIlOgk58EyoAXQJU`
- El workflow tiene 10 ramas de fuentes en paralelo con `onError: continueRegularOutput`: si falta una clave, esa rama falla y el resto sigue. Desplegar aunque falten claves opcionales.

## Pasos

1. **Conectividad** (header `X-N8N-API-KEY` en todas las llamadas API):
   `GET {url}/api/v1/workflows?limit=1` → debe responder 200.

2. **Verificar credenciales Gemini/Gmail**: listar workflows (`GET /api/v1/workflows`) y buscar en el workflow de Susi los IDs de credenciales. Si difieren de los de arriba, corregirlos en el payload.

3. **Mecanismo de claves**:
   - Probar `GET /api/v1/variables`. Si responde 200 (licencia con Variables): crear cada clave vía `POST /api/v1/variables` con `{"key":"TAVILY_API_KEY","value":"..."}` y reemplazar `$env.` por `$vars.` en el JSON del workflow.
   - Si Variables no está disponible (402/403/404): **inlinear las claves** en los parámetros de los nodos del payload (solo en el payload que se sube por API; el JSON del repo se mantiene con `$env.*`).
   - Nota Railway: alternativa válida es que Benjamín agregue las claves como variables de entorno del servicio en Railway (Service → Variables) y reiniciar; en ese caso `$env.*` funciona tal cual.

4. **Preparar payload** desde `noticias_empresariales_chile.json`:
   - Dejar solo: `name`, `nodes`, `connections`, `settings` (la API pública rechaza `id`, `versionId`, `tags`, `pinData`, `staticData`, `triggerCount`, `active`, `meta`).
   - **Agregar nodo Webhook de prueba**: `n8n-nodes-base.webhook` (typeVersion 2), `httpMethod: POST`, `path` aleatorio (ej. `test-boletin-<uuid>`), conectado a `Preparar Fechas` (además del Schedule Trigger).

5. **Crear**: `POST /api/v1/workflows` con el payload → guardar `id`.

6. **Activar**: `POST /api/v1/workflows/{id}/activate`.

7. **Probar end-to-end**: `POST {url}/webhook/{path}` (dispara la ejecución real).
   Revisar con `GET /api/v1/executions?workflowId={id}` y luego
   `GET /api/v1/executions/{execId}?includeData=true`:
   - salida de cada una de las 10 fuentes (cuántos ítems),
   - salida de `Consolidar Fuentes` (conteos por categoría),
   - errores de auth (clave mala) o de esquema.

8. **Ajustes esperables** (corregir vía `PUT /api/v1/workflows/{id}`):
   - Esquema real del actor Apify (`bebity~linkedin-jobs-scraper` asumido; ajustar mapeo en el Code node `Consolidar Fuentes` y/o el body del nodo `Apify LinkedIn Jobs`).
   - Formato de `jsonBody`/expresiones si el agente no recibe datos.
   - IDs de credenciales Gemini/Gmail si difieren.

9. **Confirmación**: pedir a Benjamín que confirme que llegó el email a bbrunetm@gmail.com con las 4 secciones (Chile / movimientos / internacional / empleos con % match).

10. **Limpieza**:
    - Quitar el nodo Webhook de prueba (`PUT` final) o dejarlo documentado.
    - Confirmar `active: true` y cron `0 7 * * *`.
    - Reflejar en el repo la versión final del JSON **sin claves** (mantener `$env.*`/`$vars.*`), commit y push a la rama designada.

## Criterio de éxito

- Ejecución vía webhook en estado `success`.
- `Consolidar Fuentes` con conteos > 0 en al menos: noticias_chile, noticias_internacionales y empleos.
- Email recibido y confirmado por Benjamín.
- Workflow activo con el schedule diario 7AM.
