"""Clona tu voz en Fish Audio y te devuelve el FISH_VOICE_ID.

    export FISH_API_KEY=...
    python scripts/clonar_voz.py mi_voz.m4a

La muestra: 15 segundos mínimo, un minuto o dos queda notablemente mejor.
Grábate hablando normal, en una pieza sin eco, sin música ni nadie más de
fondo. Un audio de WhatsApp sirve perfectamente.
"""
import os
import sys

import requests

API = 'https://api.fish.audio/model'


def clonar(rutas, titulo='Voz Benjamin', descripcion=''):
    key = os.getenv('FISH_API_KEY', '').strip()
    if not key:
        sys.exit('Falta FISH_API_KEY. Sácala de fish.audio -> API Keys.')

    archivos = []
    abiertos = []
    for ruta in rutas:
        if not os.path.exists(ruta):
            sys.exit(f'No encuentro el archivo: {ruta}')
        f = open(ruta, 'rb')
        abiertos.append(f)
        archivos.append(('voices', (os.path.basename(ruta), f, 'audio/mpeg')))

    datos = {
        'type': 'tts',
        'title': titulo,
        'description': descripcion or 'Voz para el agente de soporte familiar',
        'visibility': 'private',
        'train_mode': 'fast',
        'enhance_audio_quality': 'true',
    }

    try:
        r = requests.post(
            API,
            headers={'Authorization': f'Bearer {key}'},
            data=datos,
            files=archivos,
            timeout=300,
        )
    finally:
        for f in abiertos:
            f.close()

    if r.status_code >= 300:
        sys.exit(f'Fish respondió {r.status_code}: {r.text[:500]}')

    modelo = r.json()
    voice_id = modelo.get('_id') or modelo.get('id')
    print()
    print('=' * 70)
    print(f'Voz clonada: {modelo.get("title")}')
    print(f'Estado: {modelo.get("state")}')
    print()
    print(f'FISH_VOICE_ID={voice_id}')
    print('=' * 70)
    print()
    print('Pégalo en las variables de entorno y el agente hablará con tu voz.')
    return voice_id


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('Uso: python scripts/clonar_voz.py muestra.m4a [otra.m4a ...]')
    clonar(sys.argv[1:])
