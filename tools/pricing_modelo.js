/* Modelo de pricing: elasticidad y movimiento de precio.
   Expone window.PricingModelo con render(contenedor, datos, termino).

   Distingue siempre lo que se MIDE de lo que se SUPONE:
   - Con volumen real, la elasticidad se estima por regresion log-log
     (ln Q = a + e*ln P, donde e ES la elasticidad). Es el metodo estandar.
   - Sin volumen, un barrido de precios NO permite estimarla. Lo que si permite,
     y es practica establecida (Nagle & Holden), es el break-even: cuanto tendria
     que moverse el volumen para que un cambio de precio se pague solo.

   El volumen que usa la simulacion es un SUPUESTO editable: sirve para escalar
   la utilidad a pesos, no para justificar la elasticidad.
*/
(function () {
  var estado = { epsilon: null, origenEpsilon: null, datos: [], termino: '', p0: null, unidad: '' };

  var CLP = function (n) {
    return (n == null || isNaN(n) || !isFinite(n)) ? '—' : '$' + Math.round(n).toLocaleString('es-CL');
  };
  var PCT = function (n, d) {
    return (n == null || !isFinite(n)) ? '—' : (n * 100).toFixed(d == null ? 1 : d) + '%';
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* ---------------- Estadistica de la muestra ---------------- */
  var CADENAS = /lider|jumbo|santa\s*isabel|santaisabel|unimarc|alvi|tottus|acuenta|mayorista\s*10|erbi|montserrat/i;

  function mediana(s) {
    if (!s.length) return null;
    var n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  /* Un barrido trae mayoristas, insumos y nombres cuya medida se lee mal
     ("0,5 g"), que disparan el precio por unidad. Se acotan por rango
     intercuartil: esa mediana alimenta el break-even y un maximo absurdo
     lo invalida. */
  function sinAtipicos(s) {
    if (s.length < 8) return { datos: s, fuera: 0 };
    var q = function (p) {
      var i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return s[lo] + (s[hi] - s[lo]) * (i - lo);
    };
    var q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    var min = q1 - 1.5 * iqr, max = q3 + 1.5 * iqr;
    var d = s.filter(function (x) { return x >= min && x <= max; });
    return { datos: d.length >= 3 ? d : s, fuera: d.length >= 3 ? s.length - d.length : 0 };
  }

  function resumirMuestra(datos) {
    var deCadena = datos.filter(function (d) { return CADENAS.test(d.retailer || ''); });
    var muestra = deCadena.length >= 5 ? deCadena : datos;
    var soloCadenas = muestra === deCadena && deCadena.length < datos.length;

    /* Un mismo termino trae liquidos y solidos ("aceite de palta" junto a
       "palta hass"). Mezclar $/L con $/kg en una mediana no significa nada:
       se resume sobre la unidad dominante. */
    var conUnidad = muestra.filter(function (d) { return d.precio_por_unidad && d.unidad; });
    var frec = {};
    conUnidad.forEach(function (d) { frec[d.unidad] = (frec[d.unidad] || 0) + 1; });
    var uniDom = Object.keys(frec).sort(function (a, b) { return frec[b] - frec[a]; })[0];
    var base = conUnidad.filter(function (d) { return d.unidad === uniDom; });
    var usaUnidad = base.length >= 3;
    var nOtra = usaUnidad ? conUnidad.length - base.length : 0;

    var cruda = (usaUnidad ? base.map(function (d) { return d.precio_por_unidad; })
                           : muestra.map(function (d) { return d.precio; })).filter(function (x) { return x > 0; });
    cruda.sort(function (a, b) { return a - b; });
    var limpio = sinAtipicos(cruda);
    var serie = limpio.datos;
    var media = serie.length ? serie.reduce(function (a, b) { return a + b; }, 0) / serie.length : null;
    var sd = serie.length > 1
      ? Math.sqrt(serie.reduce(function (a, b) { return a + Math.pow(b - media, 2); }, 0) / (serie.length - 1)) : null;
    return {
      serie: serie, mediana: mediana(serie), min: serie[0], max: serie[serie.length - 1],
      cv: (sd && media) ? sd / media : null, unidad: usaUnidad ? uniDom : '',
      usaUnidad: usaUnidad, nFuera: limpio.fuera, nOtraUnidad: nOtra, soloCadenas: soloCadenas
    };
  }

  /* ---------------- Regresion log-log ---------------- */
  function regresion(pares) {
    var n = pares.length;
    if (n < 3) return { error: 'Se necesitan al menos 3 observaciones.' };
    var x = pares.map(function (p) { return Math.log(p[0]); });
    var y = pares.map(function (p) { return Math.log(p[1]); });
    var mx = x.reduce(function (a, b) { return a + b; }, 0) / n;
    var my = y.reduce(function (a, b) { return a + b; }, 0) / n;
    var sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sxx += Math.pow(x[i] - mx, 2); sxy += (x[i] - mx) * (y[i] - my); }
    if (sxx === 0) return { error: 'Todos los precios son iguales: no hay variacion que explique el volumen.' };
    var e = sxy / sxx, a = my - e * mx, sres = 0, stot = 0;
    for (var j = 0; j < n; j++) {
      sres += Math.pow(y[j] - (a + e * x[j]), 2);
      stot += Math.pow(y[j] - my, 2);
    }
    var r2 = stot ? 1 - sres / stot : null;
    var se = n > 2 ? Math.sqrt((sres / (n - 2)) / sxx) : null;
    var TC = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23 };
    var gl = n - 2, tc = TC[gl] || (gl > 30 ? 1.96 : 2.09);
    return { e: e, r2: r2, se: se, n: n, ic: se ? [e - tc * se, e + tc * se] : null };
  }

  /* ---------------- Reglas de decision ---------------- */
  function breakEven(margen, d) {            // %DQ para que el cambio sea neutro
    if (margen + d === 0) return null;
    return -d / (d + margen);
  }
  function elasticidadUmbral(margen, d) {    // elasticidad de indiferencia
    var q = breakEven(margen, d);
    return (q == null || d === 0) ? null : q / d;
  }
  function precioOptimo(costo, e) {          // Lerner con elasticidad constante
    return (e < -1) ? costo * (e / (1 + e)) : null;
  }

  var PRIORES = [
    ['Bebidas gaseosas', -2.5, -3.8, -1.5, 'Muy promocionada, marcas sustituibles.'],
    ['Snacks y galletas', -2.0, -3.0, -1.2, 'Compra por impulso, alta sustitucion.'],
    ['Lacteos (leche liquida)', -1.0, -1.5, -0.6, 'Compra de rutina, casi commodity.'],
    ['Frutas y verduras', -0.8, -1.2, -0.4, 'Poca fidelidad de marca, demanda base estable.'],
    ['Despensa basica', -0.6, -1.0, -0.3, 'Primera necesidad: demanda rigida.'],
    ['Limpieza y aseo', -1.5, -2.2, -0.9, 'Stock-up: se adelanta compra en promocion.']
  ];

  function prior(termino) {
    var t = (termino || '').toLowerCase();
    if (/coca|pepsi|bebida|gaseosa|sprite|fanta/.test(t)) return PRIORES[0];
    if (/galleta|snack|papas|ramitas|dulce/.test(t)) return PRIORES[1];
    if (/leche|yogur|queso|lacteo|mantequilla/.test(t)) return PRIORES[2];
    if (/lechuga|palta|tomate|platano|manzana|papa|cebolla|zanahoria|fruta|verdura/.test(t)) return PRIORES[3];
    if (/arroz|fideo|aceite|azucar|harina|legumbre/.test(t)) return PRIORES[4];
    if (/detergente|cloro|limpieza|jabon|shampoo/.test(t)) return PRIORES[5];
    return PRIORES[3];
  }

  /* ================= PESTAÑA: ELASTICIDAD ================= */
  function renderElasticidad(cont, datos, termino) {
    if (!datos || !datos.length) {
      cont.innerHTML = '<div class="card"><h2>Elasticidad</h2><div class="aviso">' +
        'Primero barre un producto en la pestaña <b>Buscador de SKU</b>. La elasticidad se calcula sobre ese set.</div></div>';
      return;
    }
    var m = resumirMuestra(datos);
    var pr = prior(termino);
    estado.datos = datos; estado.termino = termino;
    estado.p0 = m.usaUnidad ? m.mediana : m.mediana;
    estado.unidad = m.usaUnidad ? ('/' + m.unidad) : '';
    if (estado.epsilon == null) { estado.epsilon = pr[1]; estado.origenEpsilon = 'supuesto'; }

    var h = '';
    h += '<div class="card"><h2>Qué se puede medir con este barrido</h2>' +
      '<div class="aviso"><b>Un barrido de precios no contiene unidades vendidas.</b> Sin volumen la elasticidad ' +
      'no se estima: se supone. Abajo hay tres caminos, y el panel te dice siempre en cuál estás. ' +
      'Lo que sí se decide sin volumen es el <b>break-even</b>: cuánto tendría que moverse la unidad para que el cambio se pague.</div>' +
      '<div class="kpi">' +
      '<div><div class="l">Precio mediano' + (m.usaUnidad ? ' por unidad' : '') + '</div><div class="v">' + CLP(m.mediana) + esc(estado.unidad) + '</div></div>' +
      '<div><div class="l">Mínimo</div><div class="v">' + CLP(m.min) + esc(estado.unidad) + '</div></div>' +
      '<div><div class="l">Máximo</div><div class="v">' + CLP(m.max) + esc(estado.unidad) + '</div></div>' +
      '<div><div class="l">Dispersión (CV)</div><div class="v">' + PCT(m.cv) + '</div></div>' +
      '</div>' +
      '<div class="foot">Sobre ' + m.serie.length + ' observaciones de "' + esc(termino) + '"' +
      (m.soloCadenas ? ', acotadas a cadenas de supermercado' : '') +
      (m.nOtraUnidad ? ', dejando fuera ' + m.nOtraUnidad + ' medidas en otra unidad' : '') +
      (m.nFuera ? ', tras descartar ' + m.nFuera + ' atípicas por rango intercuartil' : '') + '. ' +
      'La dispersión es una señal indirecta: cuando los precios de un mismo producto convergen entre cadenas, ' +
      'la categoría suele ser transparente y sensible al precio. Es contexto competitivo, no una elasticidad.</div></div>';

    /* --- Camino 1: supuesto (el activo por defecto) --- */
    h += '<div class="card"><h2>1 · Elasticidad supuesta <span class="tag" style="border-color:#E8A020;color:#8a5d00">activo</span></h2>' +
      '<div class="note">Punto de partida por categoría, ajustable. Este es el ε que alimenta la pestaña de movimiento de precio ' +
      'mientras no cargues ventas reales.</div>' +
      '<div class="campos">' +
      '<div><label>Categoría detectada</label><input type="text" id="e-cat" value="' + esc(pr[0]) + '" readonly></div>' +
      '<div><label>Elasticidad ε supuesta</label><input type="number" id="e-eps" step="0.1" value="' + pr[1] + '"></div>' +
      '<div><label>Rango típico</label><input type="text" id="e-rango" value="' + pr[3] + ' a ' + pr[2] + '" readonly></div>' +
      '<div><label>Volumen mensual asumido (un)</label><input type="number" id="e-vol" step="100" value="1000"></div>' +
      '</div>' +
      '<div class="foot">' + esc(pr[4]) + ' Un ε de −2,0 significa que subir 1% el precio baja 2% las unidades. ' +
      'Entre −1 y 0 la demanda es rígida y subir precio sube ingreso; bajo −1 es elástica. ' +
      '<b>El volumen es un supuesto para escalar la utilidad a pesos: no influye en el ε ni en el break-even.</b></div></div>';

    /* --- Camino 2: medido --- */
    h += '<div class="card"><h2>2 · Elasticidad medida con tus ventas</h2>' +
      '<div class="note">Método log-log, el estándar de la industria: <code>ln Q = a + ε · ln P</code>. ' +
      'Pega una observación por línea, <code>precio,unidades</code> (semanas, meses o tiendas distintas). ' +
      'Mínimo 3; bajo 8 el intervalo sale muy ancho.</div>' +
      '<textarea id="e-obs" placeholder="1490,1200&#10;1290,1580&#10;1690,890&#10;1390,1350"></textarea>' +
      '<div style="margin-top:10px"><button type="button" class="chip-link" id="e-btn">Estimar elasticidad y usarla</button></div>' +
      '<div id="e-out" style="margin-top:12px"></div></div>';

    /* --- Camino 3: proxy --- */
    h += '<div class="card"><h2>3 · Proxy sin ventas: panel de precios × interés de búsqueda</h2>' +
      '<div class="note">Cada corrida diaria commitea los precios al repositorio, así que el histórico se está ' +
      'construyendo solo. Cruzado con el interés de búsqueda de Google Trends (verificado: 53 semanas para Chile) ' +
      'da una elasticidad-proxy de demanda.</div>' +
      '<div class="aviso"><b>Aún no da señal.</b> El panel lleva 12 días y sólo 67 SKUs muestran variación de precio. ' +
      'Sin variación no hay nada que regresar. Se necesitan del orden de 8 a 12 semanas. ' +
      'No hay forma de acelerarlo: nadie publica precios pasados, así que el histórico no se puede rellenar hacia atrás.</div>' +
      '<div class="foot">Advertencia de método: el interés de búsqueda no son unidades vendidas. Sirve como proxy de ' +
      'demanda relativa, y como tal hereda sus sesgos (estacionalidad de búsqueda, notoriedad de marca, prensa).</div></div>';

    /* --- Break-even --- */
    h += '<div class="card"><h2>Break-even: la decisión que no necesita volumen</h2>' +
      '<div class="note">Regla de Nagle &amp; Holden. Con tu margen de contribución, cuánto volumen necesitas ganar ' +
      '(o cuánto puedes perder) para que el cambio de precio sea neutro en utilidad.</div>' +
      '<div class="campos">' +
      '<div><label>Precio actual ($)</label><input type="number" id="b-p0" value="' + (m.mediana ? Math.round(m.mediana) : 1000) + '"></div>' +
      '<div><label>Costo unitario ($)</label><input type="number" id="b-c0" value="' + (m.mediana ? Math.round(m.mediana * 0.7) : 700) + '"></div>' +
      '<div><label>Cambio de precio (%)</label><input type="number" id="b-d0" step="1" value="-10"></div>' +
      '</div><div id="b-out"></div></div>';

    cont.innerHTML = h;

    function pintarBE() {
      var p = parseFloat(document.getElementById('b-p0').value);
      var c = parseFloat(document.getElementById('b-c0').value);
      var dp = parseFloat(document.getElementById('b-d0').value);
      var o = document.getElementById('b-out');
      if (!(p > 0) || !(c >= 0) || isNaN(dp)) { o.innerHTML = '<div class="foot">Completa los tres campos.</div>'; return; }
      if (c >= p) { o.innerHTML = '<div class="aviso">El costo iguala o supera el precio: no hay margen que defender.</div>'; return; }
      var mg = (p - c) / p, d = dp / 100;
      var q = breakEven(mg, d), eu = elasticidadUmbral(mg, d);
      var txt = d < 0
        ? 'Necesitas vender <b>' + PCT(q) + '</b> más unidades para no perder utilidad.'
        : 'Puedes perder hasta <b>' + PCT(-q) + '</b> de las unidades sin perder utilidad.';
      var lec = d < 0
        ? 'Si tu elasticidad real es <b>más negativa</b> que ' + eu.toFixed(2) + ', la baja se paga sola.'
        : 'Si tu elasticidad real es <b>menos negativa</b> que ' + eu.toFixed(2) + ', la subida conviene.';
      var eAct = estado.epsilon;
      var veredicto = '';
      if (eAct != null) {
        var conviene = d < 0 ? (eAct < eu) : (eAct > eu);
        veredicto = '<div class="' + (conviene ? 'bien' : 'aviso') + '">Con el ε ' + estado.origenEpsilon +
          ' de <b>' + eAct.toFixed(2) + '</b>, este cambio <b>' + (conviene ? 'conviene' : 'NO conviene') + '</b>.</div>';
      }
      o.innerHTML = '<div class="kpi">' +
        '<div><div class="l">Margen de contribución</div><div class="v">' + PCT(mg) + '</div></div>' +
        '<div><div class="l">Precio nuevo</div><div class="v">' + CLP(p * (1 + d)) + '</div></div>' +
        '<div><div class="l">Δ volumen break-even</div><div class="v">' + PCT(q) + '</div></div>' +
        '<div><div class="l">Elasticidad umbral</div><div class="v">' + eu.toFixed(2) + '</div></div>' +
        '</div>' + veredicto + '<div class="foot">' + txt + ' ' + lec + '</div>';
    }
    ['b-p0', 'b-c0', 'b-d0'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', pintarBE);
    });
    pintarBE();

    document.getElementById('e-eps').addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v < 0) { estado.epsilon = v; estado.origenEpsilon = 'supuesto'; pintarBE(); }
    });

    document.getElementById('e-btn').addEventListener('click', function () {
      var lineas = document.getElementById('e-obs').value.split('\n')
        .map(function (l) { return l.trim(); }).filter(Boolean);
      var pares = [];
      lineas.forEach(function (l) {
        var t = l.split(/[,;\t]+/);
        var p = parseFloat(String(t[0]).replace(/[^\d.,-]/g, '').replace(',', '.'));
        var q = parseFloat(String(t[1]).replace(/[^\d.,-]/g, '').replace(',', '.'));
        if (p > 0 && q > 0) pares.push([p, q]);
      });
      var r = regresion(pares);
      var o = document.getElementById('e-out');
      if (r.error) {
        o.innerHTML = '<div class="aviso">' + r.error + ' Se leyeron ' + pares.length + ' pares válidos.</div>';
        return;
      }
      estado.epsilon = r.e; estado.origenEpsilon = 'medido';
      var calidad = r.r2 > 0.7 ? 'buen ajuste' : (r.r2 > 0.4 ? 'ajuste moderado' : 'ajuste débil');
      var signif = (r.ic && r.ic[1] < 0)
        ? 'El intervalo no cruza cero: la relación precio-volumen es distinguible de cero.'
        : 'El intervalo cruza cero: con estos datos no se puede afirmar que el precio explique el volumen.';
      o.innerHTML = '<div class="kpi">' +
        '<div><div class="l">Elasticidad ε</div><div class="v">' + r.e.toFixed(2) + '</div></div>' +
        '<div><div class="l">R²</div><div class="v">' + r.r2.toFixed(2) + '</div></div>' +
        '<div><div class="l">Error estándar</div><div class="v">' + r.se.toFixed(2) + '</div></div>' +
        '<div><div class="l">Observaciones</div><div class="v">' + r.n + '</div></div></div>' +
        '<div class="bien">Ahora el modelo usa este ε <b>medido</b> en lugar del supuesto.</div>' +
        '<div class="foot">IC 95%: <b>[' + r.ic[0].toFixed(2) + ', ' + r.ic[1].toFixed(2) + ']</b> · ' + calidad + '. ' + signif + ' ' +
        'La estimación asume que el precio es la única causa del cambio de volumen: si hubo publicidad, quiebres de ' +
        'stock o cambios de exhibición, el ε sale contaminado.</div>';
      pintarBE();
    });
  }

  /* ================= PESTAÑA: MOVIMIENTO DE PRECIO ================= */
  function renderMovimiento(cont, datos, termino) {
    if (!datos || !datos.length) {
      cont.innerHTML = '<div class="card"><h2>Movimiento de precio</h2><div class="aviso">' +
        'Primero barre un producto en la pestaña <b>Buscador de SKU</b>.</div></div>';
      return;
    }
    var m = resumirMuestra(datos);
    var pr = prior(termino);
    if (estado.epsilon == null) { estado.epsilon = pr[1]; estado.origenEpsilon = 'supuesto'; }

    // Toda esta pestaña razona en precio de gondola absoluto. resumirMuestra
    // puede venir en $/unidad, y mezclar las dos bases da gaps sin sentido.
    var absolutos = datos.filter(function (d) { return CADENAS.test(d.retailer || '') && d.precio > 0; })
                         .map(function (d) { return d.precio; }).sort(function (a, b) { return a - b; });
    if (!absolutos.length) {
      absolutos = datos.filter(function (d) { return d.precio > 0; })
                       .map(function (d) { return d.precio; }).sort(function (a, b) { return a - b; });
    }
    var pRef = mediana(absolutos);
    var pMin = absolutos[0], pMax = absolutos[absolutos.length - 1];

    var porCadena = {};
    datos.forEach(function (d) {
      if (!CADENAS.test(d.retailer || '') || !d.precio) return;
      var r = porCadena[d.retailer] = porCadena[d.retailer] || { n: 0, min: Infinity, precios: [] };
      r.n++; r.precios.push(d.precio);
      if (d.precio < r.min) r.min = d.precio;
    });
    var cadenas = Object.keys(porCadena).map(function (k) {
      var p = porCadena[k].precios.slice().sort(function (a, b) { return a - b; });
      return { retailer: k, n: porCadena[k].n, min: porCadena[k].min, mediana: mediana(p) };
    }).sort(function (a, b) { return a.mediana - b.mediana; });

    var h = '';
    h += '<div class="card"><h2>Tu posición y el espacio real de precio</h2>' +
      '<div class="note">La recomendación se acota al rango observado en el mercado. Recomendar un precio fuera de ' +
      'la banda en la que compiten todos es una señal de que el modelo se quedó sin evidencia, no una oportunidad.</div>' +
      '<div class="campos">' +
      '<div><label>Mi precio actual ($)</label><input type="number" id="m-p0" value="' + (pRef ? Math.round(pRef) : 1000) + '"></div>' +
      '<div><label>Mi costo unitario ($)</label><input type="number" id="m-c0" value="' + (pRef ? Math.round(pRef * 0.7) : 700) + '"></div>' +
      '<div><label>Volumen mensual asumido (un)</label><input type="number" id="m-vol" step="100" value="1000"></div>' +
      '<div><label>Cambio de precio a evaluar (%)</label><input type="number" id="m-d" step="1" value="5"></div>' +
      '</div><div id="m-out"></div></div>';

    h += '<div class="card"><h2>Escalera competitiva del SKU</h2>';
    if (!cadenas.length) {
      /* Sin cadenas en la variante elegida la escalera no significa nada.
         Callarlo dejaria una tabla vacia que se lee como "no hay competencia". */
      h += '<div class="aviso"><b>Esta variante no aparece en ningún supermercado del set.</b> ' +
        'Las ofertas que trae son de revendedores (restaurantes, distribuidoras), que no son tu competencia. ' +
        'Vuelve al buscador y elige una variante que muestre supermercados: ' +
        'las del principio del desplegable son las que más cobertura tienen.</div>';
    } else {
      var filas = '';
      cadenas.forEach(function (c) {
        filas += '<tr><td>' + esc(c.retailer) + '</td><td class="num">' + c.n + '</td>' +
          '<td class="num">' + CLP(c.min) + '</td><td class="num">' + CLP(c.mediana) + '</td>' +
          '<td class="num" data-gap="' + c.mediana + '">—</td></tr>';
      });
      h += '<div style="overflow-x:auto"><table id="m-tabla"><thead><tr><th>Cadena</th><th class="num">Ofertas</th>' +
        '<th class="num">Desde</th><th class="num">Mediana</th><th class="num">Gap vs mi precio</th></tr></thead><tbody>' +
        filas + '</tbody></table></div>' +
        '<div class="foot">Sólo cadenas de supermercado. Los vendedores que Google devuelve fuera del retail ' +
        '(productores, mayoristas, restaurantes) quedan fuera porque no son tu set competitivo.</div>';
    }
    h += '</div>';

    cont.innerHTML = h;

    function pintar() {
      var p = parseFloat(document.getElementById('m-p0').value);
      var c = parseFloat(document.getElementById('m-c0').value);
      var vol = parseFloat(document.getElementById('m-vol').value);
      var dp = parseFloat(document.getElementById('m-d').value);
      var o = document.getElementById('m-out');
      if (!(p > 0) || !(c >= 0) || !(vol > 0) || isNaN(dp)) {
        o.innerHTML = '<div class="foot">Completa los campos.</div>'; return;
      }
      if (c >= p) { o.innerHTML = '<div class="aviso">El costo iguala o supera el precio: no hay margen que defender.</div>'; return; }

      var e = estado.epsilon, d = dp / 100, mg = (p - c) / p;
      var pNuevo = p * (1 + d);
      // Elasticidad constante: Q1 = Q0 * (1+d)^e
      var qNuevo = vol * Math.pow(1 + d, e);
      var utilHoy = vol * (p - c);
      var utilNueva = qNuevo * (pNuevo - c);
      var dUtil = utilNueva - utilHoy;
      var ingHoy = vol * p, ingNuevo = qNuevo * pNuevo;
      var pOpt = precioOptimo(c, e);
      var eu = elasticidadUmbral(mg, d);

      // guardarrail: el precio recomendado debe caer dentro del rango del mercado
      var fuera = pOpt != null && (pOpt < pMin || pOpt > pMax);

      var veredicto = dUtil > 0
        ? '<div class="bien"><b>' + (d > 0 ? 'Subir' : 'Bajar') + ' ' + Math.abs(dp) + '% suma utilidad: ' + CLP(dUtil) + ' al mes.</b> ' +
          'Con ε ' + estado.origenEpsilon + ' de ' + e.toFixed(2) + ', el efecto precio supera al efecto volumen.</div>'
        : '<div class="aviso"><b>' + (d > 0 ? 'Subir' : 'Bajar') + ' ' + Math.abs(dp) + '% destruye utilidad: ' + CLP(dUtil) + ' al mes.</b> ' +
          'Con ε ' + estado.origenEpsilon + ' de ' + e.toFixed(2) + ', el volumen que pierdes no se compensa.</div>';

      o.innerHTML = veredicto +
        '<div class="kpi">' +
        '<div><div class="l">Precio nuevo</div><div class="v">' + CLP(pNuevo) + '</div></div>' +
        '<div><div class="l">Unidades estimadas</div><div class="v">' + Math.round(qNuevo).toLocaleString('es-CL') + '</div></div>' +
        '<div><div class="l">Δ utilidad mensual</div><div class="v">' + CLP(dUtil) + '</div></div>' +
        '<div><div class="l">Δ ingreso mensual</div><div class="v">' + CLP(ingNuevo - ingHoy) + '</div></div>' +
        '</div>' +
        '<div class="foot">Margen actual ' + PCT(mg) + ' · elasticidad umbral de este cambio ' + eu.toFixed(2) + ' · ' +
        'utilidad hoy ' + CLP(utilHoy) + ' → ' + CLP(utilNueva) + '. ' +
        (pOpt != null
          ? 'Precio óptimo teórico (Lerner, <code>P* = C · ε/(1+ε)</code>): <b>' + CLP(pOpt) + '</b>' +
            (fuera ? '. <b>Cae fuera del rango observado en el mercado (' + CLP(pMin) + ' – ' + CLP(pMax) + '), ' +
                     'así que no lo tomes como recomendación: indica que el ε supuesto es poco creíble para esta categoría.</b>'
                   : '.')
          : 'Con ε entre −1 y 0 no existe precio óptimo interior: la demanda es rígida y la teoría empuja el precio hacia arriba sin límite, ' +
            'lo que en la práctica lo acota la competencia, no el modelo.') +
        ' El volumen es el que asumiste: escala los pesos, no cambia la dirección de la decisión.</div>';

      // gap contra cada cadena
      var celdas = document.querySelectorAll('#m-tabla td[data-gap]');
      Array.prototype.forEach.call(celdas, function (td) {
        var med = parseFloat(td.getAttribute('data-gap'));
        var g = (p - med) / med;
        td.textContent = (g > 0 ? '+' : '') + (g * 100).toFixed(1) + '%';
        td.style.color = Math.abs(g) < 0.03 ? '' : (g > 0 ? '#B20F03' : '#27853A');
      });
    }
    ['m-p0', 'm-c0', 'm-vol', 'm-d'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', pintar);
    });
    pintar();
  }

  window.PricingModelo = {
    renderElasticidad: renderElasticidad,
    renderMovimiento: renderMovimiento,
    estado: estado,
    // expuesto para pruebas
    _regresion: regresion, _breakEven: breakEven,
    _elasticidadUmbral: elasticidadUmbral, _precioOptimo: precioOptimo,
    _resumirMuestra: resumirMuestra, _mediana: mediana
  };
})();
