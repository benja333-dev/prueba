#!/usr/bin/env python3
"""Actualiza pricing_dinamico_chile.html con precios frescos de Jumbo, Unimarc y Alvi.

No hay API publica en ninguna cadena (se probaron los endpoints VTEX
/api/catalog_system/*: Jumbo responde 404 y Unimarc 500). Los precios vienen
embebidos en el HTML, y cada cadena lo embebe DISTINTO:

  - SMU (Unimarc, Alvi): JSON completo en __NEXT_DATA__. Es la fuente rica:
    trae precio lista, precio promocional, mecanica, ppum, EAN y precio Club.
  - Cencosud (Jumbo): migro a React Server Components y ya NO expone
    __REACT_QUERY_STATE__ (por eso la captura venia saliendo vacia). Lo que
    si expone es un ItemList de schema.org en <script type="application/ld+json">
    mas atributos data-gtm-impression con el skuId. De ahi se reconstruye el
    producto, pero solo con precio de venta: sin precio lista ni mecanica.

Lider (521 en su BFF), Tottus (desafio Cloudflare) y Santa Isabel (render en
cliente, su HTML no trae productos) no son automatizables sin navegador.

La cobertura se amplia por dos ejes: varias categorias por cadena y paginacion
(?page=N) hasta que una pagina no aporta SKUs nuevos.

El propio HTML es la plantilla: se le reemplaza el bloque PAYLOAD entre los
marcadores, asi el diseno se edita sin tocar este script.

Uso:  python3 tools/actualizar_pricing.py [--diagnostico]
"""
import concurrent.futures, html as html_mod, json, re, subprocess, sys, datetime, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "pricing_dinamico_chile.html"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# Cencosud sirve un shell liviano SIN datos si se envian los Sec-Fetch-*.
HDRS_SIMPLE = ["-A", UA, "-H", "Accept: text/html,application/xhtml+xml",
               "-H", "Accept-Language: es-CL,es;q=0.9"]
# SMU (Unimarc/Alvi) responde 403 si NO se envian.
HDRS_FULL = ["-A", UA,
             "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
             "-H", "Accept-Language: es-CL,es;q=0.9,en;q=0.8",
             "-H", 'sec-ch-ua: "Chromium";v="126", "Google Chrome";v="126"',
             "-H", 'sec-ch-ua-platform: "macOS"', "-H", "sec-ch-ua-mobile: ?0",
             "-H", "Sec-Fetch-Dest: document", "-H", "Sec-Fetch-Mode: navigate",
             "-H", "Sec-Fetch-Site: none", "-H", "Sec-Fetch-User: ?1",
             "-H", "Upgrade-Insecure-Requests: 1"]

MAX_PAGINAS = 6          # tope duro por fuente; la paginacion corta antes si se agota
PARALELO = 6             # descargas simultaneas

# Cada fuente rinde ~40-50 SKUs por pagina. Las categorias de Unimarc estan
# verificadas contra el sitio; las de Jumbo y Alvi usan busqueda porque sus
# slugs de categoria no son estables.
FUENTES = [
    # (retailer, parser, perfil, categoria, plantilla_url)
    ("Unimarc", "smu", "full", "Bebidas",
     "https://www.unimarc.cl/category/bebidas-y-licores/bebidas/bebidas-regulares?page={p}"),
    ("Unimarc", "smu", "full", "Bebidas",
     "https://www.unimarc.cl/category/bebidas-y-licores/bebidas/bebidas-light-y-zero?page={p}"),
    ("Unimarc", "smu", "full", "Lacteos",
     "https://www.unimarc.cl/category/lacteos-huevos-y-refrigerados?page={p}"),
    ("Unimarc", "smu", "full", "Despensa",
     "https://www.unimarc.cl/category/despensa?page={p}"),
    ("Unimarc", "smu", "full", "Bebidas",
     "https://www.unimarc.cl/search?q=bebida&page={p}"),
    ("Unimarc", "smu", "full", "Snacks",
     "https://www.unimarc.cl/search?q=snack&page={p}"),
    ("Unimarc", "smu", "full", "Limpieza",
     "https://www.unimarc.cl/search?q=detergente&page={p}"),

    ("Alvi", "smu", "full", "Bebidas", "https://www.alvi.cl/search?q=bebida&page={p}"),
    ("Alvi", "smu", "full", "Bebidas", "https://www.alvi.cl/search?q=coca%20cola&page={p}"),
    ("Alvi", "smu", "full", "Lacteos", "https://www.alvi.cl/search?q=leche&page={p}"),
    ("Alvi", "smu", "full", "Despensa", "https://www.alvi.cl/search?q=arroz&page={p}"),
    ("Alvi", "smu", "full", "Snacks", "https://www.alvi.cl/search?q=galleta&page={p}"),

    ("Jumbo", "cenco", "simple", "Bebidas",
     "https://www.jumbo.cl/licores-bebidas-y-aguas/bebidas-gaseosas?page={p}"),
    ("Jumbo", "cenco", "simple", "Bebidas",
     "https://www.jumbo.cl/busqueda?ft=coca%20cola&page={p}"),
    ("Jumbo", "cenco", "simple", "Bebidas",
     "https://www.jumbo.cl/busqueda?ft=bebida&page={p}"),
    ("Jumbo", "cenco", "simple", "Lacteos",
     "https://www.jumbo.cl/busqueda?ft=leche&page={p}"),
    ("Jumbo", "cenco", "simple", "Despensa",
     "https://www.jumbo.cl/busqueda?ft=arroz&page={p}"),
    ("Jumbo", "cenco", "simple", "Snacks",
     "https://www.jumbo.cl/busqueda?ft=galleta&page={p}"),
]

