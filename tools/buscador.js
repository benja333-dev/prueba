/* Buscador de SKU: pide el barrido a n8n, agrupa las ofertas en variantes y
   arma la comparativa por cadena.

   El barrido vive en n8n porque el navegador no puede leer sitios de terceros
   (politica de mismo origen). n8n devuelve JSON con CORS abierto.
*/
(function () {
  /* Ruta corta. n8n publica tambien una forma con el UUID del nodo, pero esa
     devuelve 500: la unica que responde en produccion es /webhook/<path>. */
  var API = 'https://n8n-production-121a.up.railway.app/webhook/buscador-pricing';

  var CLP = function (n) {
    return (n == null || isNaN(n)) ? '—' : '$' + Math.round(n).toLocaleString('es-CL');
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var $ = function (id) { return document.getElementById(id); };

  var EJEMPLOS = ['lechuga', 'palta hass', 'coca cola zero', 'leche entera', 'arroz grado 1', 'detergente'];

  /* Cadenas que bloquean el acceso automatico: se ofrece abrir la ficha a mano.
     Lider protege con PerimeterX + Queue-it + Akamai; Tottus con Cloudflare;
     Santa Isabel renderiza el catalogo en el cliente. */
  var MANUALES = [
    ['Lider', 'https://www.lider.cl/supermercado/search?query='],
    ['Santa Isabel', 'https://www.santaisabel.cl/busqueda?ft='],
    ['Tottus', 'https://www.tottus.cl/tottus-cl/busqueda?Ntt=']
  ];

  var ultimo = { termino: '', filas: [], variantes: [] };

  var CADENAS = /lider|jumbo|santa\s*isabel|santaisabel|unimarc|alvi|tottus|acuenta|mayorista\s*10|erbi|montserrat/i;
  var esCadena = function (f) { return CADENAS.test(f.retailer || ''); };

  /* Agrupa ofertas en "variantes": el mismo producto vendido por distintos.
     Dos cosas definen comparabilidad y ninguna se puede relajar:
     el formato (1,5 L no compite con una lata de 350 ml) y el nombre.
     Sin medida declarada un item NO es comparable, asi que se queda solo en
     su grupo: agruparlos entre si juntaba una botella de restaurante con un
     pack de 24 latas y producia brechas absurdas de 700%. */
  function normalizar(nombre) {
    return (nombre || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(oferta|promo|unidad|un|uds|c\/u|bandeja|malla|bolsa|granel|botella|lata|desechable|retornable)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function clave(f) {
    var bruto = (f.nombre || '').toLowerCase();
    var n = normalizar(f.nombre);
    if (!(f.cantidad && f.unidad)) return 'sinmedida:' + n;
    // Un combo ("Coca 3 L + Sprite 3 L") comparte medida con la botella suelta
    // pero no es el mismo producto: se marca aparte o el precio sale inflado.
    var combo = (bruto.indexOf('+') >= 0 || /\bpack\b/.test(bruto)) ? 'combo:' : '';
    var palabras = n.split(' ').filter(function (p) { return p.length > 2 && !/^\d+$/.test(p); });
    return combo + palabras.slice(0, 4).sort().join(' ') + '|' + f.cantidad + f.unidad;
  }

  function agrupar(filas) {
    var mapa = {};
    filas.forEach(function (f) {
      var k = clave(f);
      (mapa[k] = mapa[k] || []).push(f);
    });
    return Object.keys(mapa).map(function (k) {
      var g = mapa[k];
      var precios = g.map(function (x) { return x.precio; }).filter(Boolean).sort(function (a, b) { return a - b; });
      var etiqueta = g.slice().sort(function (a, b) {
        return (b.nombre || '').length - (a.nombre || '').length;
      })[0].nombre;
      return {
        clave: k, etiqueta: etiqueta, ofertas: g,
        cadenas: Array.from(new Set(g.map(function (x) { return x.retailer; }))).length,
        // lo que hace util una variante es en cuantos SUPERMERCADOS aparece:
        // un producto en 7 restaurantes distintos no es un set competitivo.
        cadenasSuper: Array.from(new Set(g.filter(esCadena).map(function (x) { return x.retailer; }))).length,
        min: precios[0], max: precios[precios.length - 1],
        cantidad: g[0].cantidad, unidad: g[0].unidad
      };
    }).sort(function (a, b) {
      return b.cadenasSuper - a.cadenasSuper || b.cadenas - a.cadenas || b.ofertas.length - a.ofertas.length;
    });
  }

  function pintarVariantes() {
    var sel = $('sel-variante');
    sel.innerHTML = ultimo.variantes.map(function (v, i) {
      return '<option value="' + i + '">' + esc(v.etiqueta) +
        '  ·  ' + (v.cadenasSuper ? v.cadenasSuper + (v.cadenasSuper === 1 ? ' supermercado' : ' supermercados')
                                  : v.cadenas + ' vendedor' + (v.cadenas === 1 ? '' : 'es')) +
        '  ·  ' + CLP(v.min) + (v.min !== v.max ? ' a ' + CLP(v.max) : '') + '</option>';
    }).join('');
    $('card-variantes').style.display = '';
    sel.onchange = function () { pintarComparativa(parseInt(this.value, 10)); };
    pintarComparativa(0);
  }

  function pintarComparativa(idx) {
    var v = ultimo.variantes[idx];
    if (!v) return;
    var ofertas = v.ofertas.slice().sort(function (a, b) {
      // supermercados primero: un restaurante revendiendo no es competencia
      var ca = esCadena(a) ? 0 : 1, cb = esCadena(b) ? 0 : 1;
      return ca - cb || a.precio - b.precio;
    });

    var ETIQ = {
      'directo': ['Directo del sitio', '#27853A'],
      'google-super': ['Google · supermercado', '#1F5FA9'],
      'google-otro': ['Google · otro vendedor', '#8a5d00'],
      'manual': ['Capturado a mano', '#6b3fa0']
    };

    var h = '<thead><tr><th>Cadena</th><th>Producto</th><th class="num">Lista</th>' +
      '<th class="num">Con promo</th><th class="num">Efectivo</th><th class="num">Por unidad</th>' +
      '<th>Mecánica / rebate</th><th>Fuente</th></tr></thead><tbody>';
    ofertas.forEach(function (f) {
      var et = ETIQ[f.origen] || ['—', '#666'];
      var nom = f.url
        ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.nombre) + '</a>'
        : esc(f.nombre);
      var rebate = [];
      if (f.mecanica) rebate.push('<span class="tag" style="border-color:#E8A020;color:#8a5d00">' + esc(f.mecanica) + '</span>');
      if (f.requiere_lealtad) rebate.push('<span class="tag" style="border-color:#6b3fa0;color:#6b3fa0">' + esc(f.requiere_lealtad) + '</span>');
      h += '<tr><td><b>' + esc(f.retailer) + '</b></td><td>' + nom + '</td>' +
        '<td class="num">' + CLP(f.precio_lista) + '</td>' +
        '<td class="num">' + (f.mecanica ? CLP(f.precio) : '—') + '</td>' +
        '<td class="num"><b>' + CLP(f.precio) + '</b></td>' +
        '<td class="num">' + (f.precio_por_unidad ? CLP(f.precio_por_unidad) + '/' + f.unidad : '—') + '</td>' +
        '<td>' + (rebate.length ? rebate.join(' ') : '<span style="color:#999">sin promo detectada</span>') + '</td>' +
        '<td><span class="tag" style="border-color:' + et[1] + ';color:' + et[1] + '">' + et[0] + '</span></td></tr>';
    });
    $('tabla-comparativa').innerHTML = h + '</tbody>';
    $('card-comparativa').style.display = '';

    var supers = ofertas.filter(esCadena);
    var base = supers.length >= 2 ? supers : ofertas;
    var porPrecio = base.slice().sort(function (a, b) { return a.precio - b.precio; });
    var barato = porPrecio[0], caro = porPrecio[porPrecio.length - 1];
    var brecha = (barato && caro && barato.precio) ? (caro.precio / barato.precio - 1) : null;
    $('note-comparativa').innerHTML = '<b>' + esc(v.etiqueta) + '</b> · ' + ofertas.length +
      ' ofertas' + (supers.length ? ', ' + supers.length + ' en supermercados' : '') +
      (brecha != null && brecha > 0
        ? '. Brecha de <b>' + (brecha * 100).toFixed(0) + '%</b> entre ' + esc(barato.retailer) +
          ' (' + CLP(barato.precio) + ') y ' + esc(caro.retailer) + ' (' + CLP(caro.precio) + ').'
        : '.');

    var sinPromo = ofertas.filter(function (f) { return f.origen === 'directo' && !f.mecanica; }).length;
    $('foot-comparativa').innerHTML =
      'La columna <b>Efectivo</b> es el precio que realmente paga el shopper: incorpora la promoción cuando existe. ' +
      'Un rebate marcado <b>Club</b> sólo aplica a socios, así que subestima el precio del no inscrito. ' +
      (sinPromo ? 'Jumbo ya no publica su mecánica promocional en el HTML, así que sus filas muestran sólo precio de venta. ' : '') +
      'Comparar precio de góndola entre cadenas sin normalizar la mecánica induce a error: por eso la comparación se hace por precio efectivo y por unidad.';

    // datos para las otras pestañas
    window.__DATOS_PRICING = { termino: ultimo.termino, filas: ultimo.filas, variante: v, ofertas: ofertas };
    document.dispatchEvent(new CustomEvent('pricing:datos'));
  }

  function pintarManual(q) {
    $('links-manual').innerHTML = MANUALES.map(function (m) {
      return '<a class="chip-link" href="' + m[1] + encodeURIComponent(q) + '" target="_blank" rel="noopener">' +
        'Abrir ' + m[0] + ' &#8599;</a>';
    }).join('');
    $('foot-bookmarklet').innerHTML =
      'Estos botones abren la ficha en tu navegador, pero <b>la página no puede leer el contenido de otro sitio</b>: ' +
      'la política de mismo origen del navegador lo impide, y no es algo que se pueda programar distinto. ' +
      'Si necesitas el precio exacto de Lider dentro del modelo, cópialo a mano en la pestaña de movimiento de precio.';
    $('card-manual').style.display = '';
  }

  function buscar(q) {
    q = (q || '').trim();
    if (q.length < 2) return;
    $('q').value = q;
    var btn = $('btn-buscar');
    btn.disabled = true;
    $('estado-busqueda').innerHTML = '<span class="spinner"></span>Barriendo precios de "' + esc(q) +
      '" en Jumbo, Alvi y Google Shopping. Toma unos 20 segundos.';
    $('card-variantes').style.display = 'none';
    $('card-comparativa').style.display = 'none';

    fetch(API + '?q=' + encodeURIComponent(q) + '&formato=json', { method: 'GET' })
      .then(function (r) {
        if (!r.ok) throw new Error('El servicio respondió ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var filas = j.resultados || [];
        if (!filas.length) {
          $('estado-busqueda').innerHTML = '<div class="aviso">No se encontraron precios para "' + esc(q) +
            '". Prueba un término más común, o con la marca incluida.</div>';
          btn.disabled = false;
          pintarManual(q);
          return;
        }
        ultimo = { termino: q, filas: filas, variantes: agrupar(filas) };
        $('estado-busqueda').innerHTML = '<b>' + filas.length + '</b> precios en <b>' +
          (j.n_vendedores || 0) + '</b> vendedores · ' + esc(j.capturado || '') +
          (j.por_fuente ? '<br><span style="color:#999">' + esc(j.por_fuente) + '</span>' : '');
        pintarVariantes();
        pintarManual(q);
        btn.disabled = false;
      })
      .catch(function (e) {
        $('estado-busqueda').innerHTML = '<div class="aviso"><b>No se pudo completar el barrido.</b> ' +
          esc(e.message) + '. El barrido corre en n8n: si el servicio está caído o el workflow desactivado, ' +
          'esta pestaña no puede funcionar. Las cadenas bloqueadas siguen disponibles abajo para revisión manual.</div>';
        pintarManual(q);
        btn.disabled = false;
      });
  }

  function iniciar() {
    $('ejemplos').innerHTML = 'Prueba con ' + EJEMPLOS.map(function (e) {
      return '<a data-q="' + esc(e) + '">' + esc(e) + '</a>';
    }).join('');
    $('ejemplos').addEventListener('click', function (ev) {
      var a = ev.target.closest('a[data-q]');
      if (a) buscar(a.getAttribute('data-q'));
    });
    $('btn-buscar').addEventListener('click', function () { buscar($('q').value); });
    $('q').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') buscar(this.value);
    });
    var inicial = new URLSearchParams(location.search).get('q');
    if (inicial) buscar(inicial);
  }

  window.Buscador = { iniciar: iniciar, buscar: buscar, _agrupar: agrupar, _clave: clave };
})();
