/* Calculadora de elasticidad-precio.
   DATOS: [{r:retailer, n:nombre, p:precio, u:precio_por_unidad, m:unidad}]
   TERMINO: string buscado.

   Distingue lo que se MIDE de lo que se SUPONE:
   - Con datos de volumen, la elasticidad se estima por regresion log-log (metodo
     estandar en pricing: ln Q = a + e*ln P, donde e ES la elasticidad).
   - Sin volumen, un barrido de precios NO permite estimarla. Lo que si permite,
     y es practica establecida (Nagle & Holden), es el analisis de break-even:
     cuanto tendria que crecer el volumen para que un cambio de precio se pague.
*/
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var CLP = function (n) {
    return (n == null || isNaN(n)) ? "—" : "$" + Math.round(n).toLocaleString("es-CL");
  };
  var PCT = function (n, d) {
    return (n == null || !isFinite(n)) ? "—" : (n * 100).toFixed(d == null ? 1 : d) + "%";
  };

  /* ---------- Estadistica de la muestra capturada ---------- */
  var base = DATOS.filter(function (d) { return d.u; });        // comparables por unidad
  var usaUnidad = base.length >= 3;
  var serie = (usaUnidad ? base.map(function (d) { return d.u; })
                         : DATOS.map(function (d) { return d.p; })).filter(function (x) { return x > 0; });
  serie.sort(function (a, b) { return a - b; });

  function mediana(s) {
    if (!s.length) return null;
    var n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  var med = mediana(serie);
  var media = serie.length ? serie.reduce(function (a, b) { return a + b; }, 0) / serie.length : null;
  var sd = serie.length > 1
    ? Math.sqrt(serie.reduce(function (a, b) { return a + Math.pow(b - media, 2); }, 0) / (serie.length - 1))
    : null;
  var cv = (sd && media) ? sd / media : null;
  var unidad = usaUnidad ? ("/" + (base[0].m || "un")) : "";

  /* ---------- Regresion log-log: ln Q = a + e*ln P ---------- */
  function regresion(pares) {
    var n = pares.length;
    if (n < 3) return { error: "Se necesitan al menos 3 observaciones." };
    var x = pares.map(function (p) { return Math.log(p[0]); });
    var y = pares.map(function (p) { return Math.log(p[1]); });
    var mx = x.reduce(function (a, b) { return a + b; }, 0) / n;
    var my = y.reduce(function (a, b) { return a + b; }, 0) / n;
    var sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sxx += Math.pow(x[i] - mx, 2); sxy += (x[i] - mx) * (y[i] - my); }
    if (sxx === 0) return { error: "Todos los precios son iguales: no hay variacion que explique el volumen." };
    var e = sxy / sxx;
    var a = my - e * mx;
    var sres = 0, stot = 0;
    for (var j = 0; j < n; j++) {
      sres += Math.pow(y[j] - (a + e * x[j]), 2);
      stot += Math.pow(y[j] - my, 2);
    }
    var r2 = stot ? 1 - sres / stot : null;
    var se = n > 2 ? Math.sqrt((sres / (n - 2)) / sxx) : null;
    // t critico al 95% aproximado segun grados de libertad
    var TC = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23 };
    var gl = n - 2;
    var tc = TC[gl] || (gl > 30 ? 1.96 : 2.09);
    return { e: e, r2: r2, se: se, n: n, ic: se ? [e - tc * se, e + tc * se] : null, t: se ? e / se : null };
  }

  /* ---------- Break-even de Nagle: %DQ necesario para que un cambio de precio se pague ---------- */
  function breakEven(margen, d) {          // margen y d en fraccion
    if (margen + d === 0) return null;
    return -d / (d + margen);
  }
  function elasticidadUmbral(margen, d) {  // elasticidad a la que el cambio es indiferente
    var q = breakEven(margen, d);
    return (q == null || d === 0) ? null : q / d;
  }
  function precioOptimo(costo, e) {        // Lerner con elasticidad constante
    return (e < -1) ? costo * (e / (1 + e)) : null;
  }

  var PRIORES = [
    ["Bebidas gaseosas / carbonatadas", -3.8, -1.5, "Categoria muy promocionada, marcas sustituibles."],
    ["Snacks y galletas", -3.0, -1.2, "Compra por impulso, alta sustitucion entre marcas."],
    ["Lacteos (leche liquida)", -1.5, -0.6, "Compra de rutina; la leche blanca es casi commodity."],
    ["Frutas y verduras frescas", -1.2, -0.4, "Poca fidelidad de marca, pero demanda de base estable."],
    ["Despensa basica (arroz, fideos, aceite)", -1.0, -0.3, "Bien de primera necesidad: demanda rigida."],
    ["Limpieza y aseo del hogar", -2.2, -0.9, "Stock-up: el consumidor adelanta compra en promocion."]
  ];

  /* ---------- Render ---------- */
  var h = "";
  h += '<div class="aviso"><b>Que se puede y que no se puede medir con este barrido.</b> ' +
       'Un barrido de precios no contiene volumenes de venta, y sin volumen la elasticidad no se estima: se supone. ' +
       'Abajo hay dos caminos. El <b>A</b> es el metodo estandar (regresion log-log) y necesita que pegues tus datos de venta. ' +
       'El <b>B</b> no necesita volumen y responde la pregunta que de verdad decide un cambio de precio: ' +
       'cuanto tendria que crecer la unidad para que el cambio se pague.</div>';

  h += '<div class="kpi">' +
       '<div><div class="l">Precio mediano' + (usaUnidad ? " por unidad" : "") + '</div><div class="v">' + CLP(med) + unidad + '</div></div>' +
       '<div><div class="l">Minimo</div><div class="v">' + CLP(serie[0]) + unidad + '</div></div>' +
       '<div><div class="l">Maximo</div><div class="v">' + CLP(serie[serie.length - 1]) + unidad + '</div></div>' +
       '<div><div class="l">Dispersion (CV)</div><div class="v">' + PCT(cv) + '</div></div>' +
       '</div>';
  h += '<div class="foot" style="margin:-6px 0 20px">Sobre ' + serie.length + ' observaciones de "' + TERMINO + '". ' +
       'La dispersion es una senal indirecta: cuando los precios de un mismo producto convergen entre cadenas, ' +
       'suele indicar una categoria transparente y sensible al precio; cuando se abren, hay mas espacio para cobrar distinto. ' +
       'Es un indicio de contexto competitivo, no una elasticidad.</div>';

  /* --- A. Regresion --- */
  h += '<div class="card"><h2>A · Estimar la elasticidad con tus datos de venta</h2>' +
       '<p style="font-size:13px;margin:0 0 12px">Metodo log-log, el estandar de la industria: <code>ln Q = a + ε · ln P</code>. ' +
       'El coeficiente ε <b>es</b> la elasticidad. Pega una observacion por linea, <code>precio,volumen</code> ' +
       '(semanas, meses o tiendas distintas). Minimo 3; con menos de 8 el intervalo sera muy ancho.</p>' +
       '<textarea id="obs" placeholder="1490,1200&#10;1290,1580&#10;1690,890&#10;1390,1350"></textarea>' +
       '<div style="margin-top:10px"><button id="btn-reg" type="button">Estimar elasticidad</button></div>' +
       '<div id="out-reg" style="margin-top:14px"></div></div>';

  /* --- B. Break-even --- */
  h += '<div class="card"><h2>B · Break-even: sin datos de volumen</h2>' +
       '<p style="font-size:13px;margin:0 0 12px">Regla de Nagle &amp; Holden. Con tu margen de contribucion, ' +
       'calcula cuanto volumen necesitas ganar (o cuanto puedes perder) para que el cambio de precio sea neutro en utilidad.</p>' +
       '<div class="campos">' +
       '<div><label>Precio actual ($)</label><input type="number" id="p0" value="' + (med ? Math.round(med) : 1000) + '"></div>' +
       '<div><label>Costo unitario ($)</label><input type="number" id="c0" value="' + (med ? Math.round(med * 0.7) : 700) + '"></div>' +
       '<div><label>Cambio de precio (%)</label><input type="number" id="d0" value="-10" step="1"></div>' +
       '</div><div id="out-be"></div></div>';

  /* --- C. Priores --- */
  h += '<div class="card"><h2>C · Rangos de referencia por categoria</h2>' +
       '<p style="font-size:13px;margin:0 0 12px">Ordenes de magnitud tipicos en retail de consumo masivo, para acotar un supuesto ' +
       'mientras no tengas datos propios. Uselos como punto de partida, nunca como resultado.</p>' +
       '<table><thead><tr><th>Categoria</th><th class="num">Elastica</th><th class="num">Rigida</th><th>Por que</th></tr></thead><tbody>';
  PRIORES.forEach(function (p) {
    h += '<tr><td>' + p[0] + '</td><td class="num">' + p[1].toFixed(1) + '</td><td class="num">' + p[2].toFixed(1) +
         '</td><td style="font-size:13px;color:#666">' + p[3] + '</td></tr>';
  });
  h += '</tbody></table><div class="foot">Un valor de −2,0 significa que subir 1% el precio baja 2% las unidades. ' +
       'Entre −1 y 0 la demanda es rigida y subir precio sube ingreso; bajo −1 es elastica y bajar precio puede compensarse en volumen.</div></div>';

  $("elast-contenido").innerHTML = h;

  /* ---------- Interaccion ---------- */
  function pintarBE() {
    var p = parseFloat($("p0").value), c = parseFloat($("c0").value), dp = parseFloat($("d0").value);
    var o = $("out-be");
    if (!(p > 0) || !(c >= 0) || isNaN(dp)) { o.innerHTML = '<div class="foot">Completa los tres campos.</div>'; return; }
    if (c >= p) { o.innerHTML = '<div class="aviso">El costo iguala o supera el precio: no hay margen que defender.</div>'; return; }
    var m = (p - c) / p, d = dp / 100;
    var q = breakEven(m, d), eu = elasticidadUmbral(m, d);
    var pNuevo = p * (1 + d);
    var textoDir = d < 0
      ? "Necesitas vender <b>" + PCT(q) + "</b> mas unidades para no perder utilidad."
      : "Puedes permitirte perder hasta <b>" + PCT(-q) + "</b> de las unidades sin perder utilidad.";
    var lectura = d < 0
      ? "Si tu elasticidad real es <b>mas negativa</b> que " + eu.toFixed(2) + ", la baja se paga sola."
      : "Si tu elasticidad real es <b>menos negativa</b> que " + eu.toFixed(2) + ", la subida conviene.";
    var out = '<div class="kpi">' +
      '<div><div class="l">Margen de contribucion</div><div class="v">' + PCT(m) + '</div></div>' +
      '<div><div class="l">Precio nuevo</div><div class="v">' + CLP(pNuevo) + '</div></div>' +
      '<div><div class="l">Δ volumen break-even</div><div class="v">' + PCT(q) + '</div></div>' +
      '<div><div class="l">Elasticidad umbral</div><div class="v">' + eu.toFixed(2) + '</div></div>' +
      '</div><p style="font-size:13px">' + textoDir + " " + lectura + '</p>';

    var eSup = window.__eEstimada;
    if (eSup && eSup < -1) {
      var po = precioOptimo(c, eSup);
      out += '<h3>Precio optimo con la elasticidad estimada (ε = ' + eSup.toFixed(2) + ')</h3>' +
        '<p style="font-size:13px">Regla de Lerner con elasticidad constante, <code>P* = C · ε/(1+ε)</code>: ' +
        '<b>' + CLP(po) + '</b> (' + (po > p ? "+" : "") + PCT(po / p - 1) + ' vs. el precio actual). ' +
        'Supone elasticidad constante en el tramo y no considera reaccion de la competencia.</p>';
    }
    o.innerHTML = out;
  }

  ["p0", "c0", "d0"].forEach(function (id) { $(id).addEventListener("input", pintarBE); });
  pintarBE();

  $("btn-reg").addEventListener("click", function () {
    var lineas = $("obs").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    var pares = [];
    for (var i = 0; i < lineas.length; i++) {
      var t = lineas[i].split(/[,;\t]+/);
      var p = parseFloat(String(t[0]).replace(/[^\d.,-]/g, "").replace(",", "."));
      var qv = parseFloat(String(t[1]).replace(/[^\d.,-]/g, "").replace(",", "."));
      if (p > 0 && qv > 0) pares.push([p, qv]);
    }
    var r = regresion(pares);
    var o = $("out-reg");
    if (r.error) { o.innerHTML = '<div class="aviso">' + r.error + " Se leyeron " + pares.length + " pares validos.</div>"; return; }
    window.__eEstimada = r.e;
    var calidad = r.r2 > 0.7 ? "buen ajuste" : (r.r2 > 0.4 ? "ajuste moderado" : "ajuste debil");
    var signif = (r.ic && r.ic[1] < 0) ? "El intervalo no cruza cero: la relacion precio-volumen es estadisticamente distinguible de cero."
                                       : "El intervalo cruza cero: con estos datos no se puede afirmar que el precio explique el volumen.";
    o.innerHTML = '<div class="kpi">' +
      '<div><div class="l">Elasticidad ε</div><div class="v">' + r.e.toFixed(2) + '</div></div>' +
      '<div><div class="l">R²</div><div class="v">' + r.r2.toFixed(2) + '</div></div>' +
      '<div><div class="l">Error estandar</div><div class="v">' + r.se.toFixed(2) + '</div></div>' +
      '<div><div class="l">Observaciones</div><div class="v">' + r.n + '</div></div>' +
      '</div>' +
      '<p style="font-size:13px">Intervalo de confianza 95%: <b>[' + r.ic[0].toFixed(2) + ", " + r.ic[1].toFixed(2) + ']</b> · ' + calidad + '. ' + signif + '</p>' +
      '<p style="font-size:13px">' + (r.e < -1
        ? "Demanda <b>elastica</b>: bajar precio puede aumentar el ingreso total."
        : (r.e < 0 ? "Demanda <b>rigida</b>: subir precio aumenta el ingreso total."
                   : "Coeficiente positivo: revisa los datos, normalmente indica que otra variable (estacionalidad, quiebre de stock, promocion) esta dominando.")) +
      '</p><p class="foot">La estimacion asume que el precio es la unica causa del cambio de volumen. Si en esas semanas hubo ' +
      'publicidad, quiebres de stock o cambios de exhibicion, la elasticidad sale contaminada.</p>';
    pintarBE();
  });
})();