GRUPOS = {"Jumbo": "Cencosud", "Santa Isabel": "Cencosud", "Unimarc": "SMU", "Alvi": "SMU"}
HOSTS = {"Jumbo": "jumbo.cl", "Unimarc": "unimarc.cl", "Alvi": "alvi.cl"}

# Categoria foco del informe: es la unica que se compara SKU a SKU.
CATEGORIA_FOCO = "Bebidas"
MARCAS_FOCO = ["coca", "pepsi", "sprite", "fanta", "nordic", "limon soda",
               "canada dry", "crush", "kem", "bilz", "pap"]


def get(url, perfil):
    h = HDRS_FULL if perfil == "full" else HDRS_SIMPLE
    r = subprocess.run(["curl", "-sL", "--compressed", "--max-time", "45", *h, url],
                       capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def json_embebido(html, marcador):
    i = html.find(marcador)
    if i < 0:
        return None
    s = html.find(">", i) + 1
    e = html.find("</script>", s)
    if s <= 0 or e < 0:
        return None
    try:
        return json.loads(html[s:e])
    except Exception:
        return None


def promo_efectiva(promos, precio_base):
    mejor = {"mecanica": None, "precio_efectivo": precio_base}
    for p in promos or []:
        txt = " ".join(str(p.get(k, "")) for k in ("name", "description", "descriptionMessage"))
        m = (re.search(r"[Ll]leva\s*(\d+)\s*por\s*\$?([\d.]+)", txt)
             or re.search(r"(\d+)\s*[xX]\s*\$?\s*([\d.]{3,})", txt))
        if m:
            n, tot = int(m.group(1)), int(m.group(2).replace(".", ""))
            if n > 0 and round(tot / n) < mejor["precio_efectivo"]:
                mejor = {"mecanica": f"{n} x ${tot:,.0f}".replace(",", "."),
                         "precio_efectivo": round(tot / n)}
    return mejor


def medida_de_nombre(nombre):
    """Devuelve (cantidad, unidad_normalizada) donde unidad es 'L' o 'kg'.

    Generaliza el viejo calculo de litros: sin esto, cualquier categoria que no
    sea bebidas queda sin precio por unidad y por lo tanto fuera del indice.
    """
    n = (nombre or "").lower()
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(kg\b|kilo|gr\b|grs\b|g\b|l\b|lt\b|litro|ml\b|cc\b)", n)
    if not m:
        return (None, None)
    v = float(m.group(1).replace(",", "."))
    u = m.group(2)
    if u in ("ml", "cc"):
        cant, uni = v / 1000, "L"
    elif u in ("l", "lt", "litro"):
        cant, uni = v, "L"
    elif u in ("gr", "grs", "g"):
        cant, uni = v / 1000, "kg"
    else:
        cant, uni = v, "kg"
    pk = re.search(r"(\d+)\s*un", n)
    if pk:
        cant *= int(pk.group(1))
    return (round(cant, 4), uni)


def litros_de_nombre(nombre):
    cant, uni = medida_de_nombre(nombre)
    return cant if uni == "L" else None


def parse_smu(html, retailer, categoria):
    """Unimarc y Alvi comparten el Next.js de SMU: el producto viene PLANO."""
    j = json_embebido(html, "__NEXT_DATA__")
    if not j:
        return []
    pp = (j.get("props") or {}).get("pageProps") or {}
    qs = (pp.get("dehydratedState") or {}).get("queries") or []
    clp = lambda s: int(re.sub(r"[^\d]", "", str(s))) if s else None
    out = []
    for q in qs:
        data = (q.get("state") or {}).get("data") or {}
        for p in data.get("availableProducts", []):
            seller = (p.get("sellers") or [{}])[0] or {}
            promo = p.get("promotion") or {}
            det = p.get("priceDetail") or {}
            nombre = p.get("nameComplete") or p.get("name") or ""
            # unitMultiplierUn ya viene en litros totales del pack: no re-multiplicar.
            cant = uni = None
            if str(p.get("measurementUnitUn", "")).lower() in ("litro", "l", "lt"):
                cant, uni = p.get("unitMultiplierUn"), "L"
            elif str(p.get("measurementUnitUn", "")).lower() in ("kilo", "kg"):
                cant, uni = p.get("unitMultiplierUn"), "kg"
            if not cant:
                cant, uni = medida_de_nombre(nombre)
            tag = (det.get("promotionalTag") or {}).get("text")
            imgs = p.get("images") or []
            out.append({
                "retailer": retailer, "grupo": GRUPOS.get(retailer), "categoria": categoria,
                "sku": str(p.get("sku")),
                "ean": p.get("ean"), "nombre": nombre, "marca": p.get("brand"),
                "cantidad": round(cant, 4) if cant else None, "unidad": uni,
                "litros": round(cant, 4) if cant and uni == "L" else None,
                "precio_lista": seller.get("listPrice") or clp(det.get("listPrice")),
                "precio_normal": seller.get("price"),
                "ppum_lista": clp(seller.get("ppumListPrice")), "ppum_normal": clp(seller.get("ppum")),
                "stock": (seller.get("availableQuantity") or 0) > 0,
                "mecanica": promo.get("descriptionMessage") or det.get("discountPrice") or None,
                # Precio condicionado a lealtad: palanca distinta a un descuento abierto.
                "requiere_lealtad": tag if tag and "club" in (tag or "").lower() else None,
                "precio_efectivo": promo.get("price") or seller.get("price"),
                "imagen": imgs[0] if imgs else None,
                "url": f"https://www.{HOSTS.get(retailer,'')}/product/{p.get('slug')}" if p.get("slug") else None,
            })
    return out


def _skus_gtm(html):
    """Mapea url-del-producto -> skuId leyendo los atributos data-gtm-impression.

    El ld+json no trae el skuId y sin el no hay clave estable para deduplicar
    entre corridas; el atributo de GTM si lo trae, con las comillas escapadas.
    """
    mapa = {}
    for bruto in re.findall(r'data-gtm-impression="([^"]+)"', html):
        try:
            d = json.loads(html_mod.unescape(bruto))
        except Exception:
            continue
        if d.get("id") and d.get("name"):
            mapa[d["name"].strip().lower()] = {
                "sku": str(d.get("id")), "ref": d.get("refId"),
                "categoria_sitio": d.get("category"),
            }
    return mapa


def parse_cencosud(html, retailer, categoria):
    """Jumbo (React Server Components): el catalogo viable es el ItemList de schema.org.

    Solo entrega precio de venta; el sitio ya no publica precio lista ni la
    mecanica promocional en el HTML, asi que esos campos quedan en None y el
    informe los trata como 'sin promo detectada'.
    """
    out = []
    gtm = _skus_gtm(html)
    for bloque in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            j = json.loads(bloque)
        except Exception:
            continue
        if not isinstance(j, dict) or j.get("@type") != "ItemList":
            continue
        for el in j.get("itemListElement") or []:
            it = el.get("item") or {}
            oferta = it.get("offers") or {}
            if isinstance(oferta, list):
                oferta = oferta[0] if oferta else {}
            precio = oferta.get("price")
            nombre = it.get("name") or el.get("name")
            if precio is None or not nombre:
                continue
            try:
                precio = int(round(float(precio)))
            except Exception:
                continue
            meta = gtm.get(nombre.strip().lower(), {})
            cant, uni = medida_de_nombre(nombre)
            marca = (it.get("brand") or {}).get("name") if isinstance(it.get("brand"), dict) else it.get("brand")
            url = it.get("url") or el.get("url")
            out.append({
                "retailer": retailer, "grupo": GRUPOS.get(retailer), "categoria": categoria,
                # Sin skuId de GTM se cae a la url, que tambien es unica por producto.
                "sku": meta.get("sku") or (url or nombre),
                "ean": None, "nombre": nombre, "marca": marca,
                "cantidad": cant, "unidad": uni,
                "litros": cant if uni == "L" else None,
                "precio_lista": precio, "precio_normal": precio,
                "ppum_lista": None, "ppum_normal": None,
                "stock": "InStock" in str(oferta.get("availability") or ""),
                "mecanica": None, "requiere_lealtad": None,
                "precio_efectivo": precio,
                "imagen": it.get("image"),
                "url": url,
            })
    return out


def capturar_fuente(fuente):
    """Descarga una fuente pagina por pagina hasta que deje de aportar SKUs nuevos."""
    retailer, parser, perfil, categoria, plantilla = fuente
    filas, vistos, paginas = [], set(), 0
    for p in range(1, MAX_PAGINAS + 1):
        html = get(plantilla.format(p=p), perfil)
        r = (parse_cencosud(html, retailer, categoria) if parser == "cenco"
             else parse_smu(html, retailer, categoria))
        nuevos = [x for x in r if x["sku"] not in vistos]
        paginas = p
        if not nuevos:
            break
        vistos.update(x["sku"] for x in nuevos)
        filas += nuevos
    return {"fuente": fuente, "filas": filas, "paginas": paginas,
            "url": plantilla.format(p=1)}


def es_de_categoria_foco(txt):
    # Limites de palabra: sin esto "pap" (bebida Pap) matchea "papaya".
    return any(re.search(r"\b" + re.escape(m) + r"\b", txt) for m in MARCAS_FOCO)


def mediana(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return None
    return s[n // 2] if n % 2 else round((s[n // 2 - 1] + s[n // 2]) / 2)


def resumen_por_categoria(catalogo):
    """Indice de precios por retailer x categoria: la vista que hace util tener
    mas productos (un SKU no dice si una cadena es cara, la mediana si)."""
    grupos = {}
    for x in catalogo:
        if not x.get("precio_por_unidad"):
            continue
        grupos.setdefault((x["categoria"], x["retailer"]), []).append(x)
    filas = []
    for (cat, ret), xs in sorted(grupos.items()):
        ppu = [x["precio_por_unidad"] for x in xs]
        con_promo = [x for x in xs if x.get("mecanica")]
        filas.append({
            "categoria": cat, "retailer": ret, "grupo": GRUPOS.get(ret),
            "n_skus": len(xs),
            "mediana_precio_unidad": mediana(ppu),
            "min_precio_unidad": min(ppu), "max_precio_unidad": max(ppu),
            "pct_en_promo": round(100 * len(con_promo) / len(xs)),
        })
    # Indice 100 = cadena mas barata de esa categoria.
    for cat in {f["categoria"] for f in filas}:
        pares = [f for f in filas if f["categoria"] == cat]
        base = min(f["mediana_precio_unidad"] for f in pares)
        for f in pares:
            f["indice"] = round(100 * f["mediana_precio_unidad"] / base) if base else None
    return filas


def main():
    diagnostico = "--diagnostico" in sys.argv
    crudo, diag, fallos = [], [], []

    with concurrent.futures.ThreadPoolExecutor(max_workers=PARALELO) as ex:
        for res in ex.map(capturar_fuente, FUENTES):
            retailer, _, _, categoria, _ = res["fuente"]
            diag.append(f"  {retailer:9} {categoria:9} {len(res['filas']):4} SKUs "
                        f"({res['paginas']} pag)  {res['url']}")
            if not res["filas"]:
                fallos.append(f"{retailer}/{categoria} ({res['url']}) devolvio 0")
            crudo += res["filas"]

    vistos, dedup = set(), []
    for r in crudo:
        k = (r["retailer"], r["sku"])
        if k in vistos:
            continue
        vistos.add(k)
        dedup.append(r)

    catalogo = []
    for r in dedup:
        if not r.get("precio_lista"):
            continue
        if r.get("cantidad") and r.get("precio_efectivo"):
            r["precio_por_unidad"] = round(r["precio_efectivo"] / r["cantidad"])
        if r.get("litros") and r.get("precio_efectivo"):
            r["precio_por_litro"] = round(r["precio_efectivo"] / r["litros"])
        if r.get("litros") and r.get("precio_lista"):
            r["ppl_lista"] = round(r["precio_lista"] / r["litros"])
        catalogo.append(r)

    # Universo = la categoria foco, que es la que el informe compara SKU a SKU.
    universo = [x for x in catalogo
                if x.get("precio_por_litro") and x.get("litros") and x["litros"] <= 8
                and es_de_categoria_foco(((x.get("nombre") or "") + " " + (x.get("marca") or "")).lower())]
    foco = [x for x in universo
            if "coca" in (x["nombre"] or "").lower()
            and ("zero" in (x["nombre"] or "").lower() or "sin az" in (x["nombre"] or "").lower())
            and x["litros"] == 1.5 and "pack" not in (x["nombre"] or "").lower()]

    print("\n".join(diag))
    if not universo:
        print("ERROR: captura vacia. Detalle:\n  " + "\n  ".join(fallos), file=sys.stderr)
        return 1

    categorias = resumen_por_categoria(catalogo)

    payload = {
        "meta": {
            "sku_foco": "Coca-Cola Zero 1.5 L",
            "categoria": "Bebidas gaseosas sin azúcar",
            "capturado": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "retailers_auto": sorted({x["retailer"] for x in universo}),
            "grupos": sorted({x["grupo"] for x in universo if x.get("grupo")}),
            "n_skus": len(universo),
            "n_catalogo": len(catalogo),
            "categorias": sorted({x["categoria"] for x in catalogo}),
            "con_foto": sum(1 for x in universo if x.get("imagen")),
        },
        "universo": universo,
        "foco": foco,
        "resumen_categorias": categorias,
    }

    print(f"\nOK  {len(catalogo)} SKUs en catalogo · {len(universo)} en la categoria foco · "
          f"{len(foco)} del SKU foco · {', '.join(payload['meta']['retailers_auto'])}")
    for f in foco:
        print(f"    {f['retailer']:9} lista ${f['precio_lista']} → efectivo ${f['precio_efectivo']} "
              f"(${f['precio_por_litro']}/L) {f.get('mecanica') or 'sin promo'}")
    print("\n  Indice por categoria (100 = mas barato):")
    for c in categorias:
        print(f"    {c['categoria']:9} {c['retailer']:9} {c['n_skus']:4} SKUs  "
              f"mediana ${c['mediana_precio_unidad']}/{'L o kg'}  indice {c['indice']}  "
              f"{c['pct_en_promo']}% en promo")
    if fallos:
        print("\nAVISO: fuentes sin datos:\n  " + "\n  ".join(fallos), file=sys.stderr)

    if diagnostico:
        print("\n(--diagnostico: no se reescribe el informe)")
        return 0

    html = SALIDA.read_text(encoding="utf-8")
    if "__END_DATA__" not in html:
        print("ERROR: el HTML no tiene el marcador __END_DATA__", file=sys.stderr)
        return 1

    # Si los precios no se movieron, no reescribir: la marca de tiempo cambia en
    # cada corrida y generaria un commit diario aunque no haya nada nuevo.
    previo = re.search(r"const PAYLOAD = (.*?); /\*__END_DATA__\*/", html, re.S)
    if previo:
        try:
            antes = json.loads(previo.group(1))
            if (antes.get("universo") == payload["universo"]
                    and antes.get("resumen_categorias") == payload["resumen_categorias"]):
                print(f"\nSin cambios de precio desde {antes['meta']['capturado']}: "
                      f"no se reescribe el informe.")
                return 0
        except Exception:
            pass

    nuevo = re.sub(r"const PAYLOAD = .*?/\*__END_DATA__\*/",
                   lambda m: "const PAYLOAD = " + json.dumps(payload, ensure_ascii=False) + "; /*__END_DATA__*/",
                   html, count=1, flags=re.S)
    SALIDA.write_text(nuevo, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
