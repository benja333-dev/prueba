"""Genera la sesión de Pyrogram para la cuenta dedicada del agente.

Se corre UNA vez, en tu computador (no en Railway), con el celular que tiene
la SIM del agente a mano para recibir el código.

    python scripts/generar_sesion.py

Te imprime un TG_SESSION_STRING. Ese string es equivalente a estar logueado
en esa cuenta: trátalo como una contraseña y pégalo en las variables de
entorno de Railway, nunca en el repo.
"""
import asyncio
import os

from pyrogram import Client


async def main():
    api_id = os.getenv('TG_API_ID') or input('api_id (de my.telegram.org): ').strip()
    api_hash = os.getenv('TG_API_HASH') or input('api_hash: ').strip()

    async with Client(
        'generador',
        api_id=int(api_id),
        api_hash=api_hash,
        in_memory=True,
    ) as app:
        yo = await app.get_me()
        sesion = await app.export_session_string()
        print()
        print('=' * 70)
        print(f'Cuenta: {yo.first_name} (@{yo.username}) — id {yo.id}')
        print()
        print('TG_SESSION_STRING=')
        print(sesion)
        print('=' * 70)
        print()
        print('Guárdalo en Railway como variable de entorno. No lo comitees.')
        print(f'Y anota este id, lo vas a necesitar: {yo.id}')


if __name__ == '__main__':
    asyncio.run(main())
