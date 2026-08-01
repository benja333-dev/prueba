/* Modelo de pricing: elasticidad triangulada y movimiento de precio competitivo.
   Expone window.PricingModelo.

   ── Por que NO se usa la regla de Lerner para recomendar precio ──────────────
   P* = C·e/(1+e) es el optimo de un MONOPOLIO: supone que al subir el precio
   nadie se cambia a otra marca, solo compra menos. En una categoria de
   supermercado eso es falso, y el sintoma es inconfundible: con e=-1,6 y costo
   al 62% del precio la formula devuelve siempre ~1,65x el precio actual, o sea
   un optimo por encima de TODA la competencia.

   En su lugar se usa un modelo de atraccion logit con equilibrio de Bertrand,
   que es el estandar en IO empirica (Berry 1994; Berry, Levinsohn & Pakes 1995)
   y el que hay detras de las herramientas de pricing de retail:

     share_i = exp(-B·P_i) / sum_j exp(-B·P_j)
     elasticidad propia   e_ii = -B·P_i·(1-s_i)
     elasticidad cruzada  e_ij =  B·P_j·s_j
     precio optimo        P*   = C + 1 / (B·(1-s))

   Con B calibrada a la elasticidad triangulada, P* se reduce a C + P/|e|: el
   margen de equilibrio es 1/|e|. Ojo con la lectura facil: eso NO cambia con el
   numero de competidores, porque el (1-s) se cancela. Lo que si aporta el logit
   es la respuesta que importa de verdad: si subo el precio, a QUIEN se van.

   Y para que el optimo no salga por encima de todo el mercado, el camino 4 de
   la triangulacion invierte el equilibrio: los precios que las cadenas
   sostienen revelan la elasticidad que ellas asumen.
*/
(function () {
  var estado = {
    epsilon: null, origenEpsilon: null, caminos: null,
    datos: [], termino: '', pRef: null, costoPct: 0.70, volumen: 1000
  };

  var CLP = function (n) {
    return (n == null || isNaN(n) || !isFinite(n)) ? '—' : '$' + Math.round(n).toLocaleString('es-CL');
  };
  var PCT = function (n, d) {
    return (n == null || !isFinite(n)) ? '—' : (n * 100).toFixed(d == null ? 1 : d) + '%';
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var CADENAS = /lider|jumbo|santa\s*isabel|santaisabel|unimarc|alvi|tottus|acuenta|mayorista\s*10|erbi|montserrat/i;

  function mediana(s) {
    if (!s.length) return null;
    var t = s.slice().sort(function (a, b) { return a - b; }), n = t.length;
    return n % 2 ? t[(n - 1) / 2] : (t[n / 2 - 1] + t[n / 2]) / 2;
  }

  /* ─────────────── Muestra: solo cadenas, precio absoluto ─────────────── */
  function competidores(datos) {
    var m = {};
    datos.forEach(function (d) {
      if (!CADENAS.test(d.retailer || '') || !(d.precio > 0)) return;
      var r = m[d.retailer] = m[d.retailer] || { retailer: d.retailer, precios: [], lista: [], promos: 0, n: 0 };
      r.precios.push(d.precio); r.n++;
      if (d.precio_lista && d.precio_lista > d.precio) r.lista.push(d.precio_lista);
      if (d.mecanica || d.requiere_lealtad) r.promos++;
    });
    return Object.keys(m).map(function (k) {
      var r = m[k];
      return {
        retailer: r.retailer, n: r.n, precio: mediana(r.precios),
        lista: r.lista.length ? mediana(r.lista) : null,
        pctPromo: r.n ? r.promos / r.n : 0
      };
    }).sort(function (a, b) { return a.precio - b.precio; });
  }

  /* ═══════════════ TRIANGULACION DE LA ELASTICIDAD ═══════════════
     Cuatro caminos independientes, todos automaticos. Ninguno es una medicion
     directa (eso exige volumen de venta propio), pero al converger acotan el
     rango, y el desacuerdo entre ellos es en si mismo informacion. */

  /* Camino 1 — Prior de categoria.
     Meta-analisis de Bijmolt, van Heerde & Pieters (2005) sobre 1.851
     elasticidades publicadas: media -2,62, y mas elastica en bienes de
     conveniencia con muchas marcas sustitutas. */
  var PRIORES = [
    ['Bebidas gaseosas', /coca|pepsi|bebida|gaseosa|sprite|fanta|nectar|jugo/, -2.6, -3.8, -1.5,
     'Categoria muy promocionada y con marcas altamente sustituibles.'],
    ['Snacks y galletas', /galleta|snack|papas fritas|ramitas|dulce|chocolate/, -2.2, -3.0, -1.2,
     'Compra por impulso: la sustitucion entre marcas es alta.'],
    ['Lacteos', /leche|yogur|queso|lacteo|mantequilla|crema/, -1.4, -2.0, -0.6,
     'Compra de rutina; la leche blanca opera casi como commodity.'],
    ['Frutas y verduras', /lechuga|palta|tomate|platano|manzana|papa|cebolla|zanahoria|fruta|verdura|limon/, -0.9, -1.4, -0.4,
     'Sin marca que defender, pero con demanda de base estable.'],
    ['Despensa basica', /arroz|fideo|aceite|azucar|harina|legumbre|sal\b/, -0.8, -1.2, -0.3,
     'Bien de primera necesidad: la demanda agregada es rigida.'],
    ['Limpieza y aseo', /detergente|cloro|limpieza|jabon|shampoo|papel higienico/, -1.8, -2.5, -0.9,
     'Stock-up: el hogar adelanta compra cuando hay promocion.']
  ];

  function caminoPrior(termino) {
    var t = (termino || '').toLowerCase();
    var p = null;
    for (var i = 0; i < PRIORES.length; i++) if (PRIORES[i][1].test(t)) { p = PRIORES[i]; break; }
    if (!p) p = PRIORES[3];
    return {
      id: 'Prior de categoria', e: p[2], rango: [p[4], p[3]], categoria: p[0],
      peso: 1, fiabilidad: 'media',
      base: 'Meta-analisis de 1.851 elasticidades publicadas (Bijmolt, van Heerde &amp; Pieters, 2005).',
      detalle: p[5]
    };
  }

  /* Camino 2 — Dispersion de precios observada.
     En un mercado de atraccion, cuanto mas sensible al precio es el shopper,
     mas se comprimen los precios de equilibrio entre cadenas. Un coeficiente
     de variacion bajo delata sustituibilidad alta; uno alto, poder de fijacion.
     El mapeo es una heuristica calibrada para caer dentro del rango de
     literatura, no una estimacion: por eso pesa menos que los otros dos. */
  function caminoDispersion(comps) {
    if (comps.length < 3) {
      return { id: 'Dispersion de precios', e: null, peso: 0, fiabilidad: 'insuficiente',
        base: 'Se necesitan al menos 3 cadenas con el mismo producto.',
        detalle: 'El barrido trajo ' + comps.length + '. Amplia la busqueda o elige otra variante.' };
    }
    var ps = comps.map(function (c) { return c.precio; });
    var med = ps.reduce(function (a, b) { return a + b; }, 0) / ps.length;
    var sd = Math.sqrt(ps.reduce(function (a, b) { return a + Math.pow(b - med, 2); }, 0) / (ps.length - 1));
    var cv = sd / med;
    // cv 0% -> -3,2 (precios clavados, categoria commodity) ; cv 30%+ -> -0,7
    var e = -3.2 + (Math.min(cv, 0.30) / 0.30) * 2.5;
    return {
      id: 'Dispersion de precios', e: Math.round(e * 100) / 100, cv: cv, n: comps.length,
      peso: 0.6, fiabilidad: 'indicativa',
      base: 'Dispersion observada entre las ' + comps.length + ' cadenas del barrido (CV ' + PCT(cv) + ').',
      detalle: cv < 0.08
        ? 'Los precios estan practicamente clavados entre cadenas: nadie se atreve a despegarse, senal de shopper muy sensible.'
        : (cv < 0.18
          ? 'Dispersion moderada: hay espacio para diferenciarse, pero acotado.'
          : 'Dispersion alta: las cadenas sostienen precios muy distintos por el mismo producto, lo que sugiere baja sustitucion o compra por conveniencia.')
    };
  }

  /* Camino 3 — Preferencia revelada del retailer.
     Nadie corre una promocion que destruye utilidad. Por el break-even de
     Nagle, un descuento de profundidad d solo se paga si la elasticidad es al
     menos -1/(d+m). Si las cadenas descuentan repetidamente a esa profundidad,
     su propia creencia sobre la elasticidad es al menos esa. Junto con el
     camino 4, es de los anclados en conducta real observada. */
  function caminoPromo(comps, margenRetail) {
    var conPromo = comps.filter(function (c) { return c.lista && c.lista > c.precio; });
    if (!conPromo.length) {
      return { id: 'Promocion revelada', e: null, peso: 0, fiabilidad: 'sin evidencia',
        base: 'Ninguna cadena del set muestra descuento sobre precio lista en esta captura.',
        detalle: 'Sin promociones no hay conducta que revele la creencia del retailer. ' +
                 'Ojo: Jumbo dejo de publicar su mecanica, asi que puede haber promociones no visibles.' };
    }
    var prof = conPromo.map(function (c) { return (c.lista - c.precio) / c.lista; });
    var d = mediana(prof);
    var e = -1 / (d + margenRetail);
    return {
      id: 'Promocion revelada', e: Math.round(e * 100) / 100, profundidad: d, n: conPromo.length,
      peso: 1.2, fiabilidad: 'alta',
      base: conPromo.length + ' de ' + comps.length + ' cadenas descuentan; profundidad mediana ' + PCT(d) + '.',
      detalle: 'Para que un descuento de ' + PCT(d) + ' se pague con un margen de retail de ' + PCT(margenRetail) +
               ', la elasticidad tiene que ser al menos ' + e.toFixed(2) + '. Las cadenas lo corren igual, ' +
               'asi que ese es el piso que ellas mismas asumen.'
    };
  }

  /* Camino 4 — Equilibrio de mercado (inversion de preferencia revelada).
     El mas potente de los cuatro, y el que resuelve el sintoma de "el optimo me
     da mas caro que todos". En equilibrio de Bertrand-logit el margen de cada
     jugador cumple (P-C)/P = 1/|e|. Si todas las cadenas venden un producto a
     un precio parecido y su costo es conocido, ese margen revela la elasticidad
     que ellas mismas estan asumiendo: |e| = P/(P-C).

     Leido al reves: si el modelo propone un precio por encima de todo el
     mercado, no es que haya dinero sobre la mesa, es que la elasticidad
     supuesta es menos elastica que la que el mercado esta revelando. */
  function caminoEquilibrio(comps, costoPct) {
    if (comps.length < 2 || !(costoPct > 0 && costoPct < 1)) {
      return { id: 'Equilibrio de mercado', e: null, peso: 0, fiabilidad: 'insuficiente',
        base: 'Se necesitan al menos 2 cadenas y un costo supuesto valido.',
        detalle: 'Sin set competitivo no hay equilibrio que invertir.' };
    }
    var p = mediana(comps.map(function (c) { return c.precio; }));
    var margen = 1 - costoPct;
    var e = -1 / margen;
    return {
      id: 'Equilibrio de mercado', e: Math.round(e * 100) / 100, precio: p, margen: margen,
      peso: 1.4, fiabilidad: 'alta',
      base: 'Precio mediano de mercado ' + CLP(p) + ' con costo supuesto al ' + PCT(costoPct) + '.',
      detalle: 'Si las cadenas fijan precio en equilibrio, su margen de ' + PCT(margen) +
               ' implica que estan asumiendo una elasticidad de ' + e.toFixed(2) + '. ' +
               'Este camino ancla el modelo al mercado: con el, el precio optimo cae dentro del rango observado ' +
               'en vez de por encima de todos.'
    };
  }

  function triangular(caminos) {
    var validos = caminos.filter(function (c) { return c.e != null && c.peso > 0; });
    if (!validos.length) return { e: null, caminos: caminos };
    var sw = validos.reduce(function (a, c) { return a + c.peso; }, 0);
    var e = validos.reduce(function (a, c) { return a + c.e * c.peso; }, 0) / sw;
    var es = validos.map(function (c) { return c.e; });
    var disp = Math.max.apply(null, es) - Math.min.apply(null, es);
    return {
      e: Math.round(e * 100) / 100,
      min: Math.min.apply(null, es), max: Math.max.apply(null, es),
      convergen: disp < 1.0, n: validos.length, caminos: caminos
    };
  }

  /* ═══════════════ MODELO COMPETITIVO (logit / Bertrand) ═══════════════ */
  function logit(comps, beta) {
    var att = comps.map(function (c) { return Math.exp(-beta * c.precio); });
    var tot = att.reduce(function (a, b) { return a + b; }, 0);
    return comps.map(function (c, i) { return { retailer: c.retailer, precio: c.precio, share: att[i] / tot }; });
  }
  // B se calibra para que la elasticidad propia del jugador sea la triangulada
  function betaDesde(e, precio, share) {
    return -e / (precio * (1 - share));
  }
  function optimoBertrand(costo, beta, share) {
    return costo + 1 / (beta * (1 - share));
  }

  /* ═══════════════ REGRESION log-log (si hay ventas) ═══════════════ */
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
    for (var j = 0; j < n; j++) { sres += Math.pow(y[j] - (a + e * x[j]), 2); stot += Math.pow(y[j] - my, 2); }
    var r2 = stot ? 1 - sres / stot : null;
    var se = n > 2 ? Math.sqrt((sres / (n - 2)) / sxx) : null;
    var TC = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23 };
    var gl = n - 2, tc = TC[gl] || (gl > 30 ? 1.96 : 2.09);
    return { e: e, r2: r2, se: se, n: n, ic: se ? [e - tc * se, e + tc * se] : null };
  }

  function breakEven(m, d) { return (m + d === 0) ? null : -d / (d + m); }

  /* ═══════════════ RENDER: ELASTICIDAD ═══════════════ */
  function renderElasticidad(cont, datos, termino) {
    if (!datos || !datos.length) {
      cont.innerHTML = '<div class="card"><h2>Elasticidad</h2><div class="aviso">' +
        'Elige un producto en <b>Buscador de SKU</b>. La elasticidad se triangula sobre ese set competitivo.</div></div>';
      return;
    }
    var comps = competidores(datos);
    estado.datos = datos; estado.termino = termino;
    estado.pRef = comps.length ? mediana(comps.map(function (c) { return c.precio; }))
                               : mediana(datos.map(function (d) { return d.precio; }));

    var margenRetail = 0.28;   // margen de contribucion tipico en supermercado CL
    var c1 = caminoPrior(termino), c2 = caminoDispersion(comps),
        c3 = caminoPromo(comps, margenRetail), c4 = caminoEquilibrio(comps, estado.costoPct);
    var tri = triangular([c1, c2, c3, c4]);
    if (estado.origenEpsilon !== 'medido') {
      estado.epsilon = tri.e; estado.origenEpsilon = 'triangulado';
    }
    estado.caminos = tri;

    var h = '';
    h += '<div class="card"><h2>Elasticidad triangulada</h2>' +
      '<div class="note">Tres caminos independientes, todos automaticos sobre el barrido. ' +
      'Ninguno mide la elasticidad (eso exige volumen de venta propio), pero al converger acotan el rango. ' +
      'Puedes editar cualquier supuesto abajo.</div>' +
      '<div class="kpi">' +
      '<div><div class="l">Elasticidad concluida</div><div class="v">' + (tri.e != null ? tri.e.toFixed(2) : '—') + '</div></div>' +
      '<div><div class="l">Rango de los caminos</div><div class="v">' +
        (tri.e != null ? tri.min.toFixed(1) + ' a ' + tri.max.toFixed(1) : '—') + '</div></div>' +
      '<div><div class="l">Caminos con dato</div><div class="v">' + (tri.n || 0) + ' de 4</div></div>' +
      '<div><div class="l">Lectura</div><div class="v" style="font-size:14px">' +
        (tri.e == null ? '—' : (tri.e < -1 ? 'Elastica' : 'Rigida')) + '</div></div>' +
      '</div>';

    if (tri.e != null) {
      h += '<div class="' + (tri.convergen ? 'bien' : 'aviso') + '">' +
        (tri.convergen
          ? '<b>Los caminos convergen</b> (se separan menos de 1,0 punto). La conclusion de ' + tri.e.toFixed(2) +
            ' es razonablemente robusta al metodo.'
          : '<b>Los caminos discrepan</b> (' + tri.min.toFixed(1) + ' a ' + tri.max.toFixed(1) + '). ' +
            'Toma el resultado como un rango, no como un punto: mira abajo cual camino tiene mejor evidencia y ajusta el peso a mano.') +
        '</div>';
    }

    h += '<table><thead><tr><th>Camino</th><th class="num">ε</th><th>Evidencia</th><th class="num">Peso</th></tr></thead><tbody>';
    [c1, c2, c3, c4].forEach(function (c) {
      h += '<tr><td><b>' + c.id + '</b><div style="font-size:11px;color:#666;margin-top:3px">' + c.detalle + '</div></td>' +
        '<td class="num">' + (c.e != null ? '<b>' + c.e.toFixed(2) + '</b>' : '—') + '</td>' +
        '<td style="font-size:11.5px">' + c.base + '</td>' +
        '<td class="num">' + (c.peso ? c.peso.toFixed(1) : '—') + '</td></tr>';
    });
    h += '</tbody></table>' +
      '<div class="foot">El peso refleja cuanta evidencia real tiene cada camino. La promocion revelada pesa mas ' +
      'porque nace de conducta observada, y el equilibrio de mercado mas todavia porque ancla el modelo a los \n' +
      'precios que las cadenas efectivamente sostienen. La dispersion pesa menos: su mapeo es una heuristica.</div></div>';

    h += '<div class="card"><h2>Ajusta los supuestos</h2>' +
      '<div class="note">Todo lo de arriba se recalcula. Si tienes datos propios, el ultimo bloque los usa y reemplaza la triangulacion.</div>' +
      '<div class="campos">' +
      '<div><label>Elasticidad en uso</label><input type="number" id="e-eps" step="0.05" value="' + (tri.e != null ? tri.e : -1.5) + '"></div>' +
      '<div><label>Margen de retail supuesto</label><input type="number" id="e-mr" step="1" value="' + Math.round(margenRetail * 100) + '"></div>' +
      '<div><label>Tu costo (% del precio)</label><input type="number" id="e-cp" step="1" value="' + Math.round(estado.costoPct * 100) + '"></div>' +
      '<div><label>Volumen mensual asumido (un)</label><input type="number" id="e-vol" step="100" value="' + estado.volumen + '"></div>' +
      '</div>' +
      '<div class="foot">El margen de retail solo afecta al camino 3. El costo y el volumen no tocan la elasticidad: ' +
      'entran en la pestaña de movimiento de precio para llevar la decision a pesos.</div></div>';

    h += '<div class="card"><h2>Si tienes ventas, medila de verdad</h2>' +
      '<div class="note">Regresion log-log, <code>ln Q = a + ε · ln P</code>. Una observacion por linea, ' +
      '<code>precio,unidades</code>. Reemplaza la triangulacion en cuanto la corras.</div>' +
      '<textarea id="e-obs" placeholder="1490,1200&#10;1290,1580&#10;1690,890&#10;1390,1350"></textarea>' +
      '<div style="margin-top:10px"><button type="button" class="chip-link" id="e-btn">Estimar y usar</button></div>' +
      '<div id="e-out" style="margin-top:12px"></div></div>';

    cont.innerHTML = h;

    function recalcular() {
      var mr = (parseFloat(document.getElementById('e-mr').value) || 28) / 100;
      estado.costoPct = (parseFloat(document.getElementById('e-cp').value) || 70) / 100;
      estado.volumen = parseFloat(document.getElementById('e-vol').value) || 1000;
      var n3 = caminoPromo(comps, mr), n4 = caminoEquilibrio(comps, estado.costoPct);
      var nt = triangular([c1, c2, n3, n4]);
      if (estado.origenEpsilon !== 'medido' && nt.e != null) {
        estado.epsilon = nt.e;
        document.getElementById('e-eps').value = nt.e;
      }
      estado.caminos = nt;
    }
    ['e-mr', 'e-cp', 'e-vol'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', recalcular);
    });
    document.getElementById('e-eps').addEventListener('input', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v < 0) { estado.epsilon = v; estado.origenEpsilon = 'ajustado a mano'; }
    });

    document.getElementById('e-btn').addEventListener('click', function () {
      var pares = [];
      document.getElementById('e-obs').value.split('\n').forEach(function (l) {
        var t = l.trim().split(/[,;\t]+/);
        var p = parseFloat(String(t[0]).replace(/[^\d.,-]/g, '').replace(',', '.'));
        var q = parseFloat(String(t[1]).replace(/[^\d.,-]/g, '').replace(',', '.'));
        if (p > 0 && q > 0) pares.push([p, q]);
      });
      var r = regresion(pares), o = document.getElementById('e-out');
      if (r.error) { o.innerHTML = '<div class="aviso">' + r.error + ' Se leyeron ' + pares.length + ' pares.</div>'; return; }
      estado.epsilon = r.e; estado.origenEpsilon = 'medido';
      document.getElementById('e-eps').value = r.e.toFixed(2);
      o.innerHTML = '<div class="kpi">' +
        '<div><div class="l">ε medida</div><div class="v">' + r.e.toFixed(2) + '</div></div>' +
        '<div><div class="l">R²</div><div class="v">' + r.r2.toFixed(2) + '</div></div>' +
        '<div><div class="l">Error estandar</div><div class="v">' + r.se.toFixed(2) + '</div></div>' +
        '<div><div class="l">Observaciones</div><div class="v">' + r.n + '</div></div></div>' +
        '<div class="bien">El modelo pasa a usar esta ε medida en lugar de la triangulada.</div>' +
        '<div class="foot">IC 95%: [' + r.ic[0].toFixed(2) + ', ' + r.ic[1].toFixed(2) + ']. ' +
        'Supone que el precio es la unica causa del cambio de volumen: publicidad, quiebres de stock o ' +
        'cambios de exhibicion en esas semanas contaminan la estimacion.</div>';
    });
  }

  /* ═══════════════ RENDER: MOVIMIENTO DE PRECIO ═══════════════ */
  function renderMovimiento(cont, datos, termino) {
    if (!datos || !datos.length) {
      cont.innerHTML = '<div class="card"><h2>Movimiento de precio</h2><div class="aviso">' +
        'Elige un producto en <b>Buscador de SKU</b>.</div></div>';
      return;
    }
    var comps = competidores(datos);
    if (comps.length < 2) {
      cont.innerHTML = '<div class="card"><h2>Movimiento de precio</h2><div class="aviso">' +
        '<b>Esta variante aparece en ' + comps.length + ' cadena' + (comps.length === 1 ? '' : 's') + '.</b> ' +
        'Sin al menos dos competidores no hay a quien perder ni ganar share, que es de lo que trata esta pestaña. ' +
        'Vuelve al buscador y elige una variante con mas cobertura.</div></div>';
      return;
    }
    if (estado.epsilon == null) { estado.epsilon = caminoPrior(termino).e; estado.origenEpsilon = 'prior'; }

    var pMerc = mediana(comps.map(function (c) { return c.precio; }));
    var h = '';
    h += '<div class="card"><h2>Para que sirve esta pestaña</h2>' +
      '<div class="note">Responde una sola pregunta, la que decide: <b>si muevo mi precio, cuanto volumen ' +
      'se va, a que cadena se va, y me conviene en utilidad.</b> No usa la formula de monopolio ' +
      '(<code>P* = C·ε/(1+ε)</code>) porque esa supone que al subir el precio nadie se cambia de marca: en ' +
      'supermercado devuelve optimos por encima de todo el mercado. Usa un modelo de atraccion logit con ' +
      'equilibrio de Bertrand, que es lo que se ocupa en IO empirica y en las herramientas de pricing de retail.</div>' +
      '<div class="campos">' +
      '<div><label>Mi precio actual ($)</label><input type="number" id="m-p0" value="' + Math.round(pMerc) + '"></div>' +
      '<div><label>Mi costo unitario ($)</label><input type="number" id="m-c0" value="' + Math.round(pMerc * estado.costoPct) + '"></div>' +
      '<div><label>Volumen mensual (un)</label><input type="number" id="m-vol" step="100" value="' + estado.volumen + '"></div>' +
      '<div><label>Cambio de precio (%)</label><input type="number" id="m-d" step="1" value="5"></div>' +
      '</div><div id="m-out"></div></div>';

    h += '<div class="card"><h2>A quien se van si subes el precio</h2>' +
      '<div class="note">Elasticidad cruzada del modelo logit: <code>ε_ij = β · P_j · s_j</code>. ' +
      'El shopper que te deja no desaparece, se reparte entre las otras cadenas en proporcion a lo atractivas que sean.</div>' +
      '<div style="overflow-x:auto"><table id="m-tabla"><thead><tr><th>Cadena</th><th class="num">Precio</th>' +
      '<th class="num">Gap vs ti</th><th class="num">Share estimada</th><th class="num">Share tras el cambio</th>' +
      '<th class="num">Captura de tu fuga</th></tr></thead><tbody></tbody></table></div>' +
      '<div class="foot" id="m-foot"></div></div>';

    cont.innerHTML = h;

    function pintar() {
      var p = parseFloat(document.getElementById('m-p0').value);
      var c = parseFloat(document.getElementById('m-c0').value);
      var vol = parseFloat(document.getElementById('m-vol').value);
      var dp = parseFloat(document.getElementById('m-d').value);
      var o = document.getElementById('m-out');
      if (!(p > 0) || !(c >= 0) || !(vol > 0) || isNaN(dp)) { o.innerHTML = '<div class="foot">Completa los campos.</div>'; return; }
      if (c >= p) { o.innerHTML = '<div class="aviso">El costo iguala o supera el precio: no hay margen que defender.</div>'; return; }

      var e = estado.epsilon, d = dp / 100, mg = (p - c) / p;
      var precios = comps.map(function (x) { return x.precio; });
      var pMin = Math.min.apply(null, precios), pMax = Math.max.apply(null, precios);

      // Mi ficha entra al set competitivo con mi precio actual.
      var conmigo = [{ retailer: 'TÚ', precio: p }].concat(comps.map(function (x) {
        return { retailer: x.retailer, precio: x.precio };
      }));
      var s0Igual = 1 / conmigo.length;                       // share de partida: reparto neutro
      var beta = betaDesde(e, p, s0Igual);
      var antes = logit(conmigo, beta);
      var sYo = antes[0].share;

      var despues = logit([{ retailer: 'TÚ', precio: p * (1 + d) }].concat(comps.map(function (x) {
        return { retailer: x.retailer, precio: x.precio };
      })), beta);
      var sYo2 = despues[0].share;

      // El mercado total se mantiene: lo que cambia es el reparto.
      var q0 = vol, q1 = vol * (sYo2 / sYo);
      var utilHoy = q0 * (p - c), utilNueva = q1 * (p * (1 + d) - c);
      var dUtil = utilNueva - utilHoy;
      var pOpt = optimoBertrand(c, beta, sYo);
      var be = breakEven(mg, d);

      var gana = dUtil > 0;
      o.innerHTML =
        '<div class="' + (gana ? 'bien' : 'aviso') + '"><b>' + (d > 0 ? 'Subir' : 'Bajar') + ' ' + Math.abs(dp) + '% ' +
        (gana ? 'suma' : 'resta') + ' ' + CLP(Math.abs(dUtil)) + ' de utilidad al mes.</b> ' +
        'Pierdes ' + PCT(1 - sYo2 / sYo) + ' del volumen y ' +
        (gana ? 'el mayor margen unitario lo compensa.' : 'el mayor margen unitario no alcanza a compensarlo.') + '</div>' +
        '<div class="kpi">' +
        '<div><div class="l">Precio nuevo</div><div class="v">' + CLP(p * (1 + d)) + '</div></div>' +
        '<div><div class="l">Unidades estimadas</div><div class="v">' + Math.round(q1).toLocaleString('es-CL') + '</div></div>' +
        '<div><div class="l">Δ utilidad mensual</div><div class="v">' + CLP(dUtil) + '</div></div>' +
        '<div><div class="l">Precio óptimo competitivo</div><div class="v">' + CLP(pOpt) + '</div></div>' +
        '</div>' +
        '<div class="foot">Con ε ' + estado.origenEpsilon + ' de <b>' + e.toFixed(2) + '</b> y margen ' + PCT(mg) + '. ' +
        'El break-even dice que necesitarias ' + PCT(be) + ' de cambio en volumen para quedar igual. ' +
        'El óptimo competitivo sale de <code>P* = C + 1/(β·(1−s))</code>, que con β calibrada a la ε ' +
        'triangulada equivale a <code>C + P/|ε|</code>: el margen de equilibrio es <b>1/|ε|</b>. ' +
        (pOpt > pMax
          ? '<b>Ojo: el óptimo queda por encima del precio mas caro del mercado (' + CLP(pMax) + ').</b> ' +
            'Eso no significa que haya dinero sobre la mesa: significa que la ε supuesta es demasiado rigida, ' +
            'o que tu costo real es mayor. Si todas las cadenas cobran menos, estan revelando una elasticidad de ' +
            'al menos <b>' + (-1 / mg).toFixed(2) + '</b> con tu margen. Sube el costo o usa una ε mas elastica ' +
            'en la pestaña anterior y el óptimo entra al rango.'
          : (pOpt < pMin
            ? '<b>El óptimo queda bajo el precio mas barato del mercado (' + CLP(pMin) + ').</b> Revisa el costo: ' +
              'un costo sobreestimado empuja el óptimo hacia abajo.'
            : 'Cae dentro del rango de mercado (' + CLP(pMin) + ' a ' + CLP(pMax) + '), que es lo esperable en una categoria competida.')) + '</div>';

      // tabla de a quien se van
      var tb = document.querySelector('#m-tabla tbody');
      var fugados = sYo - sYo2;
      var filas = '';
      for (var i = 0; i < antes.length; i++) {
        var a = antes[i], b2 = despues[i];
        var esYo = i === 0;
        var captura = esYo ? null : (b2.share - a.share) / (fugados || 1);
        filas += '<tr' + (esYo ? ' style="background:#f4f8fb"' : '') + '>' +
          '<td>' + (esYo ? '<b>TÚ</b>' : esc(a.retailer)) + '</td>' +
          '<td class="num">' + CLP(esYo ? p * (1 + d) : a.precio) + '</td>' +
          '<td class="num">' + (esYo ? '—' : ((a.precio > p ? '+' : '') + ((a.precio / p - 1) * 100).toFixed(1) + '%')) + '</td>' +
          '<td class="num">' + PCT(a.share) + '</td>' +
          '<td class="num">' + PCT(b2.share) + '</td>' +
          '<td class="num">' + (captura == null ? '—' : PCT(captura)) + '</td></tr>';
      }
      tb.innerHTML = filas;
      var ganador = despues.slice(1).map(function (x, i) { return { r: x.retailer, g: x.share - antes[i + 1].share }; })
        .sort(function (a, b) { return b.g - a.g; })[0];
      document.getElementById('m-foot').innerHTML =
        (d > 0 && ganador
          ? 'Con este alza, quien mas capta tu fuga es <b>' + esc(ganador.r) + '</b>. '
          : '') +
        'Las shares de partida suponen reparto neutro entre las cadenas del set, porque el barrido no trae ' +
        'participacion de mercado real. Si conoces tu share, el modelo mejora mucho: es el supuesto mas fuerte de esta pestaña.';
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
    _regresion: regresion, _breakEven: breakEven, _triangular: triangular,
    _caminoPrior: caminoPrior, _caminoDispersion: caminoDispersion, _caminoPromo: caminoPromo,
    _caminoEquilibrio: caminoEquilibrio,
    _logit: logit, _betaDesde: betaDesde, _optimoBertrand: optimoBertrand,
    _competidores: competidores, _mediana: mediana
  };
})();
