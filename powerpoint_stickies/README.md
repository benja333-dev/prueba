# Stickies para PowerPoint

Post-its amarillos de revisión, estilo consultoría. Se instala como add-in (`.ppam`) y agrega a **Inicio** un grupo **Stickies** con 4 botones:

| Botón | Qué hace |
|---|---|
| **Nuevo sticky** | Pega un post-it arriba a la derecha de la lámina con `[iniciales dd-mmm hh:mm]` y deja el cursor listo para escribir. Si ya hay stickies, los nuevos se escalonan |
| **Siguiente** | Salta al siguiente sticky del deck, para quien revisa |
| **Ocultar / mostrar** | Oculta o muestra todos los stickies sin borrarlos, por ejemplo para presentar |
| **Borrar todos** | Cuenta los stickies, pide confirmación y los borra. **Úsalo siempre antes de enviar al cliente** |

Cada sticky queda marcado con el tag `BB_STICKY=1` y un nombre `Sticky_…`. Si copias uno a mano o lo pegas en otra lámina, sigue contando como sticky.

## Instalación (Windows, 1 minuto)
1. Descarga la carpeta `powerpoint_stickies` completa
2. **Cierra PowerPoint**
3. Doble clic en `Instalar.bat`
4. Abre PowerPoint y busca el grupo **Stickies** a la derecha de **Inicio**

**Atajo de teclado:** haz clic derecho en *Nuevo sticky* → *Agregar a la barra de herramientas de acceso rápido*. Queda con `Alt + número` según su posición en la barra (por ejemplo `Alt+4`).

Para desinstalar: doble clic en `Desinstalar.bat`

## Qué toca el instalador
- Activa **temporalmente** "Confiar en el acceso al modelo de objetos de proyectos de VBA", necesario para cargar la macro, y lo deja como estaba al terminar, incluso si hay un error
- Copia `StickyNotes.ppam` a `%APPDATA%\Microsoft\AddIns`, que es una ubicación de confianza por defecto de PowerPoint
- No modifica ninguna presentación tuya

## Si falla (instalación manual, 5 min)
1. En PowerPoint, abre una presentación en blanco y pulsa `Alt+F11` → *Archivo → Importar archivo* → elige `StickyNotes.bas`
2. *Archivo → Guardar como* → tipo **Complemento de PowerPoint (*.ppam)** → guárdalo en `%APPDATA%\Microsoft\AddIns`
3. *Archivo → Opciones → Complementos → Administrar: Complementos de PowerPoint → Ir → Agregar* → elige el `.ppam`
4. Para tener los botones en la cinta, abre el `.ppam` con [Office RibbonX Editor](https://github.com/fernandreu/office-ribbonx-editor) e inserta `customUI.xml`, de tipo *Office 2007 Custom UI Part*

Si en tu empresa las macros están bloqueadas por política, ni el instalador ni la vía manual van a funcionar. En ese caso hay que pedir a TI que autorice el add-in.

## Limitaciones
- Solo funciona en Windows. En Mac, `WScript.Shell` y el instalador no aplican
- Las iniciales salen de *Archivo → Opciones → General → Iniciales*. Si ese campo está vacío, se usa tu usuario de Windows
- Para cambiar el color o el tamaño, edita las constantes y el `RGB(255, 242, 117)` al inicio de `StickyNotes.bas` y vuelve a instalar
