# Surtidor

Buscador de precios de combustible en Dinamarca. Muestra las estaciones
ordenadas por precio o distancia, y un resumen comparativo por cadena.

Los precios salen directamente de las APIs públicas de cada petrolera,
obligatorias desde el 1 de enero de 2026 por el § 16 a de la
*prismærkningsbekendtgørelse*.

## Cómo está armado

```
index.html                      La app entera: React 18 por CDN, sin build
netlify/functions/precios.js    Proxy que junta y normaliza las APIs
netlify.toml                    Configuración de Netlify
logos/                          Logos de las cadenas (ver logos/LEEME.md)
```

La interfaz está en español. Los nombres de los combustibles se muestran
traducidos, con el nombre danés que figura en el surtidor debajo del
selector, para que sepas qué buscar cuando llegues a la estación.

No hay `npm install` ni paso de compilación. El HTML es un solo archivo
que se puede abrir directo en el navegador (cae en datos de ejemplo si no
encuentra la función de Netlify).

## Por qué hace falta el proxy

Dos razones:

1. **CORS.** Las APIs de las petroleras no permiten llamadas desde el
   navegador. La función corre en el servidor de Netlify, donde eso no aplica.
2. **Las API keys.** Las cadenas que piden key exigen no publicarla en
   código fuente abierto. La función las lee de las variables de entorno,
   así que nunca llegan al navegador ni a este repo.

## Fuentes de datos

| Cadena | Estado | Key |
|---|---|---|
| OK | Verificada en vivo | No necesita |
| Shell | Verificada en vivo | No necesita |
| Q8 | Sin verificar, usa mapeador genérico | No necesita |
| Go'on | Pendiente de key | `GOON_KEY` |

Faltan INGO, Circle K, Uno-X y OIL!. El rastreador de
[benzinpriser.io](https://benzinpriser.io/2025/12/19/the-danish-fuel-price-api-announcement-tracker/)
lleva la cuenta de cuáles fueron publicando su API.

### El detalle importante

El esquema que publicó Konkurrence- og Forbrugerstyrelsen es una
**recomendación, no una obligación**, y cada cadena se desvía a su manera:

- **OK** envuelve todo en `items`, usa `snake_case`, y sus precios traen
  solo `product_name` y `price` — sin `fuelType` ni `octane`.
- **Shell** manda precios y coordenadas como texto, deja `houseNumber`
  en null, y vende **dos diesel distintos** por estación sin marcar
  cuál es el premium.

Por eso `precios.js` tiene un mapeador por cadena más un clasificador
que deduce tipo, octanaje y gama desde el nombre comercial del producto.
Sin eso, la app mostraría el diesel caro de Shell y lo compararía contra
el diesel común de las demás.

## Variables de entorno

En Netlify: *Site settings → Environment variables*.

| Variable | Para qué |
|---|---|
| `GOON_KEY` | API de Go'on (formulario en su web) |

Sin ninguna variable la app igual funciona: trae OK y Shell.

## Desarrollo local

```bash
npm install -g netlify-cli
netlify dev
```

Levanta el sitio y las funciones juntos en `localhost:8888`.

Para tocar solo el diseño alcanza con abrir `index.html` en el navegador:
al no encontrar la función usa los datos de ejemplo.

## Sumar una cadena nueva

En `netlify/functions/precios.js`, agregar un bloque en `FUENTES`:

```js
{
  marca: "INGO",
  url: "https://…/v1/prices",
  key: process.env.INGO_KEY,   // o null si es pública
  mapear: d => mapearGenerico(d, "INGO"),
  activa: true,
}
```

Probar primero con `mapearGenerico`. Si en los logs de Netlify aparece
`INGO: 0 estaciones`, es que se desvía del esquema y hay que escribirle
su propio mapeador — `mapearOK` sirve de ejemplo de cuánto puede llegar
a variar.
