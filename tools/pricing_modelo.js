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

  /* ═══════════════ PARTICIPACION DE MERCADO ═══════════════
     Prior nacional por cadena. Se busco en vivo y las cifras publicas NO
     cuadran entre si: Walmart 48% (2021, Peru Retail/DF), Cencosud 33,5%
     (2023, Humphreys) y SMU 18% (2021) suman 99,5% y no dejan espacio para
     Tottus ni los regionales, ademas de mezclar anos y bases distintas.

     Lo de abajo es un set normalizado y coherente, del orden de magnitud que
     reportan la FNE y las memorias anuales, repartido de holding a cadena.
     Es un SUPUESTO editable, no un dato: sirve para que el modelo no asuma
     que todas las cadenas pesan igual, que es peor. Solo importan los pesos
     relativos entre las cadenas presentes en el set, porque se renormalizan. */
  var SHARE_NACIONAL = {
    'lider': 33, 'express de lider': 4, 'acuenta': 5, 'central mayorista': 2,   // Walmart Chile
    'santa isabel': 12, 'jumbo': 12,                                             // Cencosud
    'unimarc': 16, 'alvi': 4, 'mayorista 10': 2,                                 // SMU
    'tottus': 8,                                                                 // Falabella
    'erbi': 1, 'montserrat': 1
  };
  function sharePrior(retailer) {
    var r = String(retailer || '').toLowerCase();
    var claves = Object.keys(SHARE_NACIONAL).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < claves.length; i++) if (r.indexOf(claves[i]) >= 0) return SHARE_NACIONAL[claves[i]];
    return 3;   // cadena menor o regional no listada
  }

  /* ═══════════════ MODELO COMPETITIVO (logit / Bertrand) ═══════════════
     Modelo de atraccion: share_i = w_i·exp(-B·P_i) / sum_j w_j·exp(-B·P_j).
     El peso w recoge todo lo que atrae al shopper y NO es precio: cobertura de
     locales, cercania, fidelidad. Se calibra para que, a los precios
     observados, las shares reproduzcan el prior nacional. Sin el, el modelo
     daria que Alvi le gana a Lider por estar 2% mas barato, lo que es falso. */
  function logit(comps, beta, pesos) {
    var att = comps.map(function (c, i) {
      var w = pesos ? pesos[i] : 1;
      return w * Math.exp(-beta * c.precio);
    });
    var tot = att.reduce(function (a, b) { return a + b; }, 0);
    return comps.map(function (c, i) { return { retailer: c.retailer, precio: c.precio, share: att[i] / tot }; });
  }
  // w tal que a los precios actuales las shares igualen el prior
  function pesosDesdeShare(comps, beta, sharesPrior) {
    return comps.map(function (c, i) { return sharesPrior[i] / Math.exp(-beta * c.precio); });
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

  /* Los renderizadores de las antiguas pestañas de elasticidad y movimiento de
     precio se eliminaron: ahora tools/decidir.js dibuja ambos graficos desde
     esta misma matematica, en vez de mantener un segundo modelo en paralelo
     que daba un optimo distinto para el mismo producto. Este archivo es solo
     calculo y no toca el DOM. */


  window.PricingModelo = {
    estado: estado,
    _regresion: regresion, _breakEven: breakEven, _triangular: triangular,
    _caminoPrior: caminoPrior, _caminoDispersion: caminoDispersion, _caminoPromo: caminoPromo,
    _caminoEquilibrio: caminoEquilibrio,
    _logit: logit, _betaDesde: betaDesde, _optimoBertrand: optimoBertrand,
    _sharePrior: sharePrior, _pesosDesdeShare: pesosDesdeShare,
    _competidores: competidores, _mediana: mediana
  };
})();
