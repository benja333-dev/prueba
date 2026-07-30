function rows(name) { try { return $(name).all().map(i => i.json).filter(r => r && Object.keys(r).length > 1); } catch (e) { return []; } }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function r1(v) { return Math.round(num(v) * 10) / 10; }
function r0(v) { return Math.round(num(v)); }
function sum(arr, k) { return arr.reduce((a, r) => a + num(r[k]), 0); }
function desv(a) {
  if (a.length < 2) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
}
function prom(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

const wh = $('Webhook Chat').first().json || {};
const body = wh.body || {};
const qs = wh.query || {};
const pregunta = String(body.pregunta || body.question || body.chatInput || qs.pregunta || '').slice(0, 3000).trim();
const sessionId = String(body.session_id || qs.session_id || 'anon').slice(0, 120);
const runPedido = String(body.run_id || qs.run_id || '').trim();

const skus = rows('Leer SKUs').filter(r => r.sku_id);
const hist = rows('Leer Demanda Historica').filter(r => r.sku_id);
const fcAll = rows('Leer Forecast').filter(r => r.run_id);
const planAll = rows('Leer Plan Produccion').filter(r => r.run_id);
const schedAll = rows('Leer Schedule').filter(r => r.run_id);
const comprasAll = rows('Leer Compras').filter(r => r.run_id);
const plAll = rows('Leer PyL').filter(r => r.run_id);
const resAll = rows('Leer Resumen Ejecutivo').filter(r => r.run_id);
const minAll = rows('Leer Minutas').filter(r => r.run_id);
const materiales = rows('Leer Materiales').filter(r => r.material_id);
const parametros = rows('Leer Parametros').filter(r => r.clave);
const lineas = rows('Leer Lineas').filter(r => r.linea_id);
const fabricas = rows('Leer Fabricas').filter(r => r.fabrica_id);
const bom = rows('Leer BOM').filter(r => r.material_id);

const runsSet = {};
fcAll.forEach(r => { const c = String(r.createdAt || ''); if (!runsSet[r.run_id] || c > runsSet[r.run_id]) runsSet[r.run_id] = c; });
const runs = Object.keys(runsSet).sort((a, b) => String(runsSet[b]).localeCompare(String(runsSet[a])));
const run = (runPedido && runs.indexOf(runPedido) >= 0) ? runPedido : (runs[0] || '');
const F = arr => arr.filter(x => x.run_id === run);

const forecast = F(fcAll);
const plan = F(planAll);
const schedule = F(schedAll);
const compras = F(comprasAll);
const pl = F(plAll);
const resumen = F(resAll)[0] || {};
const minutas = F(minAll).sort((a, b) => num(a.paso) - num(b.paso));

const meses = [...new Set(forecast.map(r => r.mes))].sort();
const histMeses = [...new Set(hist.map(r => r.mes))].sort();
const NORMA_COBERTURA = 45;
const paramMap = {};
parametros.forEach(p => { paramMap[p.clave] = num(p.valor); });
const politicaFill = { A: 98, B: 95, C: 90 };

const skuMap = {};
skus.forEach(s => { skuMap[s.sku_id] = s; });
const famDe = id => (skuMap[id] || {}).familia || 'SIN-FAMILIA';

const histPorSku = {};
hist.forEach(r => { (histPorSku[r.sku_id] = histPorSku[r.sku_id] || []).push(r); });
const fcPorSku = {};
forecast.forEach(r => { (fcPorSku[r.sku_id] = fcPorSku[r.sku_id] || []).push(r); });
const planPorSku = {};
plan.forEach(r => { (planPorSku[r.sku_id] = planPorSku[r.sku_id] || []).push(r); });

const porSku = [];
skus.forEach(s => {
  const h = (histPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const f = (fcPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const p = (planPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const hy = h.map(x => num(x.unidades));
  const hy12 = hy.slice(-12);
  const promHist = prom(hy12);
  const sdHist = desv(hy12);
  const fcCons = sum(f, 'forecast_consenso');
  const fcEst = sum(f, 'forecast_estadistico');
  const promFc = f.length ? fcCons / f.length : 0;
  const atendida = sum(p, 'demanda_atendida');
  const quiebre = sum(p, 'quiebre');
  const demTot = atendida + quiebre;
  const ss = num(s.stock_seguridad);
  const invs = p.map(x => num(x.inventario_final));
  const bajoSS = p.filter(x => num(x.inventario_final) < ss).length;
  const cobs = p.map(x => {
    const mfc = f.find(y => y.mes === x.mes);
    const d = mfc ? num(mfc.forecast_consenso) : promFc;
    return d > 0 ? (num(x.inventario_final) / d) * 30 : 999;
  });
  porSku.push({
    sku: s.sku_id,
    nombre: s.nombre,
    fam: s.familia,
    cat: s.categoria,
    abc: s.clase_abc,
    xyz: s.clase_xyz,
    precio: num(s.precio_venta),
    costo: num(s.costo_conversion),
    ss: ss,
    inv_ini: num(s.inventario_inicial),
    cap_mes: num(s.capacidad_linea_mensual),
    batch_min: num(s.batch_minimo),
    hist_prom_12m: r0(promHist),
    hist_cv_pct: promHist > 0 ? r1(sdHist / promHist * 100) : 0,
    fc_estadistico: r0(fcEst),
    fc_consenso: r0(fcCons),
    uplift_ai_pct: fcEst > 0 ? r1((fcCons / fcEst - 1) * 100) : 0,
    var_fc_vs_hist_pct: promHist > 0 ? r1((promFc / promHist - 1) * 100) : 0,
    z_fc_vs_hist: sdHist > 0 ? r1((promFc - promHist) / sdHist) : 0,
    produccion: r0(sum(p, 'produccion')),
    atendida: r0(atendida),
    quiebre: r0(quiebre),
    fill_pct: demTot > 0 ? r1(atendida / demTot * 100) : 100,
    fill_objetivo: politicaFill[s.clase_abc] || 95,
    inv_min: invs.length ? r0(Math.min.apply(null, invs)) : 0,
    inv_final: invs.length ? r0(invs[invs.length - 1]) : 0,
    cobertura_dias_min: cobs.length ? r1(Math.min.apply(null, cobs)) : 0,
    meses_bajo_ss: bajoSS,
    venta_perdida_clp: r0(quiebre * num(s.precio_venta))
  });
});

const totFcCons = sum(forecast, 'forecast_consenso');
const totFcEst = sum(forecast, 'forecast_estadistico');
const totAtendida = sum(plan, 'demanda_atendida');
const totQuiebre = sum(plan, 'quiebre');
const totProd = sum(plan, 'produccion');
const totIngresos = sum(pl, 'ingresos');
const totCogs = sum(pl, 'cogs');
const totMargen = sum(pl, 'margen_bruto');
const totVentaPerdida = sum(pl, 'venta_perdida');
const totCompras = sum(compras, 'costo_total');
const totCostoProg = sum(schedule, 'costo_clp');
const horasChg = sum(schedule.filter(r => r.tipo === 'CHANGEOVER'), 'horas');
const horasProd = sum(schedule.filter(r => r.tipo !== 'CHANGEOVER'), 'horas');
const nDecisiones = minutas.reduce((a, m) => { try { return a + JSON.parse(m.decisiones_json || '[]').length; } catch (e) { return a; } }, 0);

const porMes = meses.map(m => {
  const f = forecast.filter(r => r.mes === m);
  const p = plan.filter(r => r.mes === m);
  const l = pl.filter(r => r.mes === m);
  const s = schedule.filter(r => r.mes === m);
  const c = compras.filter(r => r.mes === m);
  const at = sum(p, 'demanda_atendida');
  const qb = sum(p, 'quiebre');
  const inv = sum(p, 'inventario_final');
  const fcm = sum(f, 'forecast_consenso');
  const ing = sum(l, 'ingresos');
  const mg = sum(l, 'margen_bruto');
  return {
    mes: m,
    fc_estadistico: r0(sum(f, 'forecast_estadistico')),
    fc_consenso: r0(fcm),
    produccion: r0(sum(p, 'produccion')),
    atendida: r0(at),
    quiebre: r0(qb),
    fill_pct: (at + qb) > 0 ? r1(at / (at + qb) * 100) : 100,
    inventario_final: r0(inv),
    cobertura_dias: fcm > 0 ? r1(inv / fcm * 30) : 0,
    ingresos: r0(ing),
    cogs: r0(sum(l, 'cogs')),
    margen_bruto: r0(mg),
    margen_pct: ing > 0 ? r1(mg / ing * 100) : 0,
    venta_perdida: r0(sum(l, 'venta_perdida')),
    horas_produccion: r1(sum(s.filter(x => x.tipo !== 'CHANGEOVER'), 'horas')),
    horas_changeover: r1(sum(s.filter(x => x.tipo === 'CHANGEOVER'), 'horas')),
    costo_programa: r0(sum(s, 'costo_clp')),
    compras_clp: r0(sum(c, 'costo_total'))
  };
});

const famsSet = [...new Set(skus.map(s => s.familia))].filter(Boolean).sort();
const porFamilia = famsSet.map(fam => {
  const sk = porSku.filter(x => x.fam === fam);
  const p = plan.filter(r => famDe(r.sku_id) === fam);
  const f = forecast.filter(r => famDe(r.sku_id) === fam);
  const l = pl.filter(r => r.familia === fam);
  const at = sum(p, 'demanda_atendida');
  const qb = sum(p, 'quiebre');
  const ing = sum(l, 'ingresos');
  const mg = sum(l, 'margen_bruto');
  const invProm = meses.length ? sum(p, 'inventario_final') / meses.length : 0;
  const fcProm = meses.length ? sum(f, 'forecast_consenso') / meses.length : 0;
  const abc = { A: 0, B: 0, C: 0 };
  sk.forEach(x => { if (abc[x.abc] != null) abc[x.abc] += 1; });
  return {
    familia: fam,
    n_skus: sk.length,
    mix_abc: abc,
    fc_estadistico: r0(sum(f, 'forecast_estadistico')),
    fc_consenso: r0(sum(f, 'forecast_consenso')),
    uplift_ai_pct: sum(f, 'forecast_estadistico') > 0 ? r1((sum(f, 'forecast_consenso') / sum(f, 'forecast_estadistico') - 1) * 100) : 0,
    produccion: r0(sum(p, 'produccion')),
    atendida: r0(at),
    quiebre: r0(qb),
    fill_pct: (at + qb) > 0 ? r1(at / (at + qb) * 100) : 100,
    inventario_prom: r0(invProm),
    cobertura_dias_prom: fcProm > 0 ? r1(invProm / fcProm * 30) : 0,
    ingresos: r0(ing),
    margen_bruto: r0(mg),
    margen_pct: ing > 0 ? r1(mg / ing * 100) : 0,
    venta_perdida: r0(sum(l, 'venta_perdida'))
  };
});

const claseAgg = { A: { at: 0, qb: 0, n: 0 }, B: { at: 0, qb: 0, n: 0 }, C: { at: 0, qb: 0, n: 0 } };
porSku.forEach(x => { const c = claseAgg[x.abc]; if (c) { c.at += x.atendida; c.qb += x.quiebre; c.n += 1; } });
const porClase = Object.keys(claseAgg).map(k => {
  const c = claseAgg[k];
  const d = c.at + c.qb;
  return { clase: k, n_skus: c.n, fill_pct: d > 0 ? r1(c.at / d * 100) : 100, objetivo_pct: politicaFill[k], cumple: d > 0 ? (c.at / d * 100 >= politicaFill[k]) : true };
});

const matrizAbcXyz = {};
skus.forEach(s => { const k = String(s.clase_abc || '?') + String(s.clase_xyz || '?'); matrizAbcXyz[k] = (matrizAbcXyz[k] || 0) + 1; });

const horasProgLinea = {};
schedule.forEach(r => {
  const k = r.linea_id + '|' + r.mes;
  if (!horasProgLinea[k]) horasProgLinea[k] = { linea_id: r.linea_id, mes: r.mes, horas: 0, chg: 0, costo: 0, turnos: num(r.turnos) };
  horasProgLinea[k].horas += num(r.horas);
  horasProgLinea[k].costo += num(r.costo_clp);
  if (r.tipo === 'CHANGEOVER') horasProgLinea[k].chg += num(r.horas);
  if (num(r.turnos) > horasProgLinea[k].turnos) horasProgLinea[k].turnos = num(r.turnos);
});
const fabMap = {};
fabricas.forEach(f => { fabMap[f.fabrica_id] = f; });
const linMap = {};
lineas.forEach(l => { linMap[l.linea_id] = l; });
const capacidad = Object.keys(horasProgLinea).map(k => {
  const x = horasProgLinea[k];
  const L = linMap[x.linea_id] || {};
  const Fb = fabMap[L.fabrica_id] || {};
  const ht = num(L.horas_turno) || 8;
  const dh = num(Fb.dias_habiles_mes) || 22;
  const oee = num(L.oee_pct) ? num(L.oee_pct) / 100 : 0.7;
  const turnos = x.turnos || num(L.turnos_base) || 2;
  const disp = turnos * ht * dh * oee;
  return {
    linea: x.linea_id,
    nombre: L.nombre || '',
    fabrica: L.fabrica_id || '',
    mes: x.mes,
    turnos: turnos,
    turnos_max: num(L.turnos_max),
    oee_pct: num(L.oee_pct) || 70,
    horas_disponibles: r1(disp),
    horas_programadas: r1(x.horas),
    horas_changeover: r1(x.chg),
    utilizacion_pct: disp > 0 ? r1(x.horas / disp * 100) : 0,
    costo_clp: r0(x.costo)
  };
}).sort((a, b) => (a.mes + a.linea).localeCompare(b.mes + b.linea));

const prodPorFam = {};
plan.forEach(p => { const f = famDe(p.sku_id); prodPorFam[f] = (prodPorFam[f] || 0) + num(p.produccion); });
const reqMaterial = {};
bom.forEach(b => {
  const pf = prodPorFam[b.familia] || 0;
  reqMaterial[b.material_id] = (reqMaterial[b.material_id] || 0) + pf * num(b.cantidad_por_unidad);
});
const materialesRes = materiales.map(m => {
  const oc = compras.filter(c => c.material_id === m.material_id);
  const req = reqMaterial[m.material_id] || 0;
  const stock = num(m.stock_actual);
  return {
    material: m.material_id,
    nombre: m.nombre,
    proveedor: m.proveedor,
    lead_time_dias: num(m.lead_time_dias),
    moq: num(m.moq),
    costo_unitario: num(m.costo_unitario),
    stock_actual: r0(stock),
    requerimiento_horizonte: r0(req),
    cobertura_pct_del_req: req > 0 ? r1(stock / req * 100) : 999,
    deficit: r0(Math.max(0, req - stock)),
    n_ordenes: oc.length,
    cantidad_ordenada: r0(sum(oc, 'cantidad')),
    gasto_clp: r0(sum(oc, 'costo_total')),
    ordenes_urgentes: oc.filter(c => String(c.alerta || '').indexOf('URGENTE') === 0).length
  };
}).sort((a, b) => b.deficit - a.deficit);

const proveedorAgg = {};
compras.forEach(c => {
  if (!proveedorAgg[c.proveedor]) proveedorAgg[c.proveedor] = { proveedor: c.proveedor, gasto: 0, ordenes: 0, urgentes: 0 };
  proveedorAgg[c.proveedor].gasto += num(c.costo_total);
  proveedorAgg[c.proveedor].ordenes += 1;
  if (String(c.alerta || '').indexOf('URGENTE') === 0) proveedorAgg[c.proveedor].urgentes += 1;
});
const porProveedor = Object.keys(proveedorAgg).map(k => ({
  proveedor: k, gasto_clp: r0(proveedorAgg[k].gasto), ordenes: proveedorAgg[k].ordenes, urgentes: proveedorAgg[k].urgentes
})).sort((a, b) => b.gasto_clp - a.gasto_clp);

const comprasUrgentes = compras.filter(c => String(c.alerta || '').indexOf('URGENTE') === 0)
  .map(c => ({ material: c.material_id, mes: c.mes, cantidad: r0(c.cantidad), costo_clp: r0(c.costo_total), fecha_orden: c.fecha_orden, proveedor: c.proveedor, alerta: c.alerta }));

const ajustesAi = {};
forecast.filter(r => num(r.factor_ai) !== 1).forEach(r => {
  const fam = famDe(r.sku_id);
  const k = fam + '|' + r.mes;
  if (!ajustesAi[k]) ajustesAi[k] = { familia: fam, mes: r.mes, factor: num(r.factor_ai), razon: r.razon_ai, n_skus: 0, base: 0, consenso: 0 };
  ajustesAi[k].n_skus += 1;
  ajustesAi[k].base += num(r.forecast_estadistico);
  ajustesAi[k].consenso += num(r.forecast_consenso);
});
const ajustesLista = Object.keys(ajustesAi).map(k => {
  const a = ajustesAi[k];
  return { familia: a.familia, mes: a.mes, factor: a.factor, razon: a.razon, n_skus: a.n_skus, base: r0(a.base), consenso: r0(a.consenso), delta_u: r0(a.consenso - a.base) };
}).sort((a, b) => (a.familia + a.mes).localeCompare(b.familia + b.mes));

const reuniones = minutas.map(m => {
  let dec = [];
  try { dec = JSON.parse(m.decisiones_json || '[]'); } catch (e) { dec = []; }
  return {
    paso: num(m.paso), reunion: m.reunion, agente: m.agente, fecha: m.fecha,
    logica: String(m.logica || '').split('|').map(x => x.trim()).filter(Boolean),
    decisiones: dec,
    conclusiones: String(m.conclusiones || '').split('|').map(x => x.trim()).filter(Boolean),
    riesgos: String(m.riesgos || '').split('|').map(x => x.trim()).filter(Boolean),
    handoff: m.handoff
  };
});

const topN = (arr, k, dir, n) => arr.slice().sort((a, b) => dir === 'asc' ? (a[k] - b[k]) : (b[k] - a[k])).slice(0, n)
  .map(x => ({ sku: x.sku, nombre: x.nombre, fam: x.fam, abc: x.abc, xyz: x.xyz, valor: x[k], cobertura_dias_min: x.cobertura_dias_min, inv_min: x.inv_min, ss: x.ss, quiebre: x.quiebre, fill_pct: x.fill_pct, venta_perdida_clp: x.venta_perdida_clp }));

const rankings = {
  inventario_mas_bajo_por_cobertura: topN(porSku, 'cobertura_dias_min', 'asc', 15),
  mayor_quiebre_unidades: topN(porSku.filter(x => x.quiebre > 0), 'quiebre', 'desc', 15),
  mayor_venta_perdida_clp: topN(porSku.filter(x => x.venta_perdida_clp > 0), 'venta_perdida_clp', 'desc', 15),
  peor_fill_rate: topN(porSku.filter(x => x.fill_pct < 100), 'fill_pct', 'asc', 15),
  bajo_stock_seguridad: porSku.filter(x => x.meses_bajo_ss > 0).sort((a, b) => b.meses_bajo_ss - a.meses_bajo_ss).slice(0, 20)
    .map(x => ({ sku: x.sku, nombre: x.nombre, fam: x.fam, abc: x.abc, ss: x.ss, inv_min: x.inv_min, meses_bajo_ss: x.meses_bajo_ss, cobertura_dias_min: x.cobertura_dias_min })),
  outliers_proyeccion_vs_historia: porSku.slice().sort((a, b) => Math.abs(b.z_fc_vs_hist) - Math.abs(a.z_fc_vs_hist)).slice(0, 15)
    .map(x => ({ sku: x.sku, nombre: x.nombre, fam: x.fam, abc: x.abc, xyz: x.xyz, hist_prom_12m: x.hist_prom_12m, fc_consenso: x.fc_consenso, var_fc_vs_hist_pct: x.var_fc_vs_hist_pct, z_fc_vs_hist: x.z_fc_vs_hist, hist_cv_pct: x.hist_cv_pct })),
  mas_erraticos_cv: porSku.slice().sort((a, b) => b.hist_cv_pct - a.hist_cv_pct).slice(0, 15)
    .map(x => ({ sku: x.sku, nombre: x.nombre, fam: x.fam, abc: x.abc, xyz: x.xyz, hist_cv_pct: x.hist_cv_pct, hist_prom_12m: x.hist_prom_12m })),
  mayor_uplift_ai: porSku.slice().sort((a, b) => b.uplift_ai_pct - a.uplift_ai_pct).slice(0, 10)
    .map(x => ({ sku: x.sku, fam: x.fam, uplift_ai_pct: x.uplift_ai_pct, fc_estadistico: x.fc_estadistico, fc_consenso: x.fc_consenso })),
  mayor_recorte_ai: porSku.slice().sort((a, b) => a.uplift_ai_pct - b.uplift_ai_pct).slice(0, 10)
    .map(x => ({ sku: x.sku, fam: x.fam, uplift_ai_pct: x.uplift_ai_pct, fc_estadistico: x.fc_estadistico, fc_consenso: x.fc_consenso })),
  sobre_stock: porSku.filter(x => x.cobertura_dias_min > 90).sort((a, b) => b.cobertura_dias_min - a.cobertura_dias_min).slice(0, 15)
    .map(x => ({ sku: x.sku, nombre: x.nombre, fam: x.fam, abc: x.abc, cobertura_dias_min: x.cobertura_dias_min, inv_final: x.inv_final, ss: x.ss })),
  mayor_margen: porSku.slice().sort((a, b) => (b.precio - b.costo) * b.atendida - (a.precio - a.costo) * a.atendida).slice(0, 10)
    .map(x => ({ sku: x.sku, fam: x.fam, abc: x.abc, margen_clp: r0((x.precio - x.costo) * x.atendida), precio: x.precio, costo: x.costo }))
};

const digest = {
  meta: {
    run_id: run,
    runs_disponibles: runs.slice(0, 12),
    fecha_ciclo: resumen.fecha || '',
    meses_forecast: meses,
    meses_historia: histMeses.length ? [histMeses[0], histMeses[histMeses.length - 1]] : [],
    n_meses_historia: histMeses.length,
    n_skus: skus.length,
    familias: famsSet,
    norma_cobertura_dias: NORMA_COBERTURA,
    politica_fill_por_clase: politicaFill,
    parametros: paramMap,
    moneda: 'CLP'
  },
  kpis_globales: {
    forecast_estadistico_u: r0(totFcEst),
    forecast_consenso_u: r0(totFcCons),
    uplift_ai_pct: totFcEst > 0 ? r1((totFcCons / totFcEst - 1) * 100) : 0,
    produccion_u: r0(totProd),
    demanda_atendida_u: r0(totAtendida),
    quiebre_u: r0(totQuiebre),
    fill_rate_pct: (totAtendida + totQuiebre) > 0 ? r1(totAtendida / (totAtendida + totQuiebre) * 100) : 100,
    fill_rate_pct_reportado: num(resumen.fill_rate_pct),
    ingresos_clp: r0(totIngresos),
    cogs_clp: r0(totCogs),
    margen_bruto_clp: r0(totMargen),
    margen_pct: totIngresos > 0 ? r1(totMargen / totIngresos * 100) : 0,
    venta_perdida_clp: r0(totVentaPerdida),
    gasto_materias_primas_clp: r0(totCompras),
    costo_programa_plantas_clp: r0(totCostoProg),
    horas_produccion: r1(horasProd),
    horas_changeover: r1(horasChg),
    pct_horas_en_changeover: (horasProd + horasChg) > 0 ? r1(horasChg / (horasProd + horasChg) * 100) : 0,
    ordenes_compra: compras.length,
    ordenes_compra_urgentes: comprasUrgentes.length,
    bloques_programados: schedule.length,
    decisiones_automaticas: nDecisiones,
    skus_con_quiebre: porSku.filter(x => x.quiebre > 0).length,
    skus_bajo_stock_seguridad: porSku.filter(x => x.meses_bajo_ss > 0).length,
    skus_sobre_stock_90d: porSku.filter(x => x.cobertura_dias_min > 90).length
  },
  por_mes: porMes,
  por_familia: porFamilia,
  fill_por_clase_abc: porClase,
  matriz_abc_xyz: matrizAbcXyz,
  capacidad_por_linea_mes: capacidad,
  materias_primas: materialesRes,
  gasto_por_proveedor: porProveedor,
  ordenes_compra_urgentes: comprasUrgentes,
  ajustes_ia_demanda: ajustesLista,
  rankings_criticidad: rankings,
  detalle_por_sku: porSku,
  reuniones_del_ciclo: reuniones,
  resumen_ejecutivo: {
    texto: resumen.resumen || '',
    decisiones: String(resumen.decisiones || '').split('|').map(x => x.trim()).filter(Boolean),
    alertas: String(resumen.alertas || '').split('|').map(x => x.trim()).filter(Boolean),
    ingresos_totales: num(resumen.ingresos_totales),
    margen_pct: num(resumen.margen_pct),
    venta_perdida_total: num(resumen.venta_perdida_total),
    fill_rate_pct: num(resumen.fill_rate_pct)
  }
};

const sinDatos = !run || (!forecast.length && !plan.length);

return [{
  json: {
    pregunta: pregunta,
    session_id: sessionId,
    run_id: run,
    runs_disponibles: runs,
    sin_datos: sinDatos,
    pregunta_vacia: !pregunta,
    contexto_json: JSON.stringify(digest),
    tamano_contexto: JSON.stringify(digest).length
  }
}];
