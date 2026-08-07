function rows(name) { try { return $(name).all().map(i => i.json).filter(r => r && Object.keys(r).length > 1); } catch (e) { return []; } }
const q = ($('Webhook').first().json.query) || {};
const hist = rows('Leer Demanda Historica').filter(r => r.sku_id);
const skus = rows('Leer SKUs').filter(r => r.sku_id);
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
const bomRows = rows('Leer BOM').filter(r => r.material_id);
const runsSet = {};
fcAll.forEach(r => { const c = String(r.createdAt || ''); if (!runsSet[r.run_id] || c > runsSet[r.run_id]) runsSet[r.run_id] = c; });
const runs = Object.keys(runsSet).sort((a, b) => String(runsSet[b]).localeCompare(String(runsSet[a])));
const run = (q.run_id && runs.indexOf(q.run_id) >= 0) ? q.run_id : (runs[0] || '');
const F = arr => arr.filter(x => x.run_id === run);
const D = {
  run: run, runs: runs, skus: skus, hist: hist,
  forecast: F(fcAll), plan: F(planAll), schedule: F(schedAll),
  compras: F(comprasAll), pl: F(plAll), resumen: F(resAll)[0] || {},
  minutas: F(minAll).sort((a, b) => a.paso - b.paso),
  materiales: materiales, parametros: parametros, lineas: lineas, fabricas: fabricas, bom: bomRows,
  chat_url: 'https://n8n-production-121a.up.railway.app/webhook/ibp-chat'
};
const dataJson = JSON.stringify(D).split('</').join('<\\/');
const html = `<!DOCTYPE html>
<html lang='es'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>Portal IBP · ${run}</title>
<script src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'></script>
<style>
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; margin: 0; background: #f2f4f7; color: #1a1f24; }
header { background: #051C2C; color: #fff; padding: 18px 28px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
header h1 { font-size: 19px; margin: 0; font-weight: 700; letter-spacing: 0.2px; }
header h1 span { color: #00A9F4; }
header .meta { font-size: 12px; opacity: 0.8; }
header select { margin-left: auto; padding: 7px 10px; border-radius: 3px; border: 0; font-size: 13px; background: #fff; color: #051C2C; }
nav { display: flex; gap: 2px; background: #fff; padding: 6px 20px 0; border-bottom: 1px solid #dfe3e8; overflow-x: auto; }
nav button { border: 0; background: transparent; padding: 11px 15px; font-size: 13px; cursor: pointer; border-bottom: 3px solid transparent; color: #5b6770; white-space: nowrap; font-family: inherit; }
nav button.act { color: #051C2C; font-weight: 700; border-bottom-color: #2251FF; }
main { padding: 22px 28px 80px; max-width: 1140px; margin: auto; }
section { display: none; }
section.act { display: block; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; margin: 0 0 18px; }
.card { background: #fff; border-radius: 4px; padding: 14px 16px; border: 1px solid #e3e7ec; border-top: 3px solid #2251FF; }
.card.warn { border-top-color: #E8A33D; }
.card.bad { border-top-color: #C00000; }
.card.good { border-top-color: #12805C; }
.card .l { font-size: 11.5px; color: #5b6770; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
.card .v { font-size: 22px; font-weight: 700; color: #051C2C; }
.card .s { font-size: 11px; color: #5b6770; margin-top: 3px; }
.panel { background: #fff; border-radius: 4px; padding: 18px 20px; border: 1px solid #e3e7ec; margin: 0 0 18px; }
.panel h3 { margin: 0 0 12px; font-size: 14px; color: #051C2C; border-left: 4px solid #2251FF; padding-left: 8px; }
.panel h3 small { font-weight: 400; color: #5b6770; font-size: 11.5px; letter-spacing: 0; text-transform: none; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; margin: 0 0 18px; }
.grid2 .panel { margin: 0; }
.chartbox { position: relative; height: 320px; }
.chartbox.sm { height: 250px; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
th { text-align: left; color: #5b6770; font-weight: 700; padding: 7px 8px; border-bottom: 2px solid #051C2C; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.3px; }
td { padding: 6px 8px; border-bottom: 1px solid #eef1f4; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 2px; font-size: 11px; background: #E6F3FB; color: #051C2C; margin: 2px 3px 2px 0; }
.urgente { color: #C00000; font-weight: 700; }
.sem { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
.s-ok { background: #12805C; }
.s-warn { background: #E8A33D; }
.s-bad { background: #C00000; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10.5px; font-weight: 700; }
.pill.ok { background: #DFF3EC; color: #0B5D44; }
.pill.warn { background: #FBEEDA; color: #7A5314; }
.pill.bad { background: #FBE3E3; color: #8A1111; }
.minuta { background: #fff; border: 1px solid #e3e7ec; border-left: 4px solid #051C2C; border-radius: 4px; padding: 16px 18px; margin: 0 0 18px; }
.minuta h3 { margin: 0 0 2px; font-size: 15px; color: #051C2C; }
.minuta .fecha { font-size: 11px; color: #5b6770; margin-bottom: 8px; }
.minuta h4 { margin: 14px 0 5px; font-size: 11px; color: #2251FF; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
.minuta ul { margin: 4px 0; padding-left: 18px; font-size: 13px; line-height: 1.55; }
.minuta li { margin: 3px 0; }
.handoff { background: #E9EDF2; border-left: 3px solid #00A9F4; padding: 10px 12px; font-size: 13px; font-style: italic; margin-top: 8px; }
.gline { display: grid; grid-template-columns: 200px 1fr 46px; gap: 8px; align-items: center; margin: 0 0 4px; }
.gline .lbl { font-size: 11.5px; color: #5b6770; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gbar { display: flex; height: 22px; border-radius: 2px; overflow: hidden; background: #EDF0F3; border: 1px solid #e3e7ec; }
.gbar div { color: #fff; font-size: 9.5px; line-height: 22px; text-align: center; overflow: hidden; white-space: nowrap; border-right: 1px solid #fff; }
.gmes { font-size: 13px; font-weight: 700; color: #051C2C; margin: 14px 0 6px; }
.gutil { font-size: 11.5px; font-weight: 700; text-align: right; }
.leg { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: #5b6770; margin: 0 0 10px; }
.leg span { display: flex; align-items: center; gap: 5px; }
.leg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.filtros { display: flex; gap: 10px; align-items: center; margin: 0 0 12px; font-size: 13px; flex-wrap: wrap; }
.filtros select { padding: 7px 10px; border-radius: 3px; border: 1px solid #c9d1d9; font-size: 13px; background: #fff; font-family: inherit; }
.razon { font-size: 12px; color: #5b6770; }
.timeline { position: relative; padding-left: 24px; }
.timeline .paso { position: relative; padding: 0 0 18px 12px; border-left: 2px solid #c9d1d9; }
.timeline .paso:before { content: ''; position: absolute; left: -7px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #2251FF; }
.timeline .paso b { font-size: 13.5px; color: #051C2C; }
.timeline .paso p { margin: 4px 0 0; font-size: 12.5px; color: #40474e; }
.matriz { display: grid; grid-template-columns: 60px repeat(3, 1fr); gap: 4px; max-width: 420px; font-size: 12px; }
.matriz .h { font-weight: 700; color: #5b6770; text-align: center; padding: 6px; font-size: 11px; }
.matriz .c { text-align: center; padding: 12px 6px; border-radius: 3px; font-weight: 700; font-size: 15px; color: #051C2C; }
.bars { font-size: 12px; }
.bars .row { display: grid; grid-template-columns: 150px 1fr 90px; gap: 10px; align-items: center; margin: 0 0 6px; }
.bars .track { background: #EDF0F3; border-radius: 3px; height: 16px; overflow: hidden; }
.bars .fill { height: 100%; background: #2251FF; }
.bars .fill.warn { background: #E8A33D; }
.bars .fill.bad { background: #C00000; }
#chatbtn { position: fixed; right: 22px; bottom: 22px; z-index: 60; background: #2251FF; color: #fff; border: 0; border-radius: 26px; padding: 13px 20px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 20px rgba(5,28,44,0.28); font-family: inherit; }
#chatbtn:hover { background: #143ecc; }
#chatpanel { position: fixed; right: 0; top: 0; bottom: 0; width: 460px; max-width: 100vw; background: #fff; z-index: 70; display: none; flex-direction: column; box-shadow: -8px 0 30px rgba(5,28,44,0.22); }
#chatpanel.open { display: flex; }
#chathead { background: #051C2C; color: #fff; padding: 14px 18px; display: flex; align-items: center; gap: 10px; }
#chathead b { font-size: 14px; }
#chathead .sub { font-size: 11px; opacity: 0.75; }
#chathead button { margin-left: auto; background: transparent; border: 0; color: #fff; font-size: 22px; cursor: pointer; line-height: 1; }
#chatlog { flex: 1; overflow-y: auto; padding: 16px; background: #f7f8fa; }
.msg { margin: 0 0 14px; font-size: 13px; line-height: 1.6; }
.msg .who { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #5b6770; font-weight: 700; margin-bottom: 4px; }
.msg .txt { background: #fff; border: 1px solid #e3e7ec; border-radius: 6px; padding: 10px 12px; overflow-x: auto; }
.msg.me .txt { background: #E7EDFF; border-color: #ccd9ff; }
.msg .txt table { font-size: 11.5px; margin: 8px 0; }
.msg .txt th { font-size: 10.5px; border-bottom-width: 1px; }
.msg .txt td { padding: 4px 6px; }
.msg .txt p { margin: 6px 0; }
.msg .txt ul, .msg .txt ol { margin: 6px 0; padding-left: 20px; }
.msg .txt code { background: #EDF0F3; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
#chatsug { padding: 10px 16px 0; background: #f7f8fa; display: flex; flex-wrap: wrap; gap: 6px; }
#chatsug button { background: #fff; border: 1px solid #c9d1d9; border-radius: 14px; padding: 5px 11px; font-size: 11.5px; cursor: pointer; color: #2251FF; font-family: inherit; text-align: left; }
#chatsug button:hover { background: #E7EDFF; }
#chatform { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e3e7ec; background: #fff; }
#chatinput { flex: 1; border: 1px solid #c9d1d9; border-radius: 4px; padding: 10px; font-size: 13px; font-family: inherit; resize: none; height: 62px; }
#chatsend { background: #2251FF; color: #fff; border: 0; border-radius: 4px; padding: 0 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
#chatsend:disabled { background: #99A3AD; cursor: default; }
.thinking { color: #5b6770; font-style: italic; font-size: 12.5px; }
.flujo-ctrl { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0 0 12px; }
button.play { background: #12805C; color: #fff; border: 0; border-radius: 4px; padding: 12px 22px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; }
button.play:hover { background: #0d6347; }
button.play:disabled { background: #99A3AD; cursor: default; }
.flujo-bar-wrap { background: #EDF0F3; border-radius: 3px; height: 10px; overflow: hidden; }
.flujo-bar { height: 100%; width: 0%; background: linear-gradient(90deg, #2251FF, #12805C); transition: width 0.6s ease; }
.pipeline { display: flex; align-items: stretch; gap: 0; overflow-x: auto; padding: 4px 2px 10px; }
.ag-card { flex: 0 0 214px; background: #fff; border: 1px solid #e3e7ec; border-top: 3px solid #c9d1d9; border-radius: 4px; padding: 12px 13px; opacity: 0.62; transition: opacity 0.4s, box-shadow 0.4s, border-color 0.4s; }
.ag-card.trabajando { opacity: 1; border-top-color: var(--c); box-shadow: 0 0 0 2px rgba(34,81,255,0.16), 0 6px 18px rgba(5,28,44,0.10); animation: pulso 1.9s ease-in-out infinite; }
.ag-card.listo { opacity: 1; border-top-color: #12805C; }
@keyframes pulso { 0%,100% { box-shadow: 0 0 0 2px rgba(34,81,255,0.14), 0 6px 18px rgba(5,28,44,0.08); } 50% { box-shadow: 0 0 0 5px rgba(34,81,255,0.07), 0 6px 22px rgba(5,28,44,0.14); } }
.ag-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 7px; }
.ag-num { background: var(--c); color: #fff; width: 21px; height: 21px; border-radius: 50%; font-size: 11.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.ag-head b { font-size: 12.8px; color: #051C2C; display: block; line-height: 1.25; }
.ag-wf { font-size: 10.5px; color: #8a9096; margin-top: 1px; }
.ag-badge { margin-left: auto; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; padding: 2px 6px; border-radius: 9px; background: #EDF0F3; color: #5b6770; flex: 0 0 auto; }
.ag-card.trabajando .ag-badge { background: #E7EDFF; color: #2251FF; }
.ag-card.listo .ag-badge { background: #DFF3EC; color: #0B5D44; }
.ag-rol { font-size: 11.5px; color: #40474e; line-height: 1.45; margin-bottom: 6px; }
.ag-entrega { font-size: 10.8px; color: #5b6770; border-top: 1px dashed #e3e7ec; padding-top: 6px; margin-bottom: 7px; line-height: 1.4; }
.ag-wait { font-size: 11px; color: #99A3AD; font-style: italic; }
.ag-task { font-size: 11.3px; color: #2251FF; font-weight: 600; line-height: 1.4; display: flex; align-items: flex-start; gap: 6px; min-height: 32px; }
.ag-ok { font-size: 11.5px; color: #0B5D44; font-weight: 700; margin-bottom: 5px; }
.ag-dec { font-size: 10.8px; color: #40474e; line-height: 1.4; border-left: 2px solid #DFF3EC; padding-left: 6px; margin-bottom: 4px; }
.ag-dec span { color: #8a9096; }
.ag-spin { width: 11px; height: 11px; border: 2px solid rgba(34,81,255,0.25); border-top-color: #2251FF; border-radius: 50%; display: inline-block; animation: gira 0.8s linear infinite; flex: 0 0 auto; margin-top: 2px; }
button.play .ag-spin { border-color: rgba(255,255,255,0.4); border-top-color: #fff; margin: 0 8px 0 0; }
@keyframes gira { to { transform: rotate(360deg); } }
.ag-arrow { flex: 0 0 42px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ag-arrow-l { width: 100%; height: 2px; background: #dfe3e8; position: relative; }
.ag-arrow-l:after { content: ''; position: absolute; right: 0; top: -4px; border-left: 7px solid #dfe3e8; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.ag-arrow.on .ag-arrow-l { background: #12805C; }
.ag-arrow.on .ag-arrow-l:after { border-left-color: #12805C; }
.ag-arrow-t { font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; color: #12805C; margin-top: 4px; height: 11px; font-weight: 700; }
.logbox { max-height: 260px; overflow-y: auto; background: #f7f8fa; border: 1px solid #e3e7ec; border-radius: 4px; padding: 10px 12px; }
.lg-row { display: flex; align-items: flex-start; gap: 9px; font-size: 12.3px; line-height: 1.5; padding: 3px 0; }
.lg-t { font-variant-numeric: tabular-nums; color: #99A3AD; font-size: 11px; flex: 0 0 34px; padding-top: 2px; }
.lg-p { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; margin-top: 6px; background: #99A3AD; }
.lg-p.ok { background: #12805C; } .lg-p.work { background: #2251FF; } .lg-p.pass { background: #00A9F4; } .lg-p.err { background: #C00000; }
.lg-m { color: #1a1f24; }
.fin { display: none; background: #DFF3EC; border: 1px solid #a9ddc9; border-left: 4px solid #12805C; border-radius: 4px; padding: 16px 18px; margin: 0 0 18px; }
.fin-t { font-size: 16px; font-weight: 700; color: #0B5D44; }
.fin-s { font-size: 13px; color: #0B5D44; margin: 4px 0 12px; }
.fin-b { background: #12805C; color: #fff; border: 0; border-radius: 4px; padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
.fin-b:hover { background: #0d6347; }
@media (max-width: 820px) { .pipeline { flex-direction: column; } .ag-card { flex: 1 1 auto; } .ag-arrow { flex: 0 0 26px; width: 100%; transform: rotate(90deg); } }
@media (max-width: 620px) { #chatpanel { width: 100vw; } main { padding: 18px 14px 80px; } }
</style>
</head>
<body>
<header>
  <h1>Portal S&OP / <span>IBP</span> &middot; Red de Chocolates</h1>
  <span class='meta'>Run <b>${run}</b> &middot; 100 SKUs &middot; 6 familias &middot; 2 plantas &middot; motores de optimizacion autonomos</span>
  <select id='runsel' onchange='location.search="?run_id="+this.value'></select>
</header>
<nav id='tabs'></nav>
<main id='main'></main>
<button id='chatbtn' onclick='toggleChat(true)'>Preguntar al analista IA</button>
<div id='chatpanel'>
  <div id='chathead'><div><b>Analista IBP</b><div class='sub'>Q&amp;A sobre el run ${run}</div></div><button onclick='toggleChat(false)' title='Cerrar'>&times;</button></div>
  <div id='chatlog'></div>
  <div id='chatsug'></div>
  <form id='chatform' onsubmit='return enviarChat(event)'>
    <textarea id='chatinput' placeholder='Ej: que SKUs tienen el inventario mas bajo y por que?'></textarea>
    <button id='chatsend' type='submit'>Enviar</button>
  </form>
</div>
<script>
const D = ${dataJson};
const CLP = v => 'CLP ' + Math.round(Number(v) || 0).toLocaleString('es-CL');
const MM = v => { const n = Number(v) || 0; return Math.abs(n) >= 1e6 ? 'CLP ' + (Math.round(n / 1e5) / 10).toLocaleString('es-CL') + ' MM' : CLP(n); };
const NUM = v => Math.round(Number(v) || 0).toLocaleString('es-CL');
const N1 = v => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('es-CL');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nz = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const FAMCOLOR = { 'BAR-LECHE': '#2251FF', 'BAR-OSCURO': '#051C2C', 'BAR-BLANCO': '#AAE6F0', 'FRUTOS': '#00A9F4', 'BOMBONES': '#6B5AED', 'ESTACIONAL': '#99A3AD' };
const FAMS = Object.keys(FAMCOLOR);
const NORMA_COB = 45;
const POLFILL = { A: 98, B: 95, C: 90 };
const TABS = [['r360', 'Resumen 360'], ['flujo', 'Agentes en vivo'], ['res', 'Resumen ejecutivo'], ['dem', '1 · Demanda'], ['sup', '2 · Supply'], ['sch', '3 · Scheduling'], ['pro', '4 · Procurement'], ['fin', '5 · Finanzas'], ['mbr', '6 · Conciliacion']];
const skuMap = {};
D.skus.forEach(s => { skuMap[s.sku_id] = s; });
const famDe = id => (skuMap[id] || {}).familia || 'SIN-FAMILIA';
const sel = document.getElementById('runsel');
D.runs.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; if (r === D.run) o.selected = true; sel.appendChild(o); });
const nav = document.getElementById('tabs');
const main = document.getElementById('main');
TABS.forEach(t => {
  const b = document.createElement('button'); b.textContent = t[1]; b.id = 'tb-' + t[0];
  b.onclick = () => show(t[0]); nav.appendChild(b);
  const s = document.createElement('section'); s.id = 'tab-' + t[0]; main.appendChild(s);
});
function show(id) {
  TABS.forEach(t => {
    document.getElementById('tb-' + t[0]).className = t[0] === id ? 'act' : '';
    document.getElementById('tab-' + t[0]).className = t[0] === id ? 'act' : '';
  });
  setTimeout(() => { try { Object.values(Chart.instances || {}).forEach(c => { c.resize(); c.update(); }); } catch (e) {} }, 60);
}
function card(l, v, s, cls) { return '<div class="card' + (cls ? ' ' + cls : '') + '"><div class=l>' + l + '</div><div class=v>' + v + '</div>' + (s ? '<div class=s>' + s + '</div>' : '') + '</div>'; }
function optHtml(paso) {
  const m = D.minutas.find(x => Number(x.paso) === paso);
  if (!m) return '<div class=minuta><h3>Registro de optimizacion no disponible</h3><p style="font-size:13px">Este run no tiene registro para el paso ' + paso + '.</p></div>';
  let dec = [];
  try { dec = JSON.parse(m.decisiones_json || '[]'); } catch (e) { dec = []; }
  let h = '<div class=minuta><h3>' + esc(m.reunion) + '</h3><div class=fecha>' + esc(m.fecha) + ' &middot; motor autonomo &middot; paso ' + m.paso + ' del ciclo</div>';
  h += '<h4>Logica de optimizacion aplicada</h4><ul>' + String(m.logica || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul>';
  h += '<h4>Decisiones automaticas del motor</h4>';
  if (dec.length) {
    h += '<table><tr><th>Decision</th><th>Justificacion</th><th>Impacto estimado</th></tr>';
    dec.forEach(a => { h += '<tr><td><b>' + esc(a.decision) + '</b></td><td>' + esc(a.justificacion || a.responsable || '') + '</td><td>' + esc(a.impacto || a.plazo || '') + '</td></tr>'; });
    h += '</table>';
  } else { h += '<p style="font-size:13px">Sin decisiones registradas.</p>'; }
  if (m.conclusiones) h += '<h4>Conclusiones de optimizacion</h4><ul>' + String(m.conclusiones).split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul>';
  if (m.riesgos) h += '<h4>Riesgos y limitaciones</h4><ul>' + String(m.riesgos).split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul>';
  h += '<h4>Traspaso a la siguiente etapa</h4><div class=handoff>' + esc(m.handoff) + '</div></div>';
  return h;
}
const meses = [...new Set(D.forecast.map(r => r.mes))].sort();
const histMeses = [...new Set(D.hist.map(r => r.mes))].sort();
function sumBy(arr, mesKey, valKey, filtro) {
  return mesKey.map(m => arr.filter(r => r.mes === m && (!filtro || filtro(r))).reduce((a, r) => a + nz(r[valKey]), 0));
}
function tot(arr, k) { return arr.reduce((a, r) => a + nz(r[k]), 0); }
function sd(a) { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

const resumen = D.resumen || {};
const totFc = tot(D.forecast, 'forecast_consenso');
const totFcEst = tot(D.forecast, 'forecast_estadistico');
const totProd = tot(D.plan, 'produccion');
const totAtendida = tot(D.plan, 'demanda_atendida');
const totQuiebre = tot(D.plan, 'quiebre');
const totCompras = tot(D.compras, 'costo_total');
const totCostoProg = tot(D.schedule, 'costo_clp');
const horasChg = tot(D.schedule.filter(r => r.tipo === 'CHANGEOVER'), 'horas');
const horasProdT = tot(D.schedule.filter(r => r.tipo !== 'CHANGEOVER'), 'horas');
const nDecisiones = D.minutas.reduce((a, m) => { try { return a + JSON.parse(m.decisiones_json || '[]').length; } catch (e) { return a; } }, 0);
const clase = { A: { d: 0, a: 0 }, B: { d: 0, a: 0 }, C: { d: 0, a: 0 } };
D.plan.forEach(p => {
  const s = skuMap[p.sku_id] || {};
  const c = clase[s.clase_abc || 'B'];
  if (c) { c.d += nz(p.demanda_atendida) + nz(p.quiebre); c.a += nz(p.demanda_atendida); }
});
const fillClase = {};
for (const c in clase) fillClase[c] = clase[c].d > 0 ? Math.round(clase[c].a / clase[c].d * 1000) / 10 : 100;

const histPorSku = {}; D.hist.forEach(r => { (histPorSku[r.sku_id] = histPorSku[r.sku_id] || []).push(r); });
const fcPorSku = {}; D.forecast.forEach(r => { (fcPorSku[r.sku_id] = fcPorSku[r.sku_id] || []).push(r); });
const planPorSku = {}; D.plan.forEach(r => { (planPorSku[r.sku_id] = planPorSku[r.sku_id] || []).push(r); });
const SK = D.skus.map(s => {
  const h = (histPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const f = (fcPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const p = (planPorSku[s.sku_id] || []).slice().sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const hy = h.map(x => nz(x.unidades)).slice(-12);
  const pHist = avg(hy), sHist = sd(hy);
  const fcC = tot(f, 'forecast_consenso'), fcE = tot(f, 'forecast_estadistico');
  const pFc = f.length ? fcC / f.length : 0;
  const at = tot(p, 'demanda_atendida'), qb = tot(p, 'quiebre');
  const ss = nz(s.stock_seguridad);
  const invs = p.map(x => nz(x.inventario_final));
  const cobs = p.map(x => { const m = f.find(y => y.mes === x.mes); const d = m ? nz(m.forecast_consenso) : pFc; return d > 0 ? nz(x.inventario_final) / d * 30 : 999; });
  return {
    sku: s.sku_id, nombre: s.nombre, fam: s.familia, abc: s.clase_abc, xyz: s.clase_xyz,
    precio: nz(s.precio_venta), costo: nz(s.costo_conversion), ss: ss,
    histProm: pHist, cv: pHist > 0 ? sHist / pHist * 100 : 0,
    fcE: fcE, fcC: fcC, upl: fcE > 0 ? (fcC / fcE - 1) * 100 : 0,
    varHist: pHist > 0 ? (pFc / pHist - 1) * 100 : 0,
    z: sHist > 0 ? (pFc - pHist) / sHist : 0,
    prod: tot(p, 'produccion'), at: at, qb: qb,
    fill: (at + qb) > 0 ? at / (at + qb) * 100 : 100,
    obj: POLFILL[s.clase_abc] || 95,
    invMin: invs.length ? Math.min.apply(null, invs) : 0,
    invFin: invs.length ? invs[invs.length - 1] : 0,
    cobMin: cobs.length ? Math.min.apply(null, cobs) : 0,
    bajoSS: p.filter(x => nz(x.inventario_final) < ss).length,
    vp: qb * nz(s.precio_venta)
  };
});
const MES = meses.map(m => {
  const f = D.forecast.filter(r => r.mes === m), p = D.plan.filter(r => r.mes === m);
  const l = D.pl.filter(r => r.mes === m), s = D.schedule.filter(r => r.mes === m);
  const at = tot(p, 'demanda_atendida'), qb = tot(p, 'quiebre'), inv = tot(p, 'inventario_final');
  const fcm = tot(f, 'forecast_consenso'), ing = tot(l, 'ingresos'), mg = tot(l, 'margen_bruto');
  return { mes: m, fcE: tot(f, 'forecast_estadistico'), fcC: fcm, prod: tot(p, 'produccion'), at: at, qb: qb,
    fill: (at + qb) > 0 ? at / (at + qb) * 100 : 100, inv: inv, cob: fcm > 0 ? inv / fcm * 30 : 0,
    ing: ing, mg: mg, mgPct: ing > 0 ? mg / ing * 100 : 0, vp: tot(l, 'venta_perdida'),
    hProd: tot(s.filter(x => x.tipo !== 'CHANGEOVER'), 'horas'), hChg: tot(s.filter(x => x.tipo === 'CHANGEOVER'), 'horas'),
    costo: tot(s, 'costo_clp'), compras: tot(D.compras.filter(r => r.mes === m), 'costo_total') };
});
const FAMAGG = FAMS.map(fam => {
  const sk = SK.filter(x => x.fam === fam);
  const p = D.plan.filter(r => famDe(r.sku_id) === fam), f = D.forecast.filter(r => famDe(r.sku_id) === fam);
  const l = D.pl.filter(r => r.familia === fam);
  const at = tot(p, 'demanda_atendida'), qb = tot(p, 'quiebre'), ing = tot(l, 'ingresos'), mg = tot(l, 'margen_bruto');
  const invProm = meses.length ? tot(p, 'inventario_final') / meses.length : 0;
  const fcProm = meses.length ? tot(f, 'forecast_consenso') / meses.length : 0;
  return { fam: fam, n: sk.length, fcC: tot(f, 'forecast_consenso'), prod: tot(p, 'produccion'), at: at, qb: qb,
    fill: (at + qb) > 0 ? at / (at + qb) * 100 : 100, inv: invProm, cob: fcProm > 0 ? invProm / fcProm * 30 : 0,
    ing: ing, mg: mg, mgPct: ing > 0 ? mg / ing * 100 : 0, vp: tot(l, 'venta_perdida') };
}).filter(x => x.n > 0);
const linMap = {}; D.lineas.forEach(l => { linMap[l.linea_id] = l; });
const fabMap = {}; D.fabricas.forEach(f => { fabMap[f.fabrica_id] = f; });
const capAgg = {};
D.schedule.forEach(r => {
  const k = r.linea_id;
  if (!capAgg[k]) capAgg[k] = { linea: k, horas: 0, chg: 0, costo: 0, turnos: 0, meses: {} };
  capAgg[k].horas += nz(r.horas); capAgg[k].costo += nz(r.costo_clp);
  if (r.tipo === 'CHANGEOVER') capAgg[k].chg += nz(r.horas);
  if (nz(r.turnos) > capAgg[k].turnos) capAgg[k].turnos = nz(r.turnos);
  capAgg[k].meses[r.mes] = 1;
});
const CAP = Object.keys(capAgg).map(k => {
  const x = capAgg[k], L = linMap[k] || {}, Fb = fabMap[L.fabrica_id] || {};
  const ht = nz(L.horas_turno) || 8, dh = nz(Fb.dias_habiles_mes) || 22;
  const oee = nz(L.oee_pct) ? nz(L.oee_pct) / 100 : 0.7;
  const nm = Object.keys(x.meses).length || 1;
  const turnos = x.turnos || nz(L.turnos_base) || 2;
  const disp = turnos * ht * dh * oee * nm;
  return { linea: k, nombre: L.nombre || '', fabrica: L.fabrica_id || '', turnos: turnos, oee: nz(L.oee_pct) || 70,
    disp: disp, prog: x.horas, chg: x.chg, util: disp > 0 ? x.horas / disp * 100 : 0, costo: x.costo };
}).sort((a, b) => b.util - a.util);
const prodFam = {}; D.plan.forEach(p => { const f = famDe(p.sku_id); prodFam[f] = (prodFam[f] || 0) + nz(p.produccion); });
const reqMat = {}; D.bom.forEach(b => { reqMat[b.material_id] = (reqMat[b.material_id] || 0) + (prodFam[b.familia] || 0) * nz(b.cantidad_por_unidad); });
const MAT = D.materiales.map(m => {
  const oc = D.compras.filter(c => c.material_id === m.material_id);
  const req = reqMat[m.material_id] || 0, stock = nz(m.stock_actual);
  return { mat: m.material_id, nombre: m.nombre, prov: m.proveedor, lt: nz(m.lead_time_dias), moq: nz(m.moq),
    cu: nz(m.costo_unitario), stock: stock, req: req, cob: req > 0 ? stock / req * 100 : 999,
    def: Math.max(0, req - stock), oc: oc.length, gasto: tot(oc, 'costo_total'),
    urg: oc.filter(c => String(c.alerta || '').indexOf('URGENTE') === 0).length };
}).sort((a, b) => b.def - a.def);
const urgentes = D.compras.filter(c => String(c.alerta || '').indexOf('URGENTE') === 0);
const totIng = tot(D.pl, 'ingresos'), totMg = tot(D.pl, 'margen_bruto'), totVP = tot(D.pl, 'venta_perdida');
const fillGlobal = (totAtendida + totQuiebre) > 0 ? totAtendida / (totAtendida + totQuiebre) * 100 : 100;
const invPromGlobal = meses.length ? tot(D.plan, 'inventario_final') / meses.length : 0;
const cobPromGlobal = meses.length && totFc > 0 ? invPromGlobal / (totFc / meses.length) * 30 : 0;
const bajoSSn = SK.filter(x => x.bajoSS > 0).length;
const sobreStock = SK.filter(x => x.cobMin > 90);
const conQuiebre = SK.filter(x => x.qb > 0);

function semClass(v, warn, bad, inv) {
  if (inv) return v <= bad ? 's-bad' : (v <= warn ? 's-warn' : 's-ok');
  return v >= bad ? 's-bad' : (v >= warn ? 's-warn' : 's-ok');
}
function pill(txt, cls) { return '<span class="pill ' + cls + '">' + txt + '</span>'; }
function tabla(cols, filas) {
  let h = '<table><tr>' + cols.map(c => '<th' + (c[1] ? ' class=num' : '') + '>' + c[0] + '</th>').join('') + '</tr>';
  h += filas.map(f => '<tr>' + f.map((v, i) => '<td' + (cols[i] && cols[i][1] ? ' class=num' : '') + '>' + v + '</td>').join('') + '</tr>').join('');
  return h + '</table>';
}

document.getElementById('tab-r360').innerHTML =
  '<div class=cards>' +
  card('Forecast consenso', NUM(totFc) + ' u', meses.length + ' meses · uplift IA ' + (totFcEst > 0 ? N1((totFc / totFcEst - 1) * 100) : 0) + '%') +
  card('Produccion planificada', NUM(totProd) + ' u', 'incluye pre-build') +
  card('Fill rate', N1(fillGlobal) + '%', 'A ' + fillClase.A + '% · B ' + fillClase.B + '% · C ' + fillClase.C + '%', fillGlobal >= 97 ? 'good' : (fillGlobal >= 94 ? 'warn' : 'bad')) +
  card('Quiebre', NUM(totQuiebre) + ' u', conQuiebre.length + ' SKUs afectados', totQuiebre > 0 ? 'bad' : 'good') +
  card('Ingresos', MM(totIng), meses.length + ' meses') +
  card('Margen bruto', MM(totMg), (totIng > 0 ? N1(totMg / totIng * 100) : 0) + '% vs objetivo 45%', (totIng > 0 && totMg / totIng * 100 >= 45) ? 'good' : 'warn') +
  card('Venta perdida', MM(totVP), 'oportunidad no capturada', totVP > 0 ? 'bad' : 'good') +
  card('Inventario promedio', NUM(invPromGlobal) + ' u', 'cobertura ' + N1(cobPromGlobal) + ' dias (norma ' + NORMA_COB + ')', cobPromGlobal < 30 ? 'bad' : (cobPromGlobal < NORMA_COB ? 'warn' : 'good')) +
  card('SKUs bajo stock seg.', bajoSSn, 'de ' + SK.length + ' SKUs del portafolio', bajoSSn > 0 ? 'warn' : 'good') +
  card('Sobre-stock (>90d)', sobreStock.length + ' SKUs', 'capital inmovilizado', sobreStock.length > 0 ? 'warn' : 'good') +
  card('Gasto materias primas', MM(totCompras), D.compras.length + ' ordenes · ' + urgentes.length + ' urgentes', urgentes.length > 0 ? 'warn' : '') +
  card('Costo del programa', MM(totCostoProg), N1(horasChg) + ' h en changeover (' + ((horasProdT + horasChg) > 0 ? N1(horasChg / (horasProdT + horasChg) * 100) : 0) + '%)') +
  card('Utilizacion plantas', (CAP.length ? N1(avg(CAP.map(c => c.util))) : 0) + '%', CAP.length + ' lineas programadas') +
  card('Decisiones automaticas', nDecisiones, 'en ' + D.minutas.length + ' etapas del ciclo') +
  '</div>' +

  '<div class=panel><h3>Sintesis del ciclo <small>generada por el motor de conciliacion ejecutiva</small></h3>' +
  '<p style="font-size:13.5px;line-height:1.6">' + esc(resumen.resumen) + '</p></div>' +

  '<div class=panel><h3>Demanda historica vs forecast del ciclo <small>total compania</small></h3>' +
  '<div class=chartbox><canvas id=r360dem></canvas></div></div>' +

  '<div class=grid2>' +
  '<div class=panel><h3>Niveles de inventario y cobertura <small>vs norma de ' + NORMA_COB + ' dias</small></h3>' +
  '<div class="chartbox sm"><canvas id=r360inv></canvas></div></div>' +
  '<div class=panel><h3>Servicio: demanda atendida vs quiebre</h3>' +
  '<div class="chartbox sm"><canvas id=r360fill></canvas></div></div>' +
  '</div>' +

  '<div class=grid2>' +
  '<div class=panel><h3>Inventario proyectado por familia <small>unidades</small></h3>' +
  '<div class="chartbox sm"><canvas id=r360invfam></canvas></div></div>' +
  '<div class=panel><h3>Forecast consenso por familia <small>unidades por mes</small></h3>' +
  '<div class="chartbox sm"><canvas id=r360fcfam></canvas></div></div>' +
  '</div>' +

  '<div class=grid2>' +
  '<div class=panel><h3>P&amp;L proyectado por mes</h3><div class="chartbox sm"><canvas id=r360pl></canvas></div></div>' +
  '<div class=panel><h3>Gasto de materias primas por proveedor</h3><div class="chartbox sm"><canvas id=r360prov></canvas></div></div>' +
  '</div>' +

  '<div class=panel><h3>Utilizacion de capacidad por linea <small>horas programadas sobre horas disponibles del horizonte</small></h3><div class=bars>' +
  CAP.map(c => '<div class=row><div class=razon><b>' + c.linea + '</b> · ' + esc(c.nombre) + '</div>' +
    '<div class=track><div class="fill' + (c.util > 95 ? ' bad' : (c.util > 85 ? ' warn' : '')) + '" style="width:' + Math.min(100, c.util) + '%"></div></div>' +
    '<div class=razon style="text-align:right">' + N1(c.util) + '% · ' + c.turnos + 'T</div></div>').join('') +
  '</div><p class=razon style="margin-top:8px">Horas disponibles = turnos x horas/turno x dias habiles x OEE. Sobre 95% la linea no tiene holgura para absorber variabilidad.</p></div>' +

  '<div class=panel><h3>Semaforo por familia <small>el ciclo completo en una tabla</small></h3>' +
  tabla([['Familia', 0], ['SKUs', 1], ['Forecast u', 1], ['Produccion u', 1], ['Quiebre u', 1], ['Fill %', 1], ['Inv. prom u', 1], ['Cobertura d', 1], ['Ingresos', 1], ['Margen %', 1], ['Venta perdida', 1]],
    FAMAGG.map(f => [
      '<span class="sem ' + (f.fill >= 97 ? 's-ok' : (f.fill >= 94 ? 's-warn' : 's-bad')) + '"></span><b>' + f.fam + '</b>',
      f.n, NUM(f.fcC), NUM(f.prod), NUM(f.qb), N1(f.fill), NUM(f.inv),
      '<span class="' + (f.cob < 30 ? 'urgente' : '') + '">' + N1(f.cob) + '</span>',
      MM(f.ing), N1(f.mgPct), MM(f.vp)
    ])) +
  '<p class=razon style="margin-top:8px">Semaforo sobre fill rate: verde &ge;97%, ambar 94-97%, rojo &lt;94%. Cobertura en rojo bajo 30 dias.</p></div>' +

  '<div class=panel><h3>Foto mes a mes <small>todas las etapas consolidadas</small></h3>' +
  tabla([['Mes', 0], ['Forecast u', 1], ['Produccion u', 1], ['Atendida u', 1], ['Quiebre u', 1], ['Fill %', 1], ['Inventario u', 1], ['Cobertura d', 1], ['Horas prod', 1], ['Changeover h', 1], ['Ingresos', 1], ['Margen %', 1], ['Compras MP', 1]],
    MES.map(m => [
      '<b>' + m.mes + '</b>', NUM(m.fcC), NUM(m.prod), NUM(m.at),
      (m.qb > 0 ? '<span class=urgente>' + NUM(m.qb) + '</span>' : '0'),
      N1(m.fill), NUM(m.inv),
      '<span class="' + (m.cob < 30 ? 'urgente' : '') + '">' + N1(m.cob) + '</span>',
      N1(m.hProd), N1(m.hChg), MM(m.ing), N1(m.mgPct), MM(m.compras)
    ])) + '</div>' +

  '<div class=panel><h3>SKUs mas criticos por nivel de inventario <small>menor cobertura en dias en el peor mes del horizonte</small></h3>' +
  tabla([['SKU', 0], ['Nombre', 0], ['Familia', 0], ['ABC/XYZ', 0], ['Cobertura min d', 1], ['Inv. min u', 1], ['Stock seg. u', 1], ['Meses bajo SS', 1], ['Quiebre u', 1], ['Fill %', 1]],
    SK.slice().sort((a, b) => a.cobMin - b.cobMin).slice(0, 15).map(x => [
      '<b>' + x.sku + '</b>', esc(x.nombre), x.fam, x.abc + x.xyz,
      '<span class="sem ' + (x.cobMin < 15 ? 's-bad' : (x.cobMin < 30 ? 's-warn' : 's-ok')) + '"></span>' + N1(x.cobMin),
      NUM(x.invMin), NUM(x.ss),
      (x.bajoSS > 0 ? '<span class=urgente>' + x.bajoSS + '</span>' : '0'),
      NUM(x.qb), N1(x.fill) + ' ' + (x.fill >= x.obj ? pill('meta', 'ok') : pill('bajo meta ' + x.obj + '%', 'bad'))
    ])) + '</div>' +

  '<div class=panel><h3>Donde se pierde la venta <small>SKUs con mayor venta perdida por quiebre</small></h3>' +
  (conQuiebre.length ? tabla([['SKU', 0], ['Nombre', 0], ['Familia', 0], ['ABC', 0], ['Quiebre u', 1], ['Venta perdida', 1], ['Fill %', 1], ['Meta %', 1]],
    conQuiebre.slice().sort((a, b) => b.vp - a.vp).slice(0, 15).map(x => [
      '<b>' + x.sku + '</b>', esc(x.nombre), x.fam, x.abc, NUM(x.qb),
      '<b>' + MM(x.vp) + '</b>', N1(x.fill), x.obj
    ])) : '<p style="font-size:13px">Sin quiebres en este run: la capacidad cubre la demanda consensuada.</p>') + '</div>' +

  '<div class=panel><h3>Proyecciones mas atipicas <small>outliers: cuantas desviaciones estandar se separa el forecast del promedio historico de 12 meses</small></h3>' +
  tabla([['SKU', 0], ['Nombre', 0], ['Familia', 0], ['ABC/XYZ', 0], ['Hist. prom u', 1], ['Forecast prom u', 1], ['Variacion %', 1], ['z-score', 1], ['CV hist %', 1]],
    SK.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 15).map(x => [
      '<b>' + x.sku + '</b>', esc(x.nombre), x.fam, x.abc + x.xyz, NUM(x.histProm),
      NUM(meses.length ? x.fcC / meses.length : 0),
      '<span class="' + (Math.abs(x.varHist) > 25 ? 'urgente' : '') + '">' + (x.varHist > 0 ? '+' : '') + N1(x.varHist) + '</span>',
      '<span class="sem ' + (Math.abs(x.z) > 2 ? 's-bad' : (Math.abs(x.z) > 1 ? 's-warn' : 's-ok')) + '"></span>' + N1(x.z),
      N1(x.cv)
    ])) +
  '<p class=razon style="margin-top:8px">|z| &gt; 2 marca una proyeccion que se aleja mucho de la historia del SKU y amerita revision del planner. CV alto indica demanda erratica (clase Z).</p></div>' +

  '<div class=panel><h3>Materias primas en riesgo <small>stock actual contra el requerimiento del horizonte (explosion de BOM)</small></h3>' +
  tabla([['Material', 0], ['Nombre', 0], ['Proveedor', 0], ['Lead time d', 1], ['Stock u', 1], ['Requerimiento u', 1], ['Cobertura %', 1], ['Deficit u', 1], ['Ordenes', 1], ['Gasto', 1]],
    MAT.slice(0, 12).map(m => [
      '<b>' + m.mat + '</b>', esc(m.nombre), esc(m.prov), m.lt, NUM(m.stock), NUM(m.req),
      '<span class="sem ' + (m.cob < 50 ? 's-bad' : (m.cob < 100 ? 's-warn' : 's-ok')) + '"></span>' + (m.cob > 998 ? '-' : N1(m.cob)),
      (m.def > 0 ? '<span class=urgente>' + NUM(m.def) + '</span>' : '0'),
      m.oc + (m.urg > 0 ? ' <span class=urgente>(' + m.urg + ' urg)</span>' : ''), MM(m.gasto)
    ])) +
  '<p class=razon style="margin-top:8px">El deficit se cubre con las ordenes del plan de compras. Una orden urgente significa que el lead time ya no alcanza para la fecha de requerimiento.</p></div>' +

  '<div class=grid2>' +
  '<div class=panel><h3>Cumplimiento de la politica de servicio</h3>' +
  tabla([['Clase', 0], ['SKUs', 1], ['Fill real %', 1], ['Objetivo %', 1], ['Estado', 0]],
    ['A', 'B', 'C'].map(c => {
      const n = SK.filter(x => x.abc === c).length;
      return [c, n, N1(fillClase[c]), POLFILL[c], fillClase[c] >= POLFILL[c] ? pill('cumple', 'ok') : pill('brecha ' + N1(POLFILL[c] - fillClase[c]) + ' pp', 'bad')];
    })) + '</div>' +
  '<div class=panel><h3>Segmentacion ABC / XYZ</h3><div id=r360matriz></div></div>' +
  '</div>' +

  '<div class=grid2>' +
  '<div class=panel><h3>Decisiones para el comite</h3><ul style="font-size:13px;line-height:1.6">' +
  String(resumen.decisiones || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul></div>' +
  '<div class=panel><h3>Alertas del ciclo</h3><ul style="font-size:13px;line-height:1.6">' +
  String(resumen.alertas || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul></div>' +
  '</div>' +

  '<div class=panel><h3>Ajustes del motor de IA sobre la demanda <small>el porque del forecast</small></h3>' +
  (function () {
    const aj = {};
    D.forecast.filter(r => nz(r.factor_ai) !== 1).forEach(r => {
      const fam = famDe(r.sku_id), k = fam + '|' + r.mes;
      if (!aj[k]) aj[k] = { fam: fam, mes: r.mes, factor: nz(r.factor_ai), razon: r.razon_ai, n: 0, base: 0, cons: 0 };
      aj[k].n += 1; aj[k].base += nz(r.forecast_estadistico); aj[k].cons += nz(r.forecast_consenso);
    });
    const L = Object.keys(aj).map(k => aj[k]).sort((a, b) => (a.fam + a.mes).localeCompare(b.fam + b.mes));
    if (!L.length) return '<p style="font-size:13px">Este run no registra ajustes de IA: el consenso es igual al forecast estadistico.</p>';
    return tabla([['Familia', 0], ['Mes', 0], ['SKUs', 1], ['Base u', 1], ['Factor', 1], ['Consenso u', 1], ['Delta u', 1], ['Razon del motor', 0]],
      L.map(a => [a.fam, a.mes, a.n, NUM(a.base), a.factor, '<b>' + NUM(a.cons) + '</b>',
        (a.cons - a.base > 0 ? '+' : '') + NUM(a.cons - a.base), '<span class=razon>' + esc(a.razon) + '</span>']));
  })() + '</div>' +

  '<div class=panel><h3>Flujo del ciclo: traspasos entre motores</h3><div class=timeline>' +
  D.minutas.map(m => '<div class=paso><b>' + m.paso + ' &middot; ' + esc(m.reunion) + '</b><p>' + esc(m.handoff) + '</p></div>').join('') +
  '</div></div>';

const abcxyz = {};
D.skus.forEach(s => { const k = (s.clase_abc || '?') + (s.clase_xyz || '?'); abcxyz[k] = (abcxyz[k] || 0) + 1; });
let matriz = '<div class=matriz><div class=h></div><div class=h>X (estable)</div><div class=h>Y (variable)</div><div class=h>Z (erratico)</div>';
['A', 'B', 'C'].forEach(a => {
  matriz += '<div class=h style="align-self:center">' + a + '</div>';
  ['X', 'Y', 'Z'].forEach(x => {
    const n = abcxyz[a + x] || 0;
    const bg = n > 0 ? (a === 'A' ? '#D6E4FF' : (a === 'B' ? '#E6F3FB' : '#EDF0F3')) : '#f7f8fa';
    matriz += '<div class=c style="background:' + bg + '">' + n + '</div>';
  });
});
matriz += '</div>';
document.getElementById('r360matriz').innerHTML = matriz + '<p class=razon style="margin-top:10px">ABC por valor de venta &middot; XYZ por variabilidad (CV). Politica de servicio diferenciada: A 98%, B 95%, C 90%.</p>';

const OPTL = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } };
new Chart(document.getElementById('r360dem'), {
  type: 'line',
  data: { labels: histMeses.concat(meses), datasets: [
    { label: 'Demanda historica', data: sumBy(D.hist, histMeses, 'unidades').concat(meses.map(() => null)), borderColor: '#051C2C', pointRadius: 2, borderWidth: 2, tension: 0.25 },
    { label: 'Forecast estadistico', data: histMeses.map(() => null).concat(sumBy(D.forecast, meses, 'forecast_estadistico')), borderColor: '#99A3AD', borderDash: [3, 3], pointRadius: 2, borderWidth: 2, tension: 0.25 },
    { label: 'Forecast consenso', data: histMeses.map(() => null).concat(sumBy(D.forecast, meses, 'forecast_consenso')), borderColor: '#2251FF', borderDash: [6, 4], pointRadius: 3, borderWidth: 2.5, tension: 0.25 },
    { label: 'Produccion planificada', data: histMeses.map(() => null).concat(sumBy(D.plan, meses, 'produccion')), borderColor: '#12805C', pointRadius: 2, borderWidth: 2, tension: 0.25 }
  ] },
  options: OPTL
});
new Chart(document.getElementById('r360inv'), {
  data: { labels: meses, datasets: [
    { type: 'bar', label: 'Inventario final (u)', data: MES.map(m => Math.round(m.inv)), backgroundColor: '#2251FF', yAxisID: 'y' },
    { type: 'line', label: 'Cobertura (dias)', data: MES.map(m => Math.round(m.cob * 10) / 10), borderColor: '#C00000', borderWidth: 2.5, pointRadius: 3, tension: 0.25, yAxisID: 'y1' },
    { type: 'line', label: 'Norma 45 dias', data: meses.map(() => NORMA_COB), borderColor: '#E8A33D', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, yAxisID: 'y1' }
  ] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
    scales: { y: { beginAtZero: true, position: 'left', title: { display: true, text: 'unidades' } },
      y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'dias' } } } }
});
new Chart(document.getElementById('r360fill'), {
  data: { labels: meses, datasets: [
    { type: 'bar', label: 'Demanda atendida', data: MES.map(m => Math.round(m.at)), backgroundColor: '#2251FF', stack: 's', yAxisID: 'y' },
    { type: 'bar', label: 'Quiebre', data: MES.map(m => Math.round(m.qb)), backgroundColor: '#C00000', stack: 's', yAxisID: 'y' },
    { type: 'line', label: 'Fill rate %', data: MES.map(m => Math.round(m.fill * 10) / 10), borderColor: '#12805C', borderWidth: 2.5, pointRadius: 3, tension: 0.25, yAxisID: 'y1' }
  ] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true }, y1: { position: 'right', min: 80, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } } } }
});
new Chart(document.getElementById('r360invfam'), {
  type: 'line',
  data: { labels: meses, datasets: FAMS.map(f => ({ label: f, data: sumBy(D.plan, meses, 'inventario_final', r => famDe(r.sku_id) === f), borderColor: FAMCOLOR[f], borderWidth: 2, pointRadius: 2, tension: 0.25 })) },
  options: OPTL
});
new Chart(document.getElementById('r360fcfam'), {
  type: 'bar',
  data: { labels: meses, datasets: FAMS.map(f => ({ label: f, data: sumBy(D.forecast, meses, 'forecast_consenso', r => famDe(r.sku_id) === f), backgroundColor: FAMCOLOR[f], stack: 'f' })) },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
});
new Chart(document.getElementById('r360pl'), {
  data: { labels: meses, datasets: [
    { type: 'bar', label: 'Ingresos', data: MES.map(m => Math.round(m.ing)), backgroundColor: '#051C2C', yAxisID: 'y' },
    { type: 'bar', label: 'Margen bruto', data: MES.map(m => Math.round(m.mg)), backgroundColor: '#2251FF', yAxisID: 'y' },
    { type: 'bar', label: 'Venta perdida', data: MES.map(m => Math.round(m.vp)), backgroundColor: '#C00000', yAxisID: 'y' },
    { type: 'line', label: 'Margen %', data: MES.map(m => Math.round(m.mgPct * 10) / 10), borderColor: '#E8A33D', borderWidth: 2.5, pointRadius: 3, tension: 0.25, yAxisID: 'y1' }
  ] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
    scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } } } }
});
const provAgg = {};
D.compras.forEach(c => { provAgg[c.proveedor] = (provAgg[c.proveedor] || 0) + nz(c.costo_total); });
new Chart(document.getElementById('r360prov'), {
  type: 'doughnut',
  data: { labels: Object.keys(provAgg), datasets: [{ data: Object.values(provAgg), backgroundColor: ['#051C2C', '#2251FF', '#00A9F4', '#6B5AED', '#99A3AD', '#AAE6F0', '#5b6770', '#12805C'] }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
});

document.getElementById('tab-res').innerHTML =
  '<div class=cards>' +
  card('Fill rate', (resumen.fill_rate_pct || 0) + '%', 'A ' + fillClase.A + '% · B ' + fillClase.B + '% · C ' + fillClase.C + '%') +
  card('Ingresos proyectados', CLP(resumen.ingresos_totales), meses.length + ' meses · 100 SKUs') +
  card('Margen bruto', (resumen.margen_pct || 0) + '%', 'objetivo 45%') +
  card('Venta perdida', CLP(resumen.venta_perdida_total), 'por quiebres') +
  card('Decisiones automaticas', nDecisiones, 'en ' + D.minutas.length + ' etapas del ciclo') +
  '</div>' +
  '<div class=panel><h3>Sintesis del ciclo</h3><p style="font-size:13.5px;line-height:1.6">' + esc(resumen.resumen) + '</p></div>' +
  '<div class=panel><h3>Decisiones para el comite</h3><ul style="font-size:13px;line-height:1.6">' + String(resumen.decisiones || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul></div>' +
  '<div class=panel><h3>Alertas</h3><ul style="font-size:13px;line-height:1.6">' + String(resumen.alertas || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul></div>' +
  '<div class=panel><h3>Flujo del ciclo: traspasos entre motores</h3><div class=timeline>' +
  D.minutas.map(m => '<div class=paso><b>' + m.paso + ' &middot; ' + esc(m.reunion) + '</b><p>' + esc(m.handoff) + '</p></div>').join('') +
  '</div></div>';

const ajustesFam = {};
D.forecast.filter(r => Number(r.factor_ai) !== 1).forEach(r => {
  const fam = famDe(r.sku_id);
  const k = fam + '|' + r.mes;
  if (!ajustesFam[k]) ajustesFam[k] = { familia: fam, mes: r.mes, factor: r.factor_ai, razon: r.razon_ai, skus: 0, base: 0, consenso: 0 };
  ajustesFam[k].skus += 1;
  ajustesFam[k].base += Number(r.forecast_estadistico);
  ajustesFam[k].consenso += Number(r.forecast_consenso);
});
document.getElementById('tab-dem').innerHTML =
  '<div class=cards>' +
  card('Forecast consenso', NUM(totFc) + ' u', meses.length + ' meses · 100 SKUs') +
  card('Ajustes IA (familia-mes)', Object.keys(ajustesFam).length, 'desagregados a SKU') +
  card('Historia', histMeses.length + ' meses', 'regresion + estacionalidad por SKU') +
  '</div>' +
  '<div class=panel><h3>Demanda historica vs forecast</h3>' +
  '<div class=filtros><label>Ver:</label><select id=demsel onchange="drawDem(this.value)">' +
  '<option value=TOTAL>Total compania</option>' +
  FAMS.map(f => '<option value="FAM:' + f + '">Familia: ' + f + '</option>').join('') +
  FAMS.map(f => '<optgroup label="SKUs ' + f + '">' + D.skus.filter(s => s.familia === f).map(s => '<option value="SKU:' + s.sku_id + '">' + s.sku_id + ' · ' + esc(s.nombre) + ' (' + s.clase_abc + s.clase_xyz + ')</option>').join('') + '</optgroup>').join('') +
  '</select></div><div class=chartbox><canvas id=demchart></canvas></div></div>' +
  '<div class=panel><h3>El porque del forecast: ajustes del motor IA por familia</h3>' +
  '<table><tr><th>Familia</th><th>Mes</th><th>Base estadistica</th><th>Factor</th><th>Consenso</th><th>Razon del motor</th></tr>' +
  Object.values(ajustesFam).sort((a, b) => (a.familia + a.mes).localeCompare(b.familia + b.mes)).map(r => '<tr><td><b>' + r.familia + '</b> <span class=razon>(' + r.skus + ' SKUs)</span></td><td>' + r.mes + '</td><td>' + NUM(r.base) + '</td><td>' + r.factor + '</td><td><b>' + NUM(r.consenso) + '</b></td><td class=razon>' + esc(r.razon) + '</td></tr>').join('') +
  '</table></div>' +
  '<div class=panel><h3>Segmentacion ABC / XYZ del portafolio (n SKUs)</h3>' + matriz + '<p class=razon style="margin-top:10px">ABC por valor de venta (80/95% acumulado) &middot; XYZ por variabilidad (CV). La politica de servicio es diferenciada: A 98%, B 95%, C 90%.</p></div>' +
  optHtml(1);
let demChart = null;
function drawDem(f) {
  const filtro = f === 'TOTAL' ? null : (f.indexOf('FAM:') === 0 ? (r => famDe(r.sku_id) === f.slice(4)) : (r => r.sku_id === f.slice(4)));
  const hy = sumBy(D.hist, histMeses, 'unidades', filtro);
  const fe = sumBy(D.forecast, meses, 'forecast_estadistico', filtro);
  const fy = sumBy(D.forecast, meses, 'forecast_consenso', filtro);
  const labels = histMeses.concat(meses);
  const pad = histMeses.map(() => null);
  if (demChart) demChart.destroy();
  demChart = new Chart(document.getElementById('demchart'), {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'Demanda historica', data: hy.concat(meses.map(() => null)), borderColor: '#051C2C', backgroundColor: '#051C2C', pointRadius: 2, borderWidth: 2, tension: 0.25 },
      { label: 'Forecast estadistico', data: pad.concat(fe), borderColor: '#99A3AD', borderDash: [3, 3], pointRadius: 2, borderWidth: 2, tension: 0.25 },
      { label: 'Forecast consenso', data: pad.concat(fy), borderColor: '#2251FF', borderDash: [6, 4], pointRadius: 3, borderWidth: 2.5, tension: 0.25 }
    ] },
    options: OPTL
  });
}

document.getElementById('tab-sup').innerHTML =
  '<div class=cards>' +
  card('Produccion total', NUM(totProd) + ' u', 'incluye pre-build') +
  card('Quiebre', NUM(totQuiebre) + ' u', CLP(resumen.venta_perdida_total) + ' perdidos') +
  card('Fill clase A', fillClase.A + '%', 'politica 98%') +
  card('Fill clase B / C', fillClase.B + '% / ' + fillClase.C + '%', 'politica 95% / 90%') +
  '</div>' +
  '<div class=panel><h3>Demanda atendida vs quiebre por mes</h3><div class=chartbox><canvas id=supchart></canvas></div></div>' +
  '<div class=panel><h3>Inventario proyectado por familia (unidades)</h3><div class="chartbox sm"><canvas id=invchart></canvas></div><p class=razon>Politica: SS = z(clase) x sigma 24m; el motor hace pre-build hacia los meses deficitarios y alerta cobertura sobre la norma de 45 dias.</p></div>' +
  optHtml(2);
new Chart(document.getElementById('supchart'), {
  type: 'bar',
  data: { labels: meses, datasets: [
    { label: 'Demanda atendida', data: sumBy(D.plan, meses, 'demanda_atendida'), backgroundColor: '#2251FF', stack: 's' },
    { label: 'Quiebre', data: sumBy(D.plan, meses, 'quiebre'), backgroundColor: '#C00000', stack: 's' }
  ] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
});
new Chart(document.getElementById('invchart'), {
  type: 'line',
  data: { labels: meses, datasets: FAMS.map(f => ({ label: f, data: sumBy(D.plan, meses, 'inventario_final', r => famDe(r.sku_id) === f), borderColor: FAMCOLOR[f], borderWidth: 2, pointRadius: 2, tension: 0.25 })) },
  options: OPTL
});

const NOMLIN = { 'LIN-S1': 'Moldeo 1 alta velocidad', 'LIN-S2': 'Moldeo 2 flexible', 'LIN-S3': 'Bombones premium', 'LIN-C1': 'Moldeo 3', 'LIN-C2': 'Mixta flexible' };
const schedMeses = [...new Set(D.schedule.map(r => r.mes))].sort();
let g = '<div class=cards>';
const costoSched = tot(D.schedule, 'costo_clp');
g += card('Bloques programados', D.schedule.length, 'campanas por familia') + card('Horas de changeover', Math.round(horasChg * 10) / 10 + ' h', 'product wheel') + card('Costo del programa', CLP(costoSched), 'maquina + gente + cambios') + '</div>';
g += '<div class=panel><h3>Gantt por linea (campanas de familia)</h3><div class=leg>' + FAMS.map(k => '<span><i style="background:' + FAMCOLOR[k] + '"></i>' + k + '</span>').join('') + '<span><i style="background:#B3B3B3"></i>Changeover</span><span><i style="background:#EDF0F3;border:1px solid #dfe3e8"></i>Libre</span></div>';
for (const mes of schedMeses) {
  g += '<div class=gmes>' + mes + '</div>';
  const lids = [...new Set(D.schedule.filter(r => r.mes === mes).map(r => r.linea_id))].sort();
  for (const lid of lids) {
    const bl = D.schedule.filter(r => r.mes === mes && r.linea_id === lid).sort((a, b) => a.secuencia - b.secuencia);
    const horasTot = bl.reduce((a, b2) => a + Number(b2.horas), 0);
    const turnos = bl[0].turnos;
    g += '<div class=gline><div class=lbl>' + lid + ' · ' + (NOMLIN[lid] || (linMap[lid] || {}).nombre || '') + ' · ' + turnos + 'T</div><div class=gbar>';
    for (const b2 of bl) {
      const w = Math.max(1, Number(b2.horas) / (horasTot || 1) * 100 * Math.min(1, Math.max(...bl.map(x => Number(x.dia_fin))) / 22));
      const chg = b2.tipo === 'CHANGEOVER';
      const fam = b2.familia || b2.sku_id || '';
      const dark = !chg && fam === 'BAR-BLANCO';
      const tt = chg ? ('Changeover ' + fam + ' · ' + b2.horas + ' h') : (fam + ' · ' + NUM(b2.unidades) + ' u · ' + b2.horas + ' h · dias ' + b2.dia_inicio + '-' + b2.dia_fin);
      g += '<div title="' + tt + '" style="width:' + w + '%;background:' + (chg ? '#B3B3B3' : (FAMCOLOR[fam] || '#7f7f7f')) + (dark ? ';color:#051C2C' : '') + '">' + (!chg && w > 12 ? fam.replace('BAR-', '') : '') + '</div>';
    }
    const dias = Math.max(...bl.map(x => Number(x.dia_fin)));
    g += '</div><div class=gutil>' + Math.round(Math.min(100, dias / 22 * 100)) + '%</div></div>';
  }
}
g += '</div>' +
  '<div class=panel><h3>Utilizacion de capacidad por linea <small>horizonte completo</small></h3>' +
  tabla([['Linea', 0], ['Nombre', 0], ['Planta', 0], ['Turnos', 1], ['OEE %', 1], ['Horas disp.', 1], ['Horas prog.', 1], ['Changeover h', 1], ['Utilizacion %', 1], ['Costo', 1]],
    CAP.map(c => ['<b>' + c.linea + '</b>', esc(c.nombre), c.fabrica, c.turnos, c.oee, N1(c.disp), N1(c.prog), N1(c.chg),
      '<span class="sem ' + (c.util > 95 ? 's-bad' : (c.util > 85 ? 's-warn' : 's-ok')) + '"></span>' + N1(c.util), MM(c.costo)])) + '</div>' +
  optHtml(3);
document.getElementById('tab-sch').innerHTML = g;

const provs = {};
D.compras.forEach(c => { provs[c.proveedor] = (provs[c.proveedor] || 0) + Number(c.costo_total || 0); });
document.getElementById('tab-pro').innerHTML =
  '<div class=cards>' +
  card('Ordenes de compra', D.compras.length, 'lotes MOQ / EOQ') +
  card('Gasto total MP', CLP(totCompras), '') +
  card('Ordenes urgentes', urgentes.length, 'lead time vencido', urgentes.length > 0 ? 'bad' : 'good') +
  '</div>' +
  '<div class=panel><h3>Gasto por proveedor</h3><div class="chartbox sm"><canvas id=prochart></canvas></div></div>' +
  '<div class=panel><h3>Materias primas: stock vs requerimiento del horizonte</h3>' +
  tabla([['Material', 0], ['Nombre', 0], ['Proveedor', 0], ['Lead time d', 1], ['MOQ', 1], ['Stock u', 1], ['Requerimiento u', 1], ['Deficit u', 1], ['Ordenes', 1]],
    MAT.map(m => ['<b>' + m.mat + '</b>', esc(m.nombre), esc(m.prov), m.lt, NUM(m.moq), NUM(m.stock), NUM(m.req),
      (m.def > 0 ? '<span class=urgente>' + NUM(m.def) + '</span>' : '0'), m.oc])) + '</div>' +
  '<div class=panel><h3>Plan de compras sugerido (MRP + EOQ)</h3><table><tr><th>Material</th><th>Mes req.</th><th>Cantidad</th><th>Costo</th><th>Ordenar el</th><th>Proveedor</th><th>Alerta</th></tr>' +
  D.compras.slice().sort((a, b) => (a.mes + a.material_id).localeCompare(b.mes + b.material_id)).map(c => '<tr><td>' + c.material_id + '</td><td>' + c.mes + '</td><td>' + NUM(c.cantidad) + '</td><td>' + CLP(c.costo_total) + '</td><td>' + c.fecha_orden + '</td><td>' + esc(c.proveedor) + '</td><td class=' + (String(c.alerta || '').indexOf('URGENTE') === 0 ? 'urgente' : 'razon') + '>' + esc(c.alerta || '') + '</td></tr>').join('') +
  '</table></div>' + optHtml(4);
new Chart(document.getElementById('prochart'), {
  type: 'doughnut',
  data: { labels: Object.keys(provs), datasets: [{ data: Object.values(provs), backgroundColor: ['#051C2C', '#2251FF', '#00A9F4', '#6B5AED', '#99A3AD', '#AAE6F0', '#5b6770'] }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
});

const ingMes = sumBy(D.pl, meses, 'ingresos');
const margenMes = sumBy(D.pl, meses, 'margen_bruto');
const vpMes = sumBy(D.pl, meses, 'venta_perdida');
document.getElementById('tab-fin').innerHTML =
  '<div class=cards>' +
  card('Ingresos', CLP(totIng), meses.length + ' meses') +
  card('Margen bruto', CLP(totMg), totIng ? N1(totMg / totIng * 100) + '% vs objetivo 45%' : '') +
  card('Venta perdida', CLP(totVP), 'oportunidad no capturada') +
  '</div>' +
  '<div class=panel><h3>P&L proyectado por mes</h3><div class=chartbox><canvas id=finchart></canvas></div></div>' +
  '<div class=panel><h3>Margen por familia</h3><table><tr><th>Familia</th><th>Ingresos</th><th>Margen bruto</th><th>Margen %</th><th>Venta perdida</th></tr>' +
  FAMS.map(f => {
    const rowsF = D.pl.filter(r => r.familia === f);
    if (!rowsF.length) return '';
    const ing = tot(rowsF, 'ingresos'), mg = tot(rowsF, 'margen_bruto'), vp = tot(rowsF, 'venta_perdida');
    return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + FAMCOLOR[f] + ';margin-right:6px"></span><b>' + f + '</b></td><td>' + CLP(ing) + '</td><td>' + CLP(mg) + '</td><td>' + (ing ? N1(mg / ing * 100) : 0) + '%</td><td>' + CLP(vp) + '</td></tr>';
  }).join('') + '</table></div>' + optHtml(5);
new Chart(document.getElementById('finchart'), {
  type: 'bar',
  data: { labels: meses, datasets: [
    { label: 'Ingresos', data: ingMes, backgroundColor: '#051C2C' },
    { label: 'Margen bruto', data: margenMes, backgroundColor: '#2251FF' },
    { label: 'Venta perdida', data: vpMes, backgroundColor: '#C00000' }
  ] },
  options: OPTL
});

document.getElementById('tab-mbr').innerHTML =
  '<div class=cards>' +
  card('Estado del plan', 'Conciliado', 'ver decisiones del ciclo') +
  card('Ingresos', CLP(resumen.ingresos_totales), 'margen ' + (resumen.margen_pct || 0) + '%') +
  card('Fill rate', (resumen.fill_rate_pct || 0) + '%', 'A ' + fillClase.A + '% · B ' + fillClase.B + '% · C ' + fillClase.C + '%') +
  '</div>' + optHtml(6) +
  '<div class=panel><h3>Decisiones consolidadas del comite</h3><ul style="font-size:13px;line-height:1.7">' + String(resumen.decisiones || '').split('|').map(x => '<li>' + esc(x.trim()) + '</li>').join('') + '</ul></div>';

const AGENTES = [
  { paso: 1, nom: 'Demand Planning', corto: 'Demanda', wf: 'IBP · 1', tabla: 'IBP_Forecast', color: '#2251FF',
    rol: 'Proyecta cuanto se va a vender por SKU y mes',
    entrega: 'Forecast consenso por SKU-mes',
    tareas: ['Leyendo 24 meses de historia de 100 SKUs', 'Ajustando regresion lineal y estacionalidad por SKU', 'Consultando a Gemini para el demand shaping', 'Desagregando el ajuste de familia a cada SKU', 'Guardando el forecast consenso'] },
  { paso: 2, nom: 'Supply Planning', corto: 'Supply', wf: 'IBP · 2', tabla: 'IBP_Plan_Produccion', color: '#00A9F4',
    rol: 'Decide cuanto producir y cuanto inventario mantener',
    entrega: 'Plan de produccion factible e inventarios proyectados',
    tareas: ['Calculando stock de seguridad por clase ABC', 'Neteando demanda contra inventario inicial', 'Evaluando capacidad por familia (RCCP)', 'Haciendo pre-build hacia los meses deficitarios', 'Guardando el plan de produccion'] },
  { paso: 3, nom: 'Scheduling Plantas', corto: 'Scheduling', wf: 'IBP · 6', tabla: 'IBP_Schedule', color: '#6B5AED',
    rol: 'Programa las lineas dia a dia minimizando cambios',
    entrega: 'Programa por linea con campanas y changeovers',
    tareas: ['Armando campanas por familia', 'Asignando lineas por costo unitario efectivo', 'Secuenciando con product wheel (claro a oscuro)', 'Calculando changeovers y turnos necesarios', 'Guardando el programa por linea'] },
  { paso: 4, nom: 'Procurement', corto: 'Compras', wf: 'IBP · 3', tabla: 'IBP_Plan_Compras', color: '#12805C',
    rol: 'Compra la materia prima a tiempo y al lote correcto',
    entrega: 'Plan de compras MRP con lotes y fechas de orden',
    tareas: ['Explotando el BOM por familia', 'Corriendo el MRP contra el stock actual', 'Loteando por MOQ y EOQ', 'Retrocediendo fechas por lead time', 'Guardando el plan de compras'] },
  { paso: 5, nom: 'Finanzas', corto: 'Finanzas', wf: 'IBP · 4', tabla: 'IBP_PL_Financiero', color: '#E8A33D',
    rol: 'Valoriza el plan y mide si cumple el margen objetivo',
    entrega: 'P&L proyectado y venta perdida valorizada',
    tareas: ['Valorizando ingresos y COGS por familia', 'Costeando el programa de plantas', 'Cuantificando la venta perdida por quiebre', 'Comparando contra el margen objetivo de 45%', 'Guardando el P&L proyectado'] },
  { paso: 6, nom: 'Conciliacion Ejecutiva', corto: 'Comite', wf: 'IBP · 5', tabla: 'IBP_Resumen_Ejecutivo', color: '#051C2C',
    rol: 'Concilia todo y deja las decisiones para el comite',
    entrega: 'Plan conciliado, decisiones y alertas',
    tareas: ['Contrastando demanda, supply y finanzas', 'Midiendo gaps contra la politica de servicio', 'Priorizando decisiones para el comite', 'Redactando las alertas del ciclo', 'Guardando el resumen ejecutivo'] }
];

function rutas(slug) {
  const list = [];
  try { if (location.pathname.indexOf('ibp-portal') >= 0) list.push(location.origin + location.pathname.split('ibp-portal').join(slug)); } catch (e) {}
  list.push('https://n8n-production-121a.up.railway.app/webhook/' + slug);
  return list.filter((x, i, a) => x && a.indexOf(x) === i);
}
async function pedir(slug, opts) {
  let ultimo = null;
  for (const url of rutas(slug)) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return await r.json();
      ultimo = new Error('HTTP ' + r.status);
    } catch (e) { ultimo = e; }
  }
  throw (ultimo || new Error('sin endpoint disponible'));
}

let flujoEstado = 'inicial';
let flujoRun = '';
let flujoT0 = 0;
let flujoTimer = null;
let flujoTareaTimer = null;
let flujoEtapas = AGENTES.map(a => ({ paso: a.paso, estado: 'pendiente' }));
let flujoLog = [];
let flujoTareaIdx = 0;

function flujoPintar() {
  const cont = document.getElementById('flujo-pipeline');
  if (!cont) return;
  cont.innerHTML = AGENTES.map((a, i) => {
    const e = flujoEtapas[i] || { estado: 'pendiente' };
    const st = e.estado;
    const nDec = (e.decisiones || []).length;
    let cuerpo = '';
    if (st === 'trabajando') {
      cuerpo = '<div class=ag-task><span class=ag-spin></span>' + esc(a.tareas[flujoTareaIdx % a.tareas.length]) + '</div>';
    } else if (st === 'listo') {
      cuerpo = '<div class=ag-ok>' + nDec + ' decision' + (nDec === 1 ? '' : 'es') + ' automatica' + (nDec === 1 ? '' : 's') + '</div>' +
        (e.decisiones || []).slice(0, 3).map(d => '<div class=ag-dec><b>' + esc(d.decision || '') + '</b>' + (d.impacto ? '<span> ' + esc(d.impacto) + '</span>' : '') + '</div>').join('');
    } else {
      cuerpo = '<div class=ag-wait>En espera</div>';
    }
    const flecha = i < AGENTES.length - 1
      ? '<div class="ag-arrow' + (st === 'listo' ? ' on' : '') + '"><div class=ag-arrow-l></div><div class=ag-arrow-t>' + (st === 'listo' ? 'entrega' : '') + '</div></div>'
      : '';
    return '<div class="ag-card ' + st + '" data-i="' + i + '" style="--c:' + a.color + '">' +
      '<div class=ag-head><span class=ag-num>' + a.paso + '</span><div><b>' + a.nom + '</b><div class=ag-wf>' + a.wf + ' &middot; ' + a.tabla + '</div></div>' +
      '<span class=ag-badge>' + (st === 'listo' ? 'listo' : (st === 'trabajando' ? 'trabajando' : 'pendiente')) + '</span></div>' +
      '<div class=ag-rol>' + esc(a.rol) + '</div>' +
      '<div class=ag-entrega>Entrega: <b>' + esc(a.entrega) + '</b></div>' +
      cuerpo +
      '</div>' + flecha;
  }).join('');
  const act = flujoEtapas.findIndex(e => e.estado === 'trabajando');
  const idx = act >= 0 ? act : flujoEtapas.filter(e => e.estado === 'listo').length - 1;
  if (idx >= 0) {
    const card = cont.querySelector('.ag-card[data-i="' + idx + '"]');
    if (card && cont.scrollWidth > cont.clientWidth) {
      cont.scrollTo({ left: Math.max(0, card.offsetLeft - cont.clientWidth / 2 + card.clientWidth / 2), behavior: 'smooth' });
    }
  }
}

function flujoLogPintar() {
  const el = document.getElementById('flujo-log');
  if (!el) return;
  el.innerHTML = flujoLog.map(l => '<div class=lg-row><span class=lg-t>' + l.t + '</span><span class="lg-p ' + l.tipo + '"></span><span class=lg-m>' + l.msg + '</span></div>').join('');
  el.scrollTop = el.scrollHeight;
}
function flujoAnotar(msg, tipo) {
  const s = Math.round((Date.now() - flujoT0) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  flujoLog.push({ t: mm + ':' + ss, msg: msg, tipo: tipo || 'info' });
  flujoLogPintar();
}
function flujoBarra() {
  const listos = flujoEtapas.filter(e => e.estado === 'listo').length;
  const pct = Math.round(listos / AGENTES.length * 100);
  const b = document.getElementById('flujo-bar');
  const t = document.getElementById('flujo-bar-txt');
  if (b) b.style.width = pct + '%';
  const s = Math.round((Date.now() - flujoT0) / 1000);
  if (t) t.textContent = listos + ' de ' + AGENTES.length + ' etapas &middot; ' + pct + '% &middot; ' + s + 's';
  if (t) t.innerHTML = listos + ' de ' + AGENTES.length + ' etapas &middot; ' + pct + '% &middot; ' + s + 's transcurridos';
}
function flujoBoton(txt, disabled) {
  const b = document.getElementById('flujo-play');
  if (!b) return;
  b.innerHTML = txt;
  b.disabled = !!disabled;
}
function flujoFin(okMsg) {
  clearInterval(flujoTimer); clearInterval(flujoTareaTimer);
  flujoTimer = null; flujoTareaTimer = null;
  const banner = document.getElementById('flujo-final');
  if (banner) {
    banner.style.display = 'block';
    banner.innerHTML = '<div class=fin-t>Ciclo IBP completado</div>' +
      '<div class=fin-s>' + okMsg + '</div>' +
      '<button class=fin-b id=fin-ir>Ver los resultados de este ciclo en los otros tabs &rarr;</button>';
    const bi = document.getElementById('fin-ir');
    if (bi) bi.onclick = function () { location.search = '?run_id=' + flujoRun; };
  }
  flujoBoton('Correr otro ciclo', false);
  flujoEstado = 'listo';
}

async function flujoPoll() {
  try {
    const j = await pedir('ibp-run-status?run_id=' + encodeURIComponent(flujoRun), { method: 'GET' });
    const previas = flujoEtapas.map(e => e.estado);
    flujoEtapas = (j.etapas && j.etapas.length) ? j.etapas : flujoEtapas;
    flujoEtapas.forEach((e, i) => {
      if (e.estado === 'listo' && previas[i] !== 'listo') {
        const a = AGENTES[i];
        flujoAnotar('<b>' + a.nom + '</b> cerro su etapa con ' + ((e.decisiones || []).length) + ' decisiones', 'ok');
        if (e.handoff) flujoAnotar('Traspaso a ' + (AGENTES[i + 1] ? AGENTES[i + 1].nom : 'el comite') + ': <i>' + esc(String(e.handoff).slice(0, 180)) + '</i>', 'pass');
        flujoTareaIdx = 0;
      }
      if (e.estado === 'trabajando' && previas[i] !== 'trabajando') {
        flujoAnotar('<b>' + AGENTES[i].nom + '</b> tomo el control', 'work');
      }
    });
    flujoPintar(); flujoBarra();
    if (j.finalizado) {
      flujoAnotar('Ciclo conciliado y publicado. Se envio la minuta ejecutiva por correo.', 'ok');
      flujoFin('Run <b>' + flujoRun + '</b> &middot; ' + (j.decisiones_acumuladas || 0) + ' decisiones automaticas en 6 etapas');
    }
  } catch (e) {
    flujoAnotar('Sin respuesta del runner (' + esc(e.message) + '). Reintentando...', 'err');
  }
}

async function flujoPlay() {
  if (flujoEstado === 'corriendo') return;
  flujoEstado = 'corriendo';
  flujoRun = '';
  flujoLog = [];
  flujoTareaIdx = 0;
  flujoEtapas = AGENTES.map(a => ({ paso: a.paso, estado: 'pendiente' }));
  flujoT0 = Date.now();
  const banner = document.getElementById('flujo-final');
  if (banner) banner.style.display = 'none';
  flujoBoton('<span class=ag-spin></span> Ciclo en curso...', true);
  flujoPintar(); flujoBarra();
  flujoAnotar('Lanzando el orquestador S&OP en n8n...', 'info');
  try {
    const j = await pedir('ibp-run-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horizonte_meses: 6 })
    });
    flujoRun = j.run_id || '';
    if (!flujoRun) throw new Error('el runner no devolvio run_id');
    flujoAnotar('Ciclo <b>' + flujoRun + '</b> iniciado. Los 6 agentes corren en cadena, cada uno alimenta al siguiente.', 'ok');
    const rid = document.getElementById('flujo-runid');
    if (rid) rid.innerHTML = 'Run en curso: <b>' + flujoRun + '</b>';
    flujoEtapas[0].estado = 'trabajando';
    flujoPintar();
    flujoAnotar('<b>' + AGENTES[0].nom + '</b> tomo el control', 'work');
    flujoTareaTimer = setInterval(() => { flujoTareaIdx++; flujoPintar(); flujoBarra(); }, 2600);
    flujoTimer = setInterval(flujoPoll, 3000);
    flujoPoll();
  } catch (e) {
    flujoAnotar('No pude lanzar el ciclo: ' + esc(e.message), 'err');
    flujoBoton('Reintentar', false);
    flujoEstado = 'inicial';
  }
}

document.getElementById('tab-flujo').innerHTML =
  '<div class=panel><h3>Como trabajan los agentes del ciclo IBP <small>aprieta play y sigue el traspaso en vivo</small></h3>' +
  '<p style="font-size:13.5px;line-height:1.6;margin:0 0 14px">El ciclo S&OP no lo corre una persona: lo corren <b>seis agentes autonomos encadenados</b> en n8n. ' +
  'Cada uno resuelve su problema de optimizacion, escribe su resultado en una tabla y se lo <b>entrega al siguiente</b>, que parte de ahi. ' +
  'Al final, el comite recibe un plan ya conciliado con las decisiones tomadas y justificadas. Aprieta play para lanzar un ciclo real y verlo ocurrir.</p>' +
  '<div class=flujo-ctrl>' +
  '<button id=flujo-play class=play onclick="flujoPlay()">&#9654;&nbsp; Correr el ciclo IBP completo</button>' +
  '<span id=flujo-runid class=razon></span>' +
  '</div>' +
  '<div class=flujo-bar-wrap><div id=flujo-bar class=flujo-bar></div></div>' +
  '<div id=flujo-bar-txt class=razon style="margin-top:6px">Sin ejecutar</div>' +
  '</div>' +
  '<div id=flujo-final class=fin></div>' +
  '<div class=panel><h3>Cadena de agentes</h3><div id=flujo-pipeline class=pipeline></div></div>' +
  '<div class=panel><h3>Bitacora del ciclo <small>lo que va ocurriendo en n8n, en tiempo real</small></h3>' +
  '<div id=flujo-log class=logbox><div class=razon>Aun no has lanzado un ciclo. Aprieta play arriba.</div></div></div>' +
  '<div class=panel><h3>Que hace cada agente</h3>' +
  tabla([['#', 1], ['Agente', 0], ['Workflow', 0], ['Que resuelve', 0], ['Que entrega', 0], ['Tabla que escribe', 0]],
    AGENTES.map(a => [a.paso, '<b>' + a.nom + '</b>', a.wf, esc(a.rol), esc(a.entrega), '<code style="font-size:11.5px">' + a.tabla + '</code>'])) +
  '<p class=razon style="margin-top:8px">Entre agente y agente corre ademas el agente de gobernanza (IBP &middot; 7), que documenta la etapa: la logica que aplico el motor, las decisiones automaticas con su justificacion, los riesgos y el traspaso formal a la etapa siguiente. Eso es lo que ves en la bitacora y en las minutas de cada tab.</p></div>';
flujoPintar();


const SESSION = 'portal-' + D.run + '-' + Math.random().toString(36).slice(2, 10);
const SUGERENCIAS = [
  'Que SKUs tienen el nivel de inventario mas bajo y por que?',
  'Cuales son las proyecciones mas raras u outliers de este ciclo?',
  'Donde esta la mayor criticidad de servicio y cuanto cuesta?',
  'Que materias primas estan en riesgo de quiebre?',
  'Resumeme el ciclo en 5 bullets para el comite',
  'Que linea de produccion esta mas apretada de capacidad?'
];
let chatBusy = false;
function toggleChat(open) {
  const p = document.getElementById('chatpanel');
  p.className = open ? 'open' : '';
  if (open) document.getElementById('chatinput').focus();
}
function mdToHtml(md) {
  let s = esc(md);
  const lines = s.split('\\n');
  let out = [], tbl = [], inList = false, inOl = false;
  const flushTbl = () => {
    if (!tbl.length) return;
    const parse = r => r.replace(/^\\s*\\|/, '').replace(/\\|\\s*$/, '').split('|').map(c => c.trim());
    const head = parse(tbl[0]);
    const body = tbl.slice(1).filter(r => !/^\\s*\\|?[\\s:|-]+\\|?\\s*$/.test(r)).map(parse);
    let t = '<table><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr>';
    t += body.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('');
    out.push(t + '</table>');
    tbl = [];
  };
  const closeLists = () => { if (inList) { out.push('</ul>'); inList = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
  lines.forEach(ln => {
    if (/^\\s*\\|.*\\|\\s*$/.test(ln)) { closeLists(); tbl.push(ln); return; }
    flushTbl();
    if (/^\\s*[-*]\\s+/.test(ln)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + ln.replace(/^\\s*[-*]\\s+/, '') + '</li>'); return;
    }
    if (/^\\s*\\d+[.)]\\s+/.test(ln)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push('<li>' + ln.replace(/^\\s*\\d+[.)]\\s+/, '') + '</li>'); return;
    }
    closeLists();
    if (/^\\s*#{1,6}\\s+/.test(ln)) { out.push('<p><b>' + ln.replace(/^\\s*#{1,6}\\s+/, '') + '</b></p>'); return; }
    if (!ln.trim()) return;
    out.push('<p>' + ln + '</p>');
  });
  flushTbl(); closeLists();
  return out.join('')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
}
function addMsg(who, txt, isMd) {
  const log = document.getElementById('chatlog');
  const d = document.createElement('div');
  d.className = 'msg' + (who === 'me' ? ' me' : '');
  d.innerHTML = '<div class=who>' + (who === 'me' ? 'Tu' : 'Analista IBP') + '</div><div class=txt>' + (isMd ? mdToHtml(txt) : esc(txt)) + '</div>';
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
function renderSug() {
  const c = document.getElementById('chatsug');
  c.innerHTML = '';
  SUGERENCIAS.forEach(s => {
    const b = document.createElement('button');
    b.textContent = s;
    b.onclick = () => { document.getElementById('chatinput').value = s; enviarChat(null); };
    c.appendChild(b);
  });
}
async function enviarChat(ev) {
  if (ev) ev.preventDefault();
  if (chatBusy) return false;
  const inp = document.getElementById('chatinput');
  const pregunta = inp.value.trim();
  if (!pregunta) return false;
  inp.value = '';
  addMsg('me', pregunta, false);
  chatBusy = true;
  document.getElementById('chatsend').disabled = true;
  const pend = addMsg('bot', 'Analizando el ciclo...', false);
  pend.querySelector('.txt').className = 'txt thinking';
  try {
    const j = await pedir('ibp-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: pregunta, run_id: D.run, session_id: SESSION })
    });
    const txt = (j && (j.respuesta || j.answer)) || 'No recibi respuesta del analista.';
    pend.querySelector('.txt').className = 'txt';
    pend.querySelector('.txt').innerHTML = mdToHtml(txt);
  } catch (e) {
    pend.querySelector('.txt').className = 'txt';
    pend.querySelector('.txt').innerHTML = esc('No pude contactar al analista IA (' + e.message + '). Verifica que el workflow "IBP 9 - Chatbot Analista" este publicado en n8n.');
  }
  chatBusy = false;
  document.getElementById('chatsend').disabled = false;
  document.getElementById('chatlog').scrollTop = document.getElementById('chatlog').scrollHeight;
  return false;
}
document.getElementById('chatinput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(null); }
});
renderSug();
addMsg('bot', 'Hola. Soy el analista IBP de este ciclo (**run ' + D.run + '**). Tengo cargado el resultado completo: forecast, plan de supply, inventarios, scheduling, compras y finanzas de los ' + SK.length + ' SKUs.\\n\\nPreguntame lo que necesites, por ejemplo por criticidad, niveles de inventario, outliers de proyeccion o el estado de un SKU puntual.', true);

show('r360');
drawDem('TOTAL');
</script>
</body>
</html>`;
return [{ json: { html: html } }];

