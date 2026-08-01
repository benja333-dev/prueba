/* Pantalla de decision: buscar un producto, ver donde queda mi precio frente a
   cada cadena y elegir cuanto cobrar.

   Todo lo que se muestra sale de UNA sola funcion de utilidad (`modelo()`),
   incluidos los dos graficos. Antes la curva de "espacio para mover el precio"
   usaba su propio supuesto (elasticidad fija -1,6 y optimo de Lerner) mientras
   las cifras usaban el logit: la misma pagina daba dos optimos distintos para
   el mismo producto. Ahora hay un unico modelo y los graficos son su dibujo.

   Regla de redaccion: cada numero va acompanado de lo que significa para el
   negocio. Quien usa esto no tiene por que saber que es una elasticidad.
*/
(function () {
  var M = window.PricingModelo;
  var $ = function (id) { return document.getElementById(id); };

  var CLP = function (n) {
    return (n == null || isNaN(n) || !isFinite(n)) ? '—' : '$' + Math.round(n).toLocaleString('es-CL');
  };
  var PCT = function (n, d) {
    return (n == null || !isFinite(n)) ? '—' : (n >= 0 ? '+' : '−') + (Math.abs(n) * 100).toFixed(d == null ? 1 : d) + '%';
  };
  /* Cifras de plata en los ejes: "$1,2 M" se lee de un vistazo, "$1.243.918" no. */
  var corto = function (n) {
    if (n == null || !isFinite(n)) return '—';
    var s = n < 0 ? '−' : '';
    n = Math.abs(n);
    if (n >= 1e6) return s + '$' + (n / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1e3) return s + '$' + Math.round(n / 1e3) + ' mil';
    return s + '$' + Math.round(n);
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var corta = function (s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  /* VTEX sirve el original a 1000x1000 (~125 KB). El segmento -W-H del path
     devuelve una miniatura de ~7 KB, que es todo lo que necesita el encabezado. */
  var mini = function (url, px) {
    if (!url) return null;
    return url.replace(/\/arquivos\/ids\/(\d+)(-\d+-\d+)?\//, '/arquivos/ids/$1-' + px + '-' + px + '/');
  };

  var COL = { yo: '#2251FF', opt: '#27853A', mal: '#C0392B', gris: '#8FA3B0', linea: '#051C2C', suave: '#D8DEE2' };

  var st = {
    comps: [], etiqueta: '', termino: '', foto: null, unidad: null,
    costo: null, volumen: 1000, miShare: 0.15,
    precio: null, precioBase: null, epsilon: -1.5, tri: null, listo: false
  };

  /* ═════════════ El modelo, una sola vez por repintado ═════════════
     Logit de atraccion calibrado a la participacion de mercado de cada cadena,
     con equilibrio de Bertrand. `evaluar(p)` responde: si cobro p, cuantas
     unidades vendo y cuanto gano. Los graficos y las cifras lo llaman igual. */
  function modelo() {
    var comps = st.comps, pBase = st.precioBase, c = st.costo, vol = st.volumen;
    var crudos = comps.map(function (x) { return M._sharePrior(x.retailer); });
    var suma = crudos.reduce(function (a, b) { return a + b; }, 0) || 1;
    var prior = [st.miShare].concat(crudos.map(function (v) { return (1 - st.miShare) * v / suma; }));

    var beta = M._betaDesde(st.epsilon, pBase, st.miShare);
    var conmigo = [{ retailer: 'TÚ', precio: pBase }].concat(comps);
    var pesos = M._pesosDesdeShare(conmigo, beta, prior);
    var antes = M._logit(conmigo, beta, pesos);
    var s0 = antes[0].share;

    function evaluar(p) {
      var d = M._logit([{ retailer: 'TÚ', precio: p }].concat(comps), beta, pesos);
      var q = vol * (d[0].share / s0);
      return { p: p, q: q, share: d[0].share, margen: p - c, util: q * (p - c), dist: d };
    }

    var precios = comps.map(function (x) { return x.precio; });
    var pMin = Math.min.apply(null, precios), pMax = Math.max.apply(null, precios);
    /* El barrido se acota al rango que el mercado sostiene: fuera de ahi el
       modelo no tiene evidencia, y recomendar un precio por encima del mas caro
       de todos es exactamente el error de la formula de monopolio. */
    var lo = Math.min(pMin, pBase) * 0.85, hi = Math.max(pMax, pBase) * 1.05;

    var curva = [], mejor = null;
    for (var i = 0; i <= 220; i++) {
      var pp = lo + (hi - lo) * i / 220;
      var e = evaluar(pp);
      curva.push(e);
      if (!mejor || e.util > mejor.util) mejor = e;
    }
    return {
      beta: beta, antes: antes, evaluar: evaluar, curva: curva, mejor: mejor,
      lo: lo, hi: hi, pMin: pMin, pMax: pMax, base: evaluar(pBase)
    };
  }

  /* ═════════════ Grafico 1 · Escalera de precios ═════════════
     Una fila por cadena, ordenadas de mas barata a mas cara, con la mia dentro.
     El eje no arranca en cero a proposito (en un rango de $2.900 a $3.400 las
     barras desde cero serian indistinguibles) y por eso se dibuja como punto
     sobre una linea, no como barra: una barra truncada enganaria la lectura. */
  function pintarEscalera(m) {
    var filas = st.comps.map(function (x) {
      return { nom: x.retailer, precio: x.precio, yo: false, n: x.n };
    });
    filas.push({ nom: 'TU PRECIO', precio: st.precio, yo: true });
    filas.sort(function (a, b) { return a.precio - b.precio; });

    var W = 780, FIL = 26, T = 34, B = 34, H = filas.length * FIL + T + B;
    var L = 132, R = 150;
    var lo = Math.min(m.lo, st.precio) , hi = Math.max(m.hi, st.precio);
    var pad = (hi - lo) * 0.06;
    lo -= pad; hi += pad;
    var x = function (p) { return L + ((p - lo) / (hi - lo)) * (W - L - R); };

    var s = '<g class="grid">';
    for (var i = 0; i <= 4; i++) { var v = lo + (hi - lo) * i / 4; s += '<line x1="' + x(v).toFixed(1) + '" y1="' + (T - 12) + '" x2="' + x(v).toFixed(1) + '" y2="' + (H - B + 4) + '"/>'; }
    s += '</g>';

    /* Franja del mejor precio: es la respuesta de la pagina, tiene que verse
       sobre la misma escala en la que el usuario compara a la competencia. */
    s += '<line x1="' + x(m.mejor.p).toFixed(1) + '" y1="' + (T - 16) + '" x2="' + x(m.mejor.p).toFixed(1) +
      '" y2="' + (H - B + 4) + '" stroke="' + COL.opt + '" stroke-width="1.6" stroke-dasharray="4,3"/>' +
      '<text class="ax" x="' + x(m.mejor.p).toFixed(1) + '" y="' + (T - 21) + '" text-anchor="middle" ' +
      'style="fill:' + COL.opt + ';font-weight:700">mejor precio ' + CLP(m.mejor.p) + '</text>';

    filas.forEach(function (f, i) {
      var y = T + i * FIL + FIL / 2;
      var gap = st.precio ? (f.precio - st.precio) / st.precio : 0;
      var col = f.yo ? COL.yo : (Math.abs(gap) < 0.02 ? COL.gris : (gap > 0 ? COL.opt : COL.mal));
      s += '<text class="lbl' + (f.yo ? ' b' : '') + '" x="0" y="' + (y + 4) + '">' + esc(corta(f.nom, 17)) + '</text>';
      s += '<line x1="' + L + '" y1="' + y + '" x2="' + x(f.precio).toFixed(1) + '" y2="' + y +
        '" stroke="' + (f.yo ? COL.yo : COL.suave) + '" stroke-width="' + (f.yo ? 3 : 2) + '"/>';
      s += '<circle cx="' + x(f.precio).toFixed(1) + '" cy="' + y + '" r="' + (f.yo ? 6.5 : 5) + '" fill="' + col + '"/>';
      s += '<text class="val" x="' + (x(f.precio) + 11).toFixed(1) + '" y="' + (y + 4) + '"' +
        (f.yo ? '' : ' style="font-weight:400;fill:#666"') + '>' + CLP(f.precio) + '</text>';
      if (!f.yo) {
        s += '<text class="ax" x="' + (W - 4) + '" y="' + (y + 4) + '" text-anchor="end" style="fill:' + col + '">' +
          (Math.abs(gap) < 0.005 ? 'igual que tú'
            : PCT(gap, 0) + (gap > 0 ? ' más caro' : ' más barato')) + '</text>';
      }
    });
    for (var k = 0; k <= 4; k++) {
      var vv = lo + (hi - lo) * k / 4;
      s += '<text class="ax" x="' + x(vv).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + CLP(vv) + '</text>';
    }
    var g = $('svg-escalera');
    g.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    g.innerHTML = s;

    var orden = filas.slice().sort(function (a, b) { return a.precio - b.precio; });
    var pos = orden.findIndex(function (f) { return f.yo; }) + 1;
    var masBaratas = pos - 1, masCaras = orden.length - pos;
    $('pie-escalera').innerHTML = 'A ' + CLP(st.precio) + ' quedas <b>' + pos + '° de ' + orden.length + '</b> ' +
      'de más barato a más caro: ' + (masBaratas ? '<b>' + masBaratas + '</b> cadena' + (masBaratas === 1 ? '' : 's') + ' por debajo' : 'nadie por debajo') +
      ' y ' + (masCaras ? '<b>' + masCaras + '</b> por encima' : 'nadie por encima') + '. ' +
      '<span style="color:' + COL.mal + '">Rojo</span> = esa cadena está más barata que tú, y te quita compradores. ' +
      '<span style="color:' + COL.opt + '">Verde</span> = está más cara, y te los deja. ' +
      'El eje no parte en cero, por eso cada cadena se marca con un punto y no con una barra: ' +
      'una barra truncada exageraría las diferencias.';
  }

  /* ═════════════ Grafico 2 · Cuanto espacio hay para mover el precio ═════════════
     Utilidad mensual contra precio. Lo que se decide aqui no es el punto maximo
     sino el ANCHO de la banda plana: si el 99% de la utilidad se consigue en un
     tramo de $300, ese tramo es el margen real de maniobra frente a un
     competidor, y ahi es donde se negocia. */
  function pintarEspacio(m) {
    /* T deja aire arriba para la etiqueta del optimo y para los nombres de las
       cadenas; B, para el eje de precios y la marca "tú". Dibujadas todas en la
       misma franja se encaballaban. */
    var W = 780, H = 336, L = 62, R = 22, T = 42, B = 72;
    var pts = m.curva;
    var maxU = m.mejor.util, minU = Math.min.apply(null, pts.map(function (p) { return p.util; }));
    var y0 = Math.min(0, minU), y1 = maxU * 1.16;
    var x = function (p) { return L + ((p - m.lo) / (m.hi - m.lo)) * (W - L - R); };
    var y = function (u) { return H - B - ((u - y0) / (y1 - y0)) * (H - T - B); };

    var s = '<g class="grid">';
    for (var i = 0; i <= 4; i++) { var u = y0 + (y1 - y0) * i / 4; s += '<line x1="' + L + '" y1="' + y(u).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(u).toFixed(1) + '"/>'; }
    s += '</g>';

    // Banda donde se gana al menos el 99% del maximo: el espacio de maniobra.
    var zona = pts.filter(function (p) { return p.util >= maxU * 0.99; });
    var zLo = zona.length ? zona[0].p : null, zHi = zona.length ? zona[zona.length - 1].p : null;
    if (zona.length > 1) {
      s += '<rect x="' + x(zLo).toFixed(1) + '" y="' + T + '" width="' + Math.max(1, x(zHi) - x(zLo)).toFixed(1) +
        '" height="' + (H - T - B) + '" fill="#AAE6F0" opacity=".38"/>';
    }

    for (var k = 0; k <= 4; k++) {
      var uu = y0 + (y1 - y0) * k / 4;
      s += '<text class="ax" x="' + (L - 8) + '" y="' + (y(uu) + 3).toFixed(1) + '" text-anchor="end">' + corto(uu) + '</text>';
    }
    s += '<text class="axlab" x="0" y="14">Lo que ganas al mes</text>';

    // Precios de la competencia, como marcas al pie del eje.
    var usados = [];
    st.comps.slice().sort(function (a, b) { return a.precio - b.precio; }).forEach(function (c) {
      if (c.precio < m.lo || c.precio > m.hi) return;
      var px = x(c.precio), nivel = 0;
      while (usados.some(function (u) { return u.nivel === nivel && Math.abs(u.px - px) < 76; })) nivel++;
      usados.push({ px: px, nivel: nivel });
      var ty = T + 12 + nivel * 11;
      var anc = px < L + 40 ? 'start' : (px > W - R - 40 ? 'end' : 'middle');
      s += '<line x1="' + px.toFixed(1) + '" y1="' + (ty + 3) + '" x2="' + px.toFixed(1) + '" y2="' + (H - B) +
        '" stroke="' + COL.gris + '" stroke-width="1" stroke-dasharray="2,3"/>' +
        '<text class="ax" x="' + (px + (anc === 'start' ? 3 : anc === 'end' ? -3 : 0)).toFixed(1) + '" y="' + ty +
        '" text-anchor="' + anc + '" style="fill:#667;font-size:9px">' + esc(corta(c.retailer, 12)) + '</text>';
    });

    s += '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.p).toFixed(1) + ',' + y(p.util).toFixed(1); }).join(' ') +
      '" fill="none" stroke="' + COL.linea + '" stroke-width="2.4"/>';

    for (var j = 0; j <= 5; j++) {
      var pj = m.lo + (m.hi - m.lo) * j / 5;
      s += '<text class="ax" x="' + x(pj).toFixed(1) + '" y="' + (H - 34) + '" text-anchor="middle">' + CLP(pj) + '</text>';
    }
    s += '<text class="axlab" x="' + ((L + W - R) / 2) + '" y="' + (H - 13) + '" text-anchor="middle">Precio que cobras</text>';

    /* La etiqueta del optimo va anclada arriba del area de dibujo, no flotando
       sobre la curva: cuando el optimo cae cerca del maximo se encaballaba con
       los nombres de las cadenas. */
    s += '<line x1="' + x(m.mejor.p).toFixed(1) + '" y1="' + T + '" x2="' + x(m.mejor.p).toFixed(1) + '" y2="' + (H - B) +
      '" stroke="' + COL.opt + '" stroke-width="1.6" stroke-dasharray="4,3"/>' +
      '<circle cx="' + x(m.mejor.p).toFixed(1) + '" cy="' + y(m.mejor.util).toFixed(1) + '" r="5" fill="' + COL.opt + '"/>' +
      '<text class="val" x="' + x(m.mejor.p).toFixed(1) + '" y="' + (T - 9) +
      '" text-anchor="middle" style="fill:' + COL.opt + '">mejor precio ' + CLP(m.mejor.p) + '</text>';

    var act = m.evaluar(st.precio);
    s += '<line x1="' + x(st.precio).toFixed(1) + '" y1="' + T + '" x2="' + x(st.precio).toFixed(1) + '" y2="' + (H - B) +
      '" stroke="' + COL.yo + '" stroke-width="1.8"/>' +
      '<circle cx="' + x(st.precio).toFixed(1) + '" cy="' + y(act.util).toFixed(1) + '" r="5.5" fill="' + COL.yo + '"/>' +
      '<text class="val" x="' + x(st.precio).toFixed(1) + '" y="' + (H - B + 15) + '" text-anchor="middle" style="fill:' + COL.yo + '">tú</text>';

    var g = $('svg-espacio');
    g.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    g.innerHTML = s;

    var captura = maxU > 0 ? act.util / maxU : 0;
    $('pie-espacio').innerHTML =
      (zona.length > 1
        ? 'Entre <b>' + CLP(zLo) + '</b> y <b>' + CLP(zHi) + '</b> ganas prácticamente lo mismo (99% del máximo). ' +
          'Ese tramo de <b>' + CLP(zHi - zLo) + '</b> es tu espacio real de maniobra: puedes moverte ahí para responder ' +
          'a la competencia sin resignar utilidad. '
        : 'La curva es muy puntiaguda: casi no tienes espacio para alejarte del óptimo sin perder utilidad. ') +
      'A ' + CLP(st.precio) + ' capturas el <b>' + (captura * 100).toFixed(0) + '%</b> de lo máximo que este producto puede rendirte.';
  }

  /* ═════════════ Encabezado del producto ═════════════ */
  function pintarResumen(m) {
    /* Si la foto no carga (la cadena la sirve tras un referer, o cambio el id)
       la celda tiene que quedar como "sin foto", no como un hueco roto. */
    var cajaFoto = st.foto
      ? '<div class="rs-foto"><img src="' + esc(mini(st.foto, 160)) + '" alt="" loading="lazy" ' +
        'onerror="this.parentNode.className=\'rs-foto rs-vacia\';this.parentNode.textContent=\'sin foto\'"></div>'
      : '<div class="rs-foto rs-vacia">sin foto</div>';
    var nSuper = st.comps.length;
    $('d-resumen').innerHTML =
      cajaFoto +
      '<div class="rs-id"><div class="rs-nom">' + esc(st.etiqueta || st.termino) + '</div>' +
        '<div class="rs-sub">' + nSuper + ' cadena' + (nSuper === 1 ? '' : 's') + ' con precio · ' +
        'de ' + CLP(m.pMin) + ' a ' + CLP(m.pMax) + '</div></div>' +
      '<div class="rs-cif"><div class="rs-l">Precio recomendado</div>' +
        '<div class="rs-n" style="color:' + COL.opt + '">' + CLP(m.mejor.p) + '</div>' +
        '<div class="rs-d">rinde ' + CLP(m.mejor.util) + ' al mes</div></div>' +
      '<div class="rs-cif"><div class="rs-l">El precio que estás evaluando</div>' +
        '<div class="rs-n">' + CLP(st.precio) + '</div>' +
        '<div class="rs-d">' + (Math.abs(st.precio - m.mejor.p) / m.mejor.p < 0.01
          ? 'es el recomendado'
          : (st.precio > m.mejor.p ? PCT((st.precio - m.mejor.p) / m.mejor.p, 0) + ' sobre el recomendado'
                                   : PCT((st.precio - m.mejor.p) / m.mejor.p, 0) + ' bajo el recomendado')) + '</div></div>';
  }

  /* ═════════════ Veredicto, cifras y pros/contras ═════════════ */
  function pintarDecision(m) {
    var pBase = st.precioBase, c = st.costo;
    var hoy = m.base, ahora = m.evaluar(st.precio);
    var dUtil = ahora.util - hoy.util;
    var dQ = (ahora.q - hoy.q) / hoy.q;
    var d = (st.precio - pBase) / pBase;

    var casiIgual = Math.abs(dUtil) < hoy.util * 0.005;
    var titulo = casiIgual
      ? 'A este precio ganas prácticamente lo mismo que hoy.'
      : (dUtil > 0 ? 'A este precio ganas ' + CLP(Math.abs(dUtil)) + ' más al mes.'
                   : 'A este precio pierdes ' + CLP(Math.abs(dUtil)) + ' al mes.');
    $('d-veredicto').innerHTML = '<div class="' + (casiIgual || dUtil <= 0 ? 'aviso' : 'bien') + '">' +
      '<b>' + titulo + '</b><br>' +
      (Math.abs(d) < 0.002
        ? 'Es tu precio de referencia.'
        : (d > 0
          ? 'Subes ' + PCT(d) + ' sobre tu referencia (' + CLP(pBase) + '). Vendes ' + PCT(dQ) +
            ' en unidades y ganas ' + CLP(ahora.margen - hoy.margen) + ' más en cada una.'
          : 'Bajas ' + PCT(d) + ' bajo tu referencia (' + CLP(pBase) + '). Vendes ' + PCT(dQ) +
            ' en unidades y ganas ' + CLP(Math.abs(ahora.margen - hoy.margen)) + ' menos en cada una.')) +
      '</div>';

    $('d-kpis').innerHTML =
      fila('Unidades al mes', Math.round(ahora.q).toLocaleString('es-CL'),
        Math.abs(dQ) < 0.002 ? 'sin cambio' : PCT(dQ) + ' vs referencia', null) +
      fila('Ganas por unidad', CLP(ahora.margen),
        (ahora.margen >= hoy.margen ? '+' : '−') + CLP(Math.abs(ahora.margen - hoy.margen)) + ' vs referencia', null) +
      fila('Utilidad al mes', CLP(ahora.util),
        (dUtil >= 0 ? '+' : '−') + CLP(Math.abs(dUtil)) + ' vs referencia', dUtil >= 0 ? COL.opt : COL.mal) +
      fila('Margen sobre el precio', ((ahora.margen / st.precio) * 100).toFixed(0) + '%',
        'costo ' + CLP(c) + ' por unidad', null);

    /* Pros y contras. Se escriben en plata y unidades, nunca en elasticidad. */
    var pros = [], contras = [];
    if (d > 0.002) {
      pros.push('Cada unidad deja <b>' + CLP(ahora.margen - hoy.margen) + ' más</b> de margen.');
      contras.push('Vendes <b>' + PCT(dQ) + '</b> en unidades: unos ' +
        Math.abs(Math.round(ahora.q - hoy.q)).toLocaleString('es-CL') + ' menos al mes.');
      var fuga = hoy.share - ahora.share;
      var gana = ahora.dist.slice(1).map(function (x, i) { return { r: x.retailer, g: x.share - hoy.dist[i + 1].share }; })
        .sort(function (a, b) { return b.g - a.g; })[0];
      if (gana && fuga > 0) {
        contras.push('Quien más se lleva a esos compradores es <b>' + esc(gana.r) + '</b> (' +
          (gana.g / fuga * 100).toFixed(0) + '% de los que se van).');
      }
      if (st.precio > m.pMax) contras.push('Quedas <b>más caro que todas</b> las cadenas. Ahí el shopper empieza a notar la diferencia.');
      else pros.push('Sigues dentro del rango que cobra el mercado (' + CLP(m.pMin) + ' a ' + CLP(m.pMax) + ').');
    } else if (d < -0.002) {
      pros.push('Vendes <b>' + PCT(dQ) + '</b> en unidades: unos ' +
        Math.round(ahora.q - hoy.q).toLocaleString('es-CL') + ' más al mes.');
      contras.push('Cada unidad deja <b>' + CLP(Math.abs(ahora.margen - hoy.margen)) + ' menos</b> de margen.');
      if (st.precio < m.pMin) contras.push('Quedas <b>más barato que todas</b> las cadenas: ganas volumen, pero regalas margen que nadie te estaba exigiendo.');
      (dUtil > 0 ? pros : contras).push(dUtil > 0
        ? 'El volumen extra <b>sí compensa</b> el margen que resignas.'
        : 'El volumen extra <b>no alcanza</b> a compensar el margen perdido.');
    } else {
      pros.push('Es tu precio de referencia: sirve de punto de comparación.');
    }
    if (Math.abs(m.mejor.p - st.precio) / st.precio > 0.03) {
      (m.mejor.p > st.precio ? pros : contras).push('El mejor precio dentro del rango de mercado es <b>' + CLP(m.mejor.p) + '</b>: ' +
        (m.mejor.p > st.precio ? 'tienes espacio para subir.' : 'estás cobrando por sobre el punto que más rinde.'));
    }
    if (m.mejor.p >= m.hi * 0.995) {
      contras.push('El cálculo se topa con el borde del rango de mercado: dice que conviene ser <b>el más caro de todos</b>. ' +
        'Eso casi siempre delata que el costo está subestimado. Trátalo como dirección, no como destino.');
    }
    if (st.comps.length < 3) {
      contras.push('Sólo hay <b>' + st.comps.length + '</b> cadena' + (st.comps.length === 1 ? '' : 's') +
        ' con precio para este producto. Carga las que faltan más abajo: con pocas referencias el modelo es frágil.');
    }

    $('d-pros').innerHTML =
      '<div class="dos-col">' +
      '<div><div class="lab-col" style="color:' + COL.opt + '">A favor</div><ul class="lista">' +
        (pros.length ? pros.map(function (x) { return '<li>' + x + '</li>'; }).join('') : '<li style="color:#999">—</li>') +
      '</ul></div>' +
      '<div><div class="lab-col" style="color:' + COL.mal + '">En contra</div><ul class="lista">' +
        (contras.length ? contras.map(function (x) { return '<li>' + x + '</li>'; }).join('') : '<li style="color:#999">—</li>') +
      '</ul></div></div>';
  }

  function fila(l, v, d, color) {
    return '<div class="kf"><div class="kf-l">' + l + '</div>' +
      '<div class="kf-v"' + (color ? ' style="color:' + color + '"' : '') + '>' + v + '</div>' +
      '<div class="kf-d">' + d + '</div></div>';
  }

  /* ═════════════ Supuestos, para que nada quede escondido ═════════════ */
  function pintarSupuestos() {
    var t = st.tri;
    if (!t || t.e == null) { $('d-supuestos').innerHTML = ''; return; }
    /* Se listan los cuatro caminos, incluidos los que no aportaron: saber que
       uno quedo fuera por falta de datos es tan informativo como su resultado. */
    var caminos = (t.caminos || []).map(function (c) {
      var vale = c.e != null && c.peso > 0;
      return '<tr' + (vale ? '' : ' style="color:#999"') + '><td>' + esc(c.id) + '</td>' +
        '<td class="num">' + (vale ? c.e.toFixed(2) : 'sin datos') + '</td>' +
        '<td class="num">' + (vale ? c.peso.toFixed(1) : '—') + '</td>' +
        '<td>' + (c.detalle || c.base || '') + '</td></tr>';
    }).join('');
    $('d-supuestos').innerHTML =
      '<div style="overflow-x:auto"><table>' +
      '<thead><tr><th>Cómo se estimó la sensibilidad al precio</th><th class="num">Da</th>' +
        '<th class="num">Pesa</th><th>Sobre qué</th></tr></thead>' +
      '<tbody>' + caminos +
      '<tr class="foco"><td><b>Conclusión (promedio ponderado)</b></td><td class="num"><b>' +
        st.epsilon.toFixed(2) + '</b></td><td class="num">—</td><td><b>' +
        (t.convergen ? 'Los ' + t.n + ' caminos convergen' : 'Los caminos discrepan (de ' + t.min.toFixed(2) + ' a ' + t.max.toFixed(2) + '): tómalo como rango, no como punto') +
        '</b></td></tr></tbody></table></div>' +
      '<div class="foot">Se lee así: con una sensibilidad de <b>' + st.epsilon.toFixed(2) + '</b>, subir el precio 10% ' +
      'hace caer las unidades alrededor de <b>' + (Math.abs(st.epsilon) * 10).toFixed(0) + '%</b>. ' +
      'El fundamento de cada camino está en la pestaña <b>Cómo se calcula</b>.</div>';
  }

  /* ═════════════ Repintado completo ═════════════ */
  function repintar() {
    if (!st.listo) return;
    if (!(st.precio > 0) || !(st.costo >= 0) || st.costo >= st.precio) {
      $('d-veredicto').innerHTML = '<div class="aviso"><b>Revisa el costo.</b> Tiene que ser un número menor que el precio.</div>';
      $('d-kpis').innerHTML = ''; $('d-pros').innerHTML = '';
      return;
    }
    var m = modelo();
    pintarResumen(m);
    pintarEscalera(m);
    pintarEspacio(m);
    pintarDecision(m);
  }

  /* ═════════════ Entrada: el buscador entrega un SKU ═════════════ */
  function activar(ofertas, etiqueta, termino) {
    st.comps = M._competidores(ofertas);
    st.termino = termino || st.termino;
    st.etiqueta = etiqueta || termino || '';
    st.foto = (ofertas.filter(function (o) { return o.imagen; })[0] || {}).imagen || null;

    if (st.comps.length < 1) {
      st.listo = false;
      $('d-decision').style.display = 'none';
      $('d-sin-set').style.display = '';
      return;
    }
    $('d-sin-set').style.display = 'none';
    $('d-decision').style.display = '';

    /* La elasticidad se triangula aqui y no en la pestaña de metodo: si el
       usuario nunca abre esa pestaña, antes se caia a un -1,5 por defecto y el
       "mejor precio" salia por encima de todo el mercado. */
    var caminos = [
      M._caminoPrior(st.termino + ' ' + st.etiqueta),
      M._caminoDispersion(st.comps),
      M._caminoPromo(st.comps, 0.28),
      M._caminoEquilibrio(st.comps, 0.70)
    ];
    var tri = M._triangular(caminos);
    st.tri = tri;
    if (tri && tri.e != null) {
      st.epsilon = tri.e;
      M.estado.epsilon = tri.e;
      M.estado.origenEpsilon = 'triangulado';
    }

    var med = M._mediana(st.comps.map(function (x) { return x.precio; }));
    st.precioBase = Math.round(med);
    st.precio = st.precioBase;
    st.costo = Math.round(med * 0.70);

    var precios = st.comps.map(function (x) { return x.precio; });
    var lo = Math.round(Math.min.apply(null, precios) * 0.75);
    var hi = Math.round(Math.max.apply(null, precios) * 1.25);
    var sl = $('d-precio');
    sl.min = lo; sl.max = hi; sl.step = Math.max(1, Math.round((hi - lo) / 240)); sl.value = st.precio;
    $('d-precio-val').textContent = CLP(st.precio);
    $('d-costo').value = st.costo;
    $('d-vol').value = st.volumen;
    $('d-base').textContent = CLP(st.precioBase);

    st.listo = true;
    pintarSupuestos();
    repintar();
  }

  function enlazar() {
    $('d-precio').addEventListener('input', function () {
      st.precio = +this.value;
      $('d-precio-val').textContent = CLP(st.precio);
      repintar();
    });
    $('d-costo').addEventListener('input', function () { st.costo = +this.value; repintar(); });
    $('d-vol').addEventListener('input', function () { st.volumen = +this.value; repintar(); });
    $('d-base-set').addEventListener('click', function () {
      st.precioBase = st.precio;
      $('d-base').textContent = CLP(st.precioBase);
      repintar();
    });
    $('d-ir-mejor').addEventListener('click', function () {
      var m = modelo();
      st.precio = Math.round(m.mejor.p);
      $('d-precio').value = st.precio;
      $('d-precio-val').textContent = CLP(st.precio);
      repintar();
    });
    document.addEventListener('pricing:datos', function () {
      var d = window.__DATOS_PRICING;
      if (d && d.ofertas && d.ofertas.length) activar(d.ofertas, d.variante && d.variante.etiqueta, d.termino);
    });
  }

  window.Decidir = { enlazar: enlazar, activar: activar, _st: st, _modelo: modelo };
})();
