#!/usr/bin/env python3
"""Actualiza pricing_dinamico_chile.html con precios frescos de Jumbo, Unimarc y Alvi.

No hay API publica en ninguna de las tres cadenas: los precios vienen embebidos
en el HTML de cada pagina. Cada retailer exige un perfil de headers DISTINTO
(ver HDRS_SIMPLE / HDRS_FULL) — es el detalle que mas facil se rompe.

El propio HTML es la plantilla: se le reemplaza el bloque PAYLOAD entre los
marcadores, asi el diseno se edita sin tocar este script.

Uso:  python3 tools/actualizar_pricing.py
"""
import json, re, subprocess, sys, datetime, pathlib

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

FUENTES = [
    ("Jumbo", "cenco", "simple", "https://www.jumbo.cl/licores-bebidas-y-aguas/bebidas-gaseosas"),
    ("Jumbo", "cenco", "simple", "https://www.jumbo.cl/busqueda?ft=coca%20cola%20zero"),
    ("Unimarc", "smu", "full", "https://www.unimarc.cl/category/bebidas-y-licores/bebidas/bebidas-light-y-zero"),
    ("Unimarc", "smu", "full", "https://www.unimarc.cl/category/bebidas-y-licores/bebidas/bebidas-regulares"),
    ("Alvi", "smu", "full", "https://www.alvi.cl/search?q=bebida"),
    ("Alvi", "smu", "full", "https://www.alvi.cl/search?q=coca%20cola%20zero"),
]
GRUPOS = {"Jumbo": "Cencosud", "Santa Isabel": "Cencosud", "Unimarc": "SMU", "Alvi": "SMU"}
HOSTS = {"Jumbo": "jumbo.cl", "Unimarc": "unimarc.cl", "Alvi": "alvi.cl"}
MARCAS = ["coca", "pepsi", "sprite", "fanta", "nordic", "limon soda",
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


def litros_de_nombre(nombre):
    n = (nombre or "").lower()
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(l\b|lt|litro|ml|cc)", n)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    lit = v / 1000 if m.group(2) in ("ml", "cc") else v
    pk = re.search(r"(\d+)\s*un", n)
    if pk:
        lit *= int(pk.group(1))
    return round(lit, 4)


def parse_cencosud(html, retailer):
    state = json_embebido(html, 'id="__REACT_QUERY_STATE__"')
    if not state:
        return []
    out = []

    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("items"), list) and node.get("brand"):
                for it in node["items"]:
                    if not isinstance(it, dict) or it.get("price") is None:
                        continue
                    lista = it.get("listPrice") or it.get("price")
                    lit = (it.get("unitMultiplierUn") if it.get("ppumMeasurementUnit") == "lt"
                           else litros_de_nombre(it.get("name")))
                    pr = promo_efectiva(it.get("promotions"), it.get("price") or lista)
                    imgs = it.get("images") or []
                    out.append({
                        "retailer": retailer, "grupo": GRUPOS.get(retailer), "sku": str(it.get("skuId")),
                        "nombre": it.get("name"), "marca": node.get("brand"), "litros": lit,
                        "precio_lista": lista, "precio_normal": it.get("price"),
                        "ppum_lista": it.get("ppumListPrice"), "ppum_normal": it.get("ppumPrice"),
                        "stock": bool(it.get("stock")), "mecanica": pr["mecanica"],
                        "requiere_lealtad": None, "precio_efectivo": pr["precio_efectivo"],
                        "imagen": imgs[0] if imgs else None,
                        "url": f"https://www.{HOSTS.get(retailer,'')}/{node.get('slug')}/p" if node.get("slug") else None,
                    })
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(state)
    return out


