/* Pantalla de decision: buscar producto, ver como esta el mercado y elegir precio.
   Todo en una vista, en lenguaje de negocio y sin jerga de pricing.

   Se apoya en PricingModelo para los calculos; aqui solo se decide que mostrar
   y como decirlo. La regla de redaccion: cada numero va acompanado de que
   significa para el negocio, porque el usuario objetivo no sabe que es una
   elasticidad y no tiene por que saberlo.
*/
(function () {
  var M = window.PricingModelo;
  var $ = function (id) { return document.getElementById(id); };
  var CLP = function (n) {
    return (n == null || isNaN(n) || !isFinite(n)) ? '—' : '$' + Math.round(n).toLocaleString('es-CL');
  };
  var PCT = function (n, d) {
    return (n == null || !isFinite(n)) ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(d == null ? 1 : d) + '%';
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  var st = { comps: [], variante: null, termino: '', costo: null, volumen: 1000, miShare: 0.15, precio: null };

  /* ─────────── Mercado: barras comparativas simples ─────────── */
  function pintarMercado() {
    var c = st.comps;
    if (!c.length) { $('d-mercado').innerHTML = ''; return; }
    var precios = c.map(function (x) { return x.precio; }).concat([st.precio]);
    var lo = Math.min.apply(null, precios) * 0.92, hi = Math.max.apply(null, precios) * 1.08;
    var pos = function (p) { return ((p - lo) / (hi - lo)) * 100; };

    var filas = c.slice().sort(function (a, b) { return a.precio - b.precio; }).map(function (x) {
      var gap = (x.precio - st.precio) / st.precio;
      var color = Math.abs(gap) < 0.02 ? '#8FA3B0' : (gap > 0 ? '#27853A' : '#C0392B');
      return '<div class="barra-fila">' +
        '<div class="barra-nom">' + esc(x.retailer) + '</div>' +
        '<div class="barra-pista"><div class="barra-punto" style="left:' + pos(x.precio).toFixed(1) + '%;background:' + color + '"></div></div>' +
        '<div class="barra-val">' + CLP(x.precio) + '</div>' +
        '<div class="barra-gap" style="color:' + color + '">' + (Math.abs(gap) < 0.005 ? 'igual que tú' : (gap > 0 ? PCT(gap) + ' más caro' : PCT(gap) + ' más barato')) + '</div>' +
        '</div>';
    }).join('');

    $('d-mercado').innerHTML =
      '<div class="barra-fila barra-yo">' +
        '<div class="barra-nom"><b>TÚ</b></div>' +
        '<div class="barra-pista"><div class="barra-punto" style="left:' + pos(st.precio).toFixed(1) + '%;background:#2251FF;width:13px;height:13px"></div></div>' +
        '<div class="barra-val"><b>' + CLP(st.precio) + '</b></div>' +
        '<div class="barra-gap"></div>' +
      '</div>' + filas;
  }

  /* ─────────── Decision ─────────── */
  function decidir() {
    var p = st.precio, c = st.costo, vol = st.volumen;
    if (!(p > 0) || !(c >= 0) || c >= p) {
      $('d-veredicto').innerHTML = '<div class="aviso">Revisa el costo: tiene que ser menor que el precio.</div>';
      $('d-kpis').innerHTML = ''; $('d-pros').innerHTML = '';
      return;
    }
    var e = M.estado.epsilon || -1.5;
    var pBase = st.precioBase;
    var d = (p - pBase) / pBase;

    // Set competitivo con mi ficha dentro
    var conmigo = [{ retailer: 'TÚ', precio: pBase }].concat(st.comps.map(function (x) {
      return { retailer: x.retailer, precio: x.precio };
    }));
    var crudos = st.comps.map(function (x) { return M._sharePrior(x.retailer); });
    var suma = crudos.reduce(function (a, b) { return a + b; }, 0) || 1;
    var prior = [st.miShare].concat(crudos.map(function (v) { return (1 - st.miShare) * v / suma; }));
    var beta = M._betaDesde(e, pBase, st.miShare);
    var pesos = M._pesosDesdeShare(conmigo, beta, prior);
    var antes = M._logit(conmigo, beta, pesos);
    var despues = M._logit([{ retailer: 'TÚ', precio: p }].concat(st.comps.map(function (x) {
      return { retailer: x.retailer, precio: x.precio };
    })), beta, pesos);

    var q0 = vol, q1 = vol * (despues[0].share / antes[0].share);
    var margen0 = pBase - c, margen1 = p - c;
    var util0 = q0 * margen0, util1 = q1 * margen1;
    var dUtil = util1 - util0, dQ = (q1 - q0) / q0;

    // Precio que maximiza utilidad, buscado sobre el rango de mercado ampliado
    var precios = st.comps.map(function (x) { return x.precio; });
    var pMin = Math.min.apply(null, precios), pMax = Math.max.apply(null, precios);
    /* Acotado al rango que el mercado sostiene: fuera de ahi el modelo deja de
       tener evidencia, y proponer un precio sobre el mas caro de todos es
       exactamente el error que comete la formula de monopolio. */
    var lo = Math.min(pMin, pBase) * 0.85, hi = Math.max(pMax, pBase) * 1.05, mejor = null;
    for (var i = 0; i <= 200; i++) {
      var pp = lo + (hi - lo) * i / 200;
      var dd = M._logit([{ retailer: 'TÚ', precio: pp }].concat(st.comps.map(function (x) {
        return { retailer: x.retailer, precio: x.precio };
      })), beta, pesos);
      var u = vol * (dd[0].share / antes[0].share) * (pp - c);
      if (!mejor || u > mejor.u) mejor = { p: pp, u: u };
    }

    /* ── Veredicto ── */
    var mejora = dUtil > 0;
    var casiIgual = Math.abs(dUtil) < util0 * 0.005;
    var clase = casiIgual ? 'aviso' : (mejora ? 'bien' : 'aviso');
    var titulo = casiIgual
      ? 'A este precio ganas prácticamente lo mismo que hoy.'
      : (mejora
        ? 'A este precio ganas ' + CLP(Math.abs(dUtil)) + ' más al mes.'
        : 'A este precio pierdes ' + CLP(Math.abs(dUtil)) + ' al mes.');
    $('d-veredicto').innerHTML = '<div class="' + clase + '" style="font-size:14.5px;line-height:1.65">' +
      '<b>' + titulo + '</b><br>' +
      (Math.abs(d) < 0.002
        ? 'Es tu precio actual.'
        : (d > 0
          ? 'Subes ' + PCT(d) + ' respecto de tu precio de hoy (' + CLP(pBase) + '). Vendes ' + PCT(dQ) +
            ' en unidades, pero ganas ' + CLP(margen1 - margen0) + ' más en cada una.'
          : 'Bajas ' + PCT(d) + ' respecto de tu precio de hoy (' + CLP(pBase) + '). Vendes ' + PCT(dQ) +
            ' en unidades, pero ganas ' + CLP(Math.abs(margen1 - margen0)) + ' menos en cada una.')) +
      '</div>';

    /* ── Cifras ── */
    $('d-kpis').innerHTML = '<div class="kpi">' +
      '<div><div class="l">Unidades al mes</div><div class="v">' + Math.round(q1).toLocaleString('es-CL') + '</div>' +
        '<div class="dd">' + (Math.abs(dQ) < 0.002 ? 'sin cambio' : PCT(dQ) + ' vs hoy') + '</div></div>' +
      '<div><div class="l">Ganas por unidad</div><div class="v">' + CLP(margen1) + '</div>' +
        '<div class="dd">' + (margen1 >= margen0 ? '+' : '') + CLP(margen1 - margen0).replace('$-', '−$') + ' vs hoy</div></div>' +
      '<div><div class="l">Utilidad al mes</div><div class="v" style="color:' + (dUtil >= 0 ? '#27853A' : '#C0392B') + '">' + CLP(util1) + '</div>' +
        '<div class="dd">' + (dUtil >= 0 ? '+' : '−') + CLP(Math.abs(dUtil)) + ' vs hoy</div></div>' +
      '<div><div class="l">Mejor precio posible</div><div class="v">' + CLP(mejor.p) + '</div>' +
        '<div class="dd">rinde ' + CLP(mejor.u) + ' al mes</div></div>' +
      '</div>';

    /* ── Pros y contras, en lenguaje llano ── */
    var pros = [], contras = [];
    if (d > 0.002) {
      pros.push('Cada unidad deja <b>' + CLP(margen1 - margen0) + ' más</b> de margen.');
      contras.push('Vendes <b>' + PCT(dQ) + '</b> en unidades: unos ' + Math.abs(Math.round(q1 - q0)).toLocaleString('es-CL') + ' menos al mes.');
      var fuga = antes[0].share - despues[0].share;
      var gan = despues.slice(1).map(function (x, i) { return { r: x.retailer, g: x.share - antes[i + 1].share }; })
        .sort(function (a, b) { return b.g - a.g; })[0];
      if (gan && fuga > 0) contras.push('Quien más se lleva esos compradores es <b>' + esc(gan.r) + '</b> (' + (gan.g / fuga * 100).toFixed(0) + '% de los que se van).');
      if (p > pMax) contras.push('Quedas <b>más caro que todas</b> las cadenas del set. Es el punto donde el shopper empieza a notar la diferencia.');
      else if (p > pMin) pros.push('Sigues dentro del rango que cobra el mercado (' + CLP(pMin) + ' a ' + CLP(pMax) + ').');
    } else if (d < -0.002) {
      pros.push('Vendes <b>' + PCT(dQ) + '</b> en unidades: unos ' + Math.round(q1 - q0).toLocaleString('es-CL') + ' más al mes.');
      contras.push('Cada unidad deja <b>' + CLP(Math.abs(margen1 - margen0)) + ' menos</b> de margen.');
      if (p < pMin) contras.push('Quedas <b>más barato que todas</b> las cadenas. Ganas volumen, pero regalas margen que nadie te está exigiendo.');
      if (dUtil > 0) pros.push('El volumen extra <b>sí compensa</b> el margen que resignas.');
      else contras.push('El volumen extra <b>no alcanza</b> a compensar el margen perdido.');
    } else {
      pros.push('Es tu precio de hoy: sirve como punto de comparación.');
    }
    if (Math.abs(mejor.p - p) / p > 0.03) {
      (mejor.p > p ? pros : contras).push('El mejor precio dentro del rango de mercado es <b>' + CLP(mejor.p) + '</b>: ' +
        (mejor.p > p ? 'tienes espacio para subir.' : 'estás cobrando por sobre el punto que más rinde.'));
    }
    if (mejor.p >= hi * 0.995) {
      contras.push('El cálculo se topa con el borde del rango de mercado. Significa que <b>conviene ser el más caro</b>, ' +
        'lo que casi siempre delata que el costo está subestimado o que la competencia es más agresiva de lo que se ve. ' +
        'Trátalo como dirección, no como destino.');
    }

    $('d-pros').innerHTML =
      '<div class="dos-col">' +
      '<div><div class="lab-col" style="color:#27853A">A favor</div><ul class="lista">' +
        (pros.length ? pros.map(function (x) { return '<li>' + x + '</li>'; }).join('') : '<li style="color:#999">—</li>') +
      '</ul></div>' +
      '<div><div class="lab-col" style="color:#C0392B">En contra</div><ul class="lista">' +
        (contras.length ? contras.map(function (x) { return '<li>' + x + '</li>'; }).join('') : '<li style="color:#999">—</li>') +
      '</ul></div></div>';

    pintarMercado();
  }

  /* ─────────── Se activa cuando el buscador entrega un SKU ─────────── */
  function activar(ofertas, etiqueta, termino) {
    st.comps = M._competidores(ofertas);
    st.termino = termino;
    if (st.comps.length < 1) {
      $('d-decision').style.display = 'none';
      $('d-sin-set').style.display = '';
      return;
    }
    $('d-sin-set').style.display = 'none';
    $('d-decision').style.display = '';

    /* La elasticidad se triangula aqui, no en la pestaña de metodo: si el
       usuario nunca la abre, antes se caia a un -1,5 por defecto y el "mejor
       precio" salia por encima de todo el mercado. */
    var c1 = M._caminoPrior(termino);
    var c2 = M._caminoDispersion(st.comps);
    var c3 = M._caminoPromo(st.comps, 0.28);
    var c4 = M._caminoEquilibrio(st.comps, 0.70);
    var tri = M._triangular([c1, c2, c3, c4]);
    if (M.estado.origenEpsilon !== 'medido' && tri.e != null) {
      M.estado.epsilon = tri.e;
      M.estado.origenEpsilon = 'triangulado';
    }

    var med = M._mediana(st.comps.map(function (x) { return x.precio; }));
    st.precioBase = Math.round(med);
    st.precio = st.precioBase;
    st.costo = Math.round(med * 0.70);

    var precios = st.comps.map(function (x) { return x.precio; });
    var lo = Math.round(Math.min.apply(null, precios) * 0.75), hi = Math.round(Math.max.apply(null, precios) * 1.25);
    var sl = $('d-precio');
    sl.min = lo; sl.max = hi; sl.step = Math.max(1, Math.round((hi - lo) / 200)); sl.value = st.precio;
    $('d-precio-val').textContent = CLP(st.precio);
    $('d-costo').value = st.costo;
    $('d-vol').value = st.volumen;
    $('d-base').textContent = CLP(st.precioBase);
    decidir();
  }

  function enlazar() {
    $('d-precio').addEventListener('input', function () {
      st.precio = +this.value;
      $('d-precio-val').textContent = CLP(st.precio);
      decidir();
    });
    $('d-costo').addEventListener('input', function () { st.costo = +this.value; decidir(); });
    $('d-vol').addEventListener('input', function () { st.volumen = +this.value; decidir(); });
    $('d-base-set').addEventListener('click', function () {
      st.precioBase = st.precio; $('d-base').textContent = CLP(st.precioBase); decidir();
    });
    document.addEventListener('pricing:datos', function () {
      var d = window.__DATOS_PRICING;
      if (d && d.ofertas && d.ofertas.length) activar(d.ofertas, d.variante && d.variante.etiqueta, d.termino);
    });
  }

  window.Decidir = { enlazar: enlazar, activar: activar, _st: st };
})();
