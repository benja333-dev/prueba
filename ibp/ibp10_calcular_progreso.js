function rows(name) { try { return $(name).all().map(i => i.json).filter(r => r && Object.keys(r).length > 1); } catch (e) { return []; } }
const wh = $('Webhook Status').first().json || {};
const qs = wh.query || {};
const run = String(qs.run_id || '').trim();

const ETAPAS = [
  { paso: 1, clave: 'demanda', nombre: 'Demand Planning', entrega: 'Forecast consenso por SKU-mes' },
  { paso: 2, clave: 'supply', nombre: 'Supply Planning', entrega: 'Plan de produccion factible e inventarios' },
  { paso: 3, clave: 'scheduling', nombre: 'Scheduling Plantas', entrega: 'Programa por linea con campanas y changeovers' },
  { paso: 4, clave: 'procurement', nombre: 'Procurement', entrega: 'Plan de compras MRP con lotes y fechas' },
  { paso: 5, clave: 'finanzas', nombre: 'Finanzas', entrega: 'P&L proyectado y venta perdida valorizada' },
  { paso: 6, clave: 'ejecutiva', nombre: 'Conciliacion Ejecutiva', entrega: 'Plan conciliado, decisiones y alertas del comite' }
];

const minutas = rows('Leer Minutas Run').filter(r => r.run_id === run);
const porPaso = {};
minutas.forEach(m => { porPaso[Number(m.paso)] = m; });

const etapas = ETAPAS.map(e => {
  const m = porPaso[e.paso];
  if (!m) return { paso: e.paso, clave: e.clave, nombre: e.nombre, entrega: e.entrega, estado: 'pendiente' };
  let dec = [];
  try { dec = JSON.parse(m.decisiones_json || '[]'); } catch (err) { dec = []; }
  return {
    paso: e.paso,
    clave: e.clave,
    nombre: e.nombre,
    entrega: e.entrega,
    estado: 'listo',
    reunion: m.reunion || '',
    logica: String(m.logica || '').split('|').map(x => x.trim()).filter(Boolean),
    decisiones: dec,
    conclusiones: String(m.conclusiones || '').split('|').map(x => x.trim()).filter(Boolean),
    riesgos: String(m.riesgos || '').split('|').map(x => x.trim()).filter(Boolean),
    handoff: m.handoff || ''
  };
});

const completados = etapas.filter(e => e.estado === 'listo').length;
const finalizado = completados >= ETAPAS.length;
if (!finalizado) {
  const siguiente = etapas.find(e => e.estado === 'pendiente');
  if (siguiente) siguiente.estado = 'trabajando';
}
const nDecisiones = etapas.reduce((a, e) => a + ((e.decisiones || []).length), 0);

return [{ json: {
  ok: true,
  run_id: run,
  pasos_completados: completados,
  total_pasos: ETAPAS.length,
  progreso_pct: Math.round(completados / ETAPAS.length * 100),
  finalizado: finalizado,
  decisiones_acumuladas: nDecisiones,
  etapas: etapas,
  ts: new Date().toISOString()
} }];