def parse_smu(html, retailer):
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
            lit = None
            if str(p.get("measurementUnitUn", "")).lower() in ("litro", "l", "lt"):
                lit = p.get("unitMultiplierUn")
            if not lit:
                lit = litros_de_nombre(nombre)
            tag = (det.get("promotionalTag") or {}).get("text")
            imgs = p.get("images") or []
            out.append({
                "retailer": retailer, "grupo": GRUPOS.get(retailer), "sku": str(p.get("sku")),
                "ean": p.get("ean"), "nombre": nombre, "marca": p.get("brand"),
                "litros": round(lit, 4) if lit else None,
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


def es_de_categoria(txt):
    # Limites de palabra: sin esto "pap" (bebida Pap) matchea "papaya".
    return any(re.search(r"\b" + re.escape(m) + r"\b", txt) for m in MARCAS)


def main():
    crudo, diag, fallos = [], [], []
    for retailer, tipo, perfil, url in FUENTES:
        html = get(url, perfil)
        r = parse_cencosud(html, retailer) if tipo == "cenco" else parse_smu(html, retailer)
        diag.append(f"  {retailer:9} {len(r):3} SKUs  {url}")
        if not r:
            fallos.append(f"{retailer} ({url}) devolvio 0; bytes={len(html)}")
        crudo += r

    vistos, dedup = set(), []
    for r in crudo:
        k = (r["retailer"], r["sku"])
        if k in vistos:
            continue
        vistos.add(k)
        dedup.append(r)

    todo = []
    for r in dedup:
        if not r.get("precio_lista"):
            continue
        if r.get("litros") and r.get("precio_efectivo"):
            r["precio_por_litro"] = round(r["precio_efectivo"] / r["litros"])
        if r.get("litros") and r.get("precio_lista"):
            r["ppl_lista"] = round(r["precio_lista"] / r["litros"])
        todo.append(r)

    universo = [x for x in todo
                if x.get("precio_por_litro") and x.get("litros") and x["litros"] <= 8
                and es_de_categoria(((x.get("nombre") or "") + " " + (x.get("marca") or "")).lower())]
    foco = [x for x in universo
            if "coca" in (x["nombre"] or "").lower()
            and ("zero" in (x["nombre"] or "").lower() or "sin az" in (x["nombre"] or "").lower())
            and x["litros"] == 1.5 and "pack" not in (x["nombre"] or "").lower()]

    print("\n".join(diag))
    if not universo:
        print("ERROR: captura vacia. Detalle:\n  " + "\n  ".join(fallos), file=sys.stderr)
        return 1

    payload = {
        "meta": {
            "sku_foco": "Coca-Cola Zero 1.5 L",
            "categoria": "Bebidas gaseosas sin azúcar",
            "capturado": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "retailers_auto": sorted({x["retailer"] for x in universo}),
            "grupos": sorted({x["grupo"] for x in universo if x.get("grupo")}),
            "n_skus": len(universo),
            "con_foto": sum(1 for x in universo if x.get("imagen")),
        },
        "universo": universo,
        "foco": foco,
    }

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
            if antes.get("universo") == payload["universo"]:
                print(f"\nSin cambios de precio desde {antes['meta']['capturado']}: "
                      f"no se reescribe el informe.")
                return 0
        except Exception:
            pass

    nuevo = re.sub(r"const PAYLOAD = .*?/\*__END_DATA__\*/",
                   lambda m: "const PAYLOAD = " + json.dumps(payload, ensure_ascii=False) + "; /*__END_DATA__*/",
                   html, count=1, flags=re.S)
    SALIDA.write_text(nuevo, encoding="utf-8")

    print(f"\nOK  {len(universo)} SKUs · {len(foco)} del SKU foco · "
          f"{payload['meta']['con_foto']} con foto · {', '.join(payload['meta']['retailers_auto'])}")
    for f in foco:
        print(f"    {f['retailer']:9} lista ${f['precio_lista']} → efectivo ${f['precio_efectivo']} "
              f"(${f['precio_por_litro']}/L) {f.get('mecanica') or 'sin promo'}")
    if fallos:
        print("\nAVISO: fuentes sin datos:\n  " + "\n  ".join(fallos), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
