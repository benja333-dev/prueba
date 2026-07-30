const ctx = $('Construir Contexto Analitico').first().json || {};
const item = $input.first().json || {};
let texto = '';
if (typeof item.output === 'string') texto = item.output;
else if (item.output && typeof item.output === 'object') texto = JSON.stringify(item.output);
else if (typeof item.text === 'string') texto = item.text;
else if (typeof item.response === 'string') texto = item.response;
texto = String(texto || '').trim();
let ok = true;
if (item.error || !texto) {
  ok = false;
  const detalle = item.error ? String(item.error.message || item.error) : 'respuesta vacia del modelo';
  texto = 'No pude responder esta consulta (' + detalle + '). Intenta reformular la pregunta o vuelve a enviarla en unos segundos.';
}
return [{ json: {
  ok: ok,
  respuesta: texto,
  run_id: ctx.run_id || '',
  session_id: ctx.session_id || 'anon',
  runs_disponibles: ctx.runs_disponibles || [],
  tamano_contexto: ctx.tamano_contexto || 0,
  ts: new Date().toISOString()
} }];

