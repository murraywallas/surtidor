# Logos de las cadenas

Esta carpeta viene vacía a propósito.

Los logos de OK, Shell, Q8, Circle K, F24, Uno-X, OIL!, Go'on e INGO son
marcas registradas de sus respectivas empresas. Mostrarlos junto a las
estaciones de esa misma cadena es uso legítimo —es lo que hace cualquier
comparador de precios— pero los archivos hay que bajarlos de la fuente
oficial, no redibujarlos.

## Cómo conseguirlos

Casi todas las cadenas publican sus logos para prensa. Buscá en su web
las secciones **"Presse"**, **"Presserum"**, **"Om os"** o **"Media kit"**.
Si no aparece, escribí a su contacto de prensa: para este uso suelen
mandarlos sin problema.

Preferí **SVG**. Si solo hay PNG, que sea de al menos 128 × 128 px con
fondo transparente, y cambiá la extensión en la tabla `MARCAS` de
`index.html`.

## Nombres de archivo

La app busca exactamente estos nombres:

| Cadena | Archivo |
|---|---|
| OK | `ok.svg` |
| Shell | `shell.svg` |
| Q8 | `q8.svg` |
| F24 | `f24.svg` |
| Circle K | `circlek.svg` |
| Uno-X | `unox.svg` |
| OIL! | `oil.svg` |
| Go'on | `goon.svg` |
| INGO | `ingo.svg` |

## Mientras tanto

No hace falta hacer nada. Si un archivo no está, la app dibuja sola una
placa de color con las iniciales de la cadena y no se ve ningún ícono
roto. Podés ir sumándolos de a uno.

Los colores de esas placas están en la tabla `MARCAS` de `index.html` y
**no** son los colores corporativos oficiales: los elegí para que las
cadenas se distingan bien entre sí. Cambialos si querés más fidelidad.
