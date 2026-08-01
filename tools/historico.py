#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Panel historico de precios: lo construye, lo alimenta y lo publica.

Por que existe
--------------
El HTML embebe solo la categoria foco (~300 SKUs), no el catalogo completo que
la captura recorre (~3.200). El historico reconstruible desde git es por tanto
mucho mas angosto que lo que se estuvo capturando: bebidas y nada mas.

Este modulo separa el dato de su presentacion. `datos/historico_precios.csv` es
el panel crudo, append-only, y crece con TODO el catalogo desde ahora.
`tools/historico.json` es la version compacta que lee el navegador.

Formato del CSV
---------------
Se escribe una fila solo cuando el precio de un (retailer, sku) cambia respecto
de la ultima registrada. Un precio que no se mueve durante semanas ocupa una
fila, no cuarenta. Para que "sin fila" no se confunda con "el SKU desaparecio",
se fuerza un latido cada LATIDO_DIAS aunque el precio no haya cambiado: si la
ultima fila de un SKU tiene mas de esa antiguedad, el SKU dejo de verse.

Uso
---
    python3 tools/historico.py bootstrap   # reconstruye el panel desde git
    python3 tools/historico.py publicar    # regenera tools/historico.json
El actualizador diario llama a `registrar()` y `publicar()` directamente.
"""
import csv, datetime, json, pathlib, re, subprocess, sys, unicodedata
from collections import defaultdict, OrderedDict

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CSV_PANEL = RAIZ / "datos" / "historico_precios.csv"
JSON_WEB = RAIZ / "tools" / "historico.json"
HTML = RAIZ / "pricing_dinamico_chile.html"

COLUMNAS = ["fecha", "retailer", "sku", "ean", "nombre", "cantidad", "unidad",
            "precio_lista", "precio_efectivo", "mecanica"]
LATIDO_DIAS = 7          # maximo de dias sin escribir fila para un SKU vivo
MIN_PUNTOS = 2           # series con un solo punto no dibujan nada
MAX_SERIES = 6000        # tope del JSON que baja el navegador
MIN_EVENTOS = 8          # bajadas de precio necesarias para hablar de reaccion


# ───────────────────────── utilidades ─────────────────────────

def _dia(txt, respaldo=None):
    """Normaliza '2026-08-01 13:38' o '2026-08-01' a '2026-08-01'."""
    if txt:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", str(txt))
        if m:
            return m.group(1)
    return respaldo


def _fecha(s):
    return datetime.date.fromisoformat(s)


def normalizar(nombre):
    """Misma normalizacion que el buscador del navegador.

    Tiene que coincidir con `normalizar()` de tools/buscador.js o el producto
    que buscas no encontrara su propio historico. Si una cambia, cambia la otra.
    """
    t = (nombre or "").lower()
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    t = re.sub(r"\b(oferta|promo|unidad|un|uds|c/u|bandeja|malla|bolsa|granel|"
               r"botella|lata|desechable|retornable)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def clave_producto(nombre, cantidad, unidad):
    """Agrupa el mismo producto entre cadenas. Espejo de `clave()` en el JS."""
    bruto = (nombre or "").lower()
    n = normalizar(nombre)
    if not (cantidad and unidad):
        return "sinmedida:" + n
    combo = "combo:" if ("+" in bruto or re.search(r"\bpack\b", bruto)) else ""
    palabras = [p for p in n.split(" ") if len(p) > 2 and not p.isdigit()]
    cant = int(cantidad) if float(cantidad) == int(float(cantidad)) else cantidad
    return combo + " ".join(sorted(palabras[:4])) + "|" + str(cant) + unidad


def _precio(d):
    return d.get("precio_efectivo") or d.get("precio_normal") or d.get("precio_lista")


def observacion(d, fecha):
    p = _precio(d)
    if not p or p <= 0:
        return None
    return {
        "fecha": fecha,
        "retailer": d.get("retailer") or "",
        "sku": str(d.get("sku") or d.get("ean") or d.get("nombre") or ""),
        "ean": d.get("ean") or "",
        "nombre": d.get("nombre") or "",
        "cantidad": d.get("cantidad") or "",
        "unidad": d.get("unidad") or "",
        "precio_lista": d.get("precio_lista") or "",
        "precio_efectivo": p,
        "mecanica": d.get("mecanica") or "",
    }


# ───────────────────────── lectura y escritura del panel ─────────────────────────

def leer_panel():
    if not CSV_PANEL.exists():
        return []
    with CSV_PANEL.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _estado_actual(filas):
    """Ultima fila registrada por (retailer, sku), para decidir que es novedad."""
    ult = {}
    for r in filas:
        ult[(r["retailer"], r["sku"])] = r
    return ult


def registrar(universo, fecha):
    """Agrega al panel las observaciones de una captura. Devuelve filas escritas.

    Idempotente por dia: volver a correr la misma captura no duplica nada,
    porque una fila con la misma fecha y precio no es novedad.
    """
    filas = leer_panel()
    ult = _estado_actual(filas)
    nuevas = []
    for d in universo:
        o = observacion(d, fecha)
        if not o:
            continue
        prev = ult.get((o["retailer"], o["sku"]))
        if prev:
            if prev["fecha"] == o["fecha"]:
                continue                      # ya registrado hoy
            igual = (str(prev["precio_efectivo"]) == str(o["precio_efectivo"])
                     and str(prev["precio_lista"]) == str(o["precio_lista"])
                     and (prev["mecanica"] or "") == (o["mecanica"] or ""))
            viejo = (_fecha(o["fecha"]) - _fecha(prev["fecha"])).days >= LATIDO_DIAS
            if igual and not viejo:
                continue                      # sin cambio y con latido reciente
        nuevas.append(o)
        ult[(o["retailer"], o["sku"])] = o

    if not nuevas:
        return 0
    CSV_PANEL.parent.mkdir(parents=True, exist_ok=True)
    existe = CSV_PANEL.exists()
    with CSV_PANEL.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS)
        if not existe:
            w.writeheader()
        for o in nuevas:
            w.writerow(o)
    return len(nuevas)


# ───────────────────────── bootstrap desde git ─────────────────────────

def _payload_de(sha):
    try:
        h = subprocess.run(["git", "show", f"{sha}:pricing_dinamico_chile.html"],
                           capture_output=True, text=True, cwd=RAIZ).stdout
    except Exception:
        return None
    m = re.search(r"const PAYLOAD = (.*?); /\*__END_DATA__\*/", h, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def bootstrap():
    """Reconstruye el panel recorriendo el historial de git, de viejo a nuevo.

    Solo alcanza lo que quedo embebido en el HTML: la categoria foco. El resto
    del catalogo no es recuperable, porque nunca se guardo.
    """
    log = subprocess.run(["git", "log", "--reverse", "--format=%h %ad",
                          "--date=format:%Y-%m-%d", "--", "pricing_dinamico_chile.html"],
                         capture_output=True, text=True, cwd=RAIZ).stdout
    if CSV_PANEL.exists():
        CSV_PANEL.unlink()
    total, capturas = 0, OrderedDict()
    for linea in log.splitlines():
        if not linea.strip():
            continue
        sha, fecha_commit = linea.split()[0], linea.split()[1]
        p = _payload_de(sha)
        if not p or not p.get("universo"):
            continue
        fecha = _dia((p.get("meta") or {}).get("capturado"), fecha_commit)
        if fecha in capturas:
            continue                          # un solo registro por dia
        capturas[fecha] = sha
        total += registrar(p["universo"], fecha)
    print(f"bootstrap: {len(capturas)} capturas, {total} filas en {CSV_PANEL.relative_to(RAIZ)}")
    for f, s in capturas.items():
        print(f"  {f}  {s}")
    return total


# ───────────────────────── analisis ─────────────────────────

def _serie_densa(puntos, fechas):
    """Rellena hacia adelante: el precio se mantiene hasta que cambia."""
    d, ultimo = {}, None
    idx = {f: i for i, f in enumerate(fechas)}
    for f, v in sorted(puntos.items()):
        if f in idx:
            d[idx[f]] = v
    salida = []
    for i in range(len(fechas)):
        if i in d:
            ultimo = d[i]
        salida.append(ultimo)
    return salida


def reaccion_competitiva(series, fechas, umbral=0.02, ventana=4):
    """Con que frecuencia una cadena sigue la baja de otra, y en cuantos dias.

    Para cada SKU compartido y cada bajada de A superior al umbral, se mira si B
    baja tambien dentro de la ventana. Es lo unico que este panel puede MEDIR de
    verdad: no necesita ventas propias, solo precios observados en el tiempo.
    """
    porClave = defaultdict(dict)
    for s in series:
        if s["clave"]:
            porClave[s["clave"]][s["r"]] = _serie_densa(s["_puntos"], fechas)

    pares = defaultdict(lambda: {"eventos": 0, "siguen": 0, "dias": []})
    for cadenas in porClave.values():
        nombres = list(cadenas)
        for a in nombres:
            for b in nombres:
                if a == b:
                    continue
                sa, sb = cadenas[a], cadenas[b]
                for i in range(1, len(fechas)):
                    if sa[i] is None or sa[i - 1] is None:
                        continue
                    if sa[i] >= sa[i - 1] * (1 - umbral):
                        continue              # A no bajo lo suficiente
                    par = pares[(a, b)]
                    par["eventos"] += 1
                    for k in range(1, ventana + 1):
                        j = i + k
                        if j >= len(fechas) or sb[j] is None or sb[j - 1] is None:
                            break
                        if sb[j] < sb[j - 1] * (1 - umbral):
                            par["siguen"] += 1
                            par["dias"].append(k)
                            break

    salida = []
    for (a, b), v in pares.items():
        if v["eventos"] < MIN_EVENTOS:
            continue     # con pocas bajadas observadas, un "0%" enganaria mas que callar
        dias = sorted(v["dias"])
        salida.append({
            "de": a, "a": b, "eventos": v["eventos"], "siguen": v["siguen"],
            "pct": round(v["siguen"] / v["eventos"] * 100),
            "dias": dias[len(dias) // 2] if dias else None
        })
    salida.sort(key=lambda x: (-x["pct"], -x["eventos"]))
    return salida


def perfil_cadenas(series, fechas):
    """Hi-Lo contra EDLP, medido: cuanto cambia el precio y cuanto descuenta."""
    acc = defaultdict(lambda: {"skus": 0, "cambios": 0, "obs": 0,
                               "diasPromo": 0, "obsPromo": 0, "prof": []})
    for s in series:
        a = acc[s["r"]]
        a["skus"] += 1
        densa = _serie_densa(s["_puntos"], fechas)
        prev = None
        for v in densa:
            if v is None:
                continue
            a["obs"] += 1
            if prev is not None and abs(v - prev) > prev * 0.005:
                a["cambios"] += 1
            prev = v
        for f, lista in s["_lista"].items():
            pe = s["_puntos"].get(f)
            if lista and pe and lista > pe:
                a["diasPromo"] += 1
                a["prof"].append((lista - pe) / lista)
        a["obsPromo"] += len([1 for f in s["_puntos"] if f in fechas])

    salida = []
    for r, a in acc.items():
        prof = sorted(a["prof"])
        salida.append({
            "r": r, "skus": a["skus"],
            "cambiosPorSku": round(a["cambios"] / max(1, a["skus"]), 2),
            "pctPromo": round(a["diasPromo"] / max(1, a["obsPromo"]) * 100),
            "profundidad": round(prof[len(prof) // 2] * 100) if prof else None,
            "estrategia": None
        })
    for s in salida:
        # Umbrales deliberadamente laxos: con pocas semanas de panel, afinarlos
        # daria una precision que el dato no tiene.
        promo = s["pctPromo"] or 0
        mueve = s["cambiosPorSku"]
        if promo >= 60 and mueve < 0.5:
            # Descuento sobre lista casi siempre, pero el precio no se mueve: el
            # "precio lista" es un ancla de comunicacion, no un precio vigente.
            s["estrategia"] = "promo permanente"
        elif mueve >= 0.8 or promo >= 25:
            s["estrategia"] = "Hi-Lo"
        elif mueve <= 0.3 and promo < 12:
            s["estrategia"] = "EDLP"
        else:
            s["estrategia"] = "mixta"
    salida.sort(key=lambda x: -x["skus"])
    return salida


# ───────────────────────── publicacion para el navegador ─────────────────────────

def publicar():
    filas = leer_panel()
    if not filas:
        print("panel vacio: corre primero `python3 tools/historico.py bootstrap`")
        return 0

    fechas = sorted({r["fecha"] for r in filas})
    idx = {f: i for i, f in enumerate(fechas)}

    crudas = {}
    for r in filas:
        k = (r["retailer"], r["sku"])
        s = crudas.setdefault(k, {
            "r": r["retailer"], "s": r["sku"], "n": r["nombre"],
            "e": r["ean"] or "", "c": r["cantidad"], "u": r["unidad"],
            "_puntos": {}, "_lista": {}, "_mec": {}
        })
        # Los campos descriptivos se refrescan con el dato mas reciente que los
        # traiga: las primeras capturas no registraban cantidad ni unidad, y sin
        # ellas la clave de producto sale como "sin medida" y no encuentra su
        # propia serie al buscar.
        for campo, destino in (("nombre", "n"), ("ean", "e"), ("cantidad", "c"), ("unidad", "u")):
            if r.get(campo):
                s[destino] = r[campo]
        try:
            s["_puntos"][r["fecha"]] = int(float(r["precio_efectivo"]))
        except (TypeError, ValueError):
            continue
        if r["precio_lista"]:
            try:
                s["_lista"][r["fecha"]] = int(float(r["precio_lista"]))
            except (TypeError, ValueError):
                pass
        if r["mecanica"]:
            s["_mec"][r["fecha"]] = r["mecanica"]

    series = []
    for s in crudas.values():
        if len(s["_puntos"]) < MIN_PUNTOS:
            continue
        try:
            cant = float(s["c"]) if s["c"] not in ("", None) else None
        except ValueError:
            cant = None
        s["clave"] = clave_producto(s["n"], cant, s["u"]) if s["n"] else None
        series.append(s)

    # Se priorizan las series con mas historia: son las que dicen algo.
    series.sort(key=lambda s: -len(s["_puntos"]))
    series = series[:MAX_SERIES]

    perfiles = perfil_cadenas(series, fechas)
    reacciones = reaccion_competitiva(series, fechas)

    salida = {
        "generado": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        "fechas": fechas,
        "dias": (_fecha(fechas[-1]) - _fecha(fechas[0])).days + 1,
        "perfiles": perfiles,
        "reaccion": reacciones,
        "series": [{
            "r": s["r"], "s": s["s"], "n": s["n"], "e": s["e"],
            "c": s["c"], "u": s["u"], "k": s["clave"],
            "p": sorted([idx[f], v] for f, v in s["_puntos"].items() if f in idx),
            "l": sorted([idx[f], v] for f, v in s["_lista"].items() if f in idx),
        } for s in series],
    }
    JSON_WEB.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    kb = JSON_WEB.stat().st_size / 1024
    print(f"publicado {JSON_WEB.relative_to(RAIZ)}: {len(series)} series, "
          f"{len(fechas)} fechas ({salida['dias']} dias), {kb:.0f} KB")
    for p in perfiles:
        print(f"  {p['r']:<14} {p['skus']:>4} SKUs · {p['cambiosPorSku']} cambios/SKU · "
              f"{p['pctPromo']}% en promo · {p['estrategia']}")
    for x in reacciones[:8]:
        print(f"  cuando {x['de']} baja, {x['a']} sigue {x['pct']}% de las veces "
              f"({x['siguen']}/{x['eventos']}) en ~{x['dias']} dias")
    return len(series)


if __name__ == "__main__":
    accion = sys.argv[1] if len(sys.argv) > 1 else "publicar"
    if accion == "bootstrap":
        bootstrap()
        publicar()
    elif accion == "publicar":
        publicar()
    else:
        print(__doc__)
        sys.exit(1)
