// netlify/functions/precios.js
//
// Junta las APIs de todas las petroleras en una sola llamada, normaliza sus
// formatos —que NO son iguales— y mantiene escondidas las API keys.
//
// Las keys van como environment variables en Netlify:
//   Site settings → Environment variables
// Nunca acá adentro: este archivo va a GitHub.

// ===================================================================
// 1. CLASIFICADOR DE PRODUCTOS
// -------------------------------------------------------------------
// El problema de fondo: OK no manda ni `fuelType` ni `octane`, solo el
// nombre comercial del producto. Y Shell vende DOS diesel distintos
// (FuelSave y V-Power) sin marcar cuál es el premium.
//
// Así que deducimos todo desde el nombre. Es el corazón del mapeo:
// si algún día una cadena inventa un producto nuevo, se agrega acá.
// ===================================================================
function clasificarProducto(nombre) {
  const n = String(nombre || "").toLowerCase();

  // Marcadores de gama premium (más caro, mismo combustible)
  const esPremium = /v-power|premium|excellium|plus|\+/.test(n);

  // OJO: "V-Power Diesel" contiene v-power Y diesel.
  // Hay que preguntar por diesel PRIMERO o lo clasifica como nafta.
  if (n.includes("diesel")) {
    return { fuelType: "Autodiesel", octane: null, premium: esPremium };
  }

  // Nafta: el octanaje suele venir en el propio nombre ("Blyfri 95")
  const octanaje = n.match(/\b(100|98|95|92)\b/);
  if (octanaje) {
    return { fuelType: "Autobenzin", octane: octanaje[1], premium: esPremium };
  }

  // Shell llama "V-Power" a secas a su nafta 98
  if (n.includes("v-power")) {
    return { fuelType: "Autobenzin", octane: "98", premium: true };
  }

  return null; // AdBlue, lavados, carga eléctrica, etc. → se descarta
}

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ===================================================================
// 2. MAPEADORES POR CADENA
// -------------------------------------------------------------------
// Cada función recibe la respuesta cruda y devuelve el formato interno
// de Surtidor. Los nombres de campo de SALIDA no se traducen: son los
// del esquema oficial y el frontend los espera así.
// ===================================================================

// --- OK ----------------------------------------------------------
// VERIFICADO en vivo. Se aparta bastante del esquema recomendado:
//   · envuelve todo en { items: [...] }
//   · snake_case en vez de camelCase
//   · `facility_number` en lugar de `stationId`
//   · `postal_code` es número, no texto
//   · la fecha vive en la estación, no en cada precio
//   · los precios solo traen `product_name` y `price`
function mapearOK(datos) {
  return (datos.items || []).map(e => ({
    stationId:   `OK-${e.facility_number}`,
    brand:       "OK",
    owner:       "OK a.m.b.a.",
    street:      e.street || "",
    houseNumber: e.house_number || "",
    postalCode:  String(e.postal_code || ""),
    city:        e.city || "",
    coordinates: {
      latitude:  num(e.coordinates && e.coordinates.latitude),
      longitude: num(e.coordinates && e.coordinates.longitude),
    },
    prices: (e.prices || []).map(p => {
      const tipo = clasificarProducto(p.product_name);
      if (!tipo) return null;
      return {
        fuelType:    tipo.fuelType,
        octane:      tipo.octane,
        premium:     tipo.premium,
        productName: p.product_name,
        price:       num(p.price),
        currency:    "DKK",
        lastUpdated: e.last_updated_time,  // sube desde la estación
      };
    }).filter(p => p && p.price !== null),
  }));
}

// --- Shell -------------------------------------------------------
// VERIFICADO en vivo. Respeta el esquema casi al pie de la letra, con
// tres detalles: precios y coordenadas llegan como TEXTO, `houseNumber`
// viene null (el número está dentro de `street`), y hay dos diesel
// distintos por estación — de ahí el flag `premium`.
function mapearShell(datos) {
  return (Array.isArray(datos) ? datos : []).map(e => ({
    stationId:   e.stationId || `Shell-${e.street}`,
    brand:       "Shell",
    owner:       e.owner || "Shell",
    street:      e.street || "",
    houseNumber: e.houseNumber || "",   // suele venir null
    postalCode:  String(e.postalCode || ""),
    city:        e.city || "",
    coordinates: {
      latitude:  num(e.coordinates && e.coordinates.latitude),
      longitude: num(e.coordinates && e.coordinates.longitude),
    },
    prices: (e.prices || []).map(p => {
      const tipo = clasificarProducto(p.productName);
      if (!tipo) return null;
      return {
        fuelType:    p.fuelType || tipo.fuelType,
        octane:      p.octane != null ? p.octane : tipo.octane,
        premium:     tipo.premium,
        productName: p.productName,
        price:       num(p.price),        // llega como "16.89"
        currency:    p.currency || "DKK",
        lastUpdated: p.lastUpdated,
      };
    }).filter(p => p && p.price !== null),
  }));
}

// --- Genérico ----------------------------------------------------
// Para las cadenas que sí siguen el esquema recomendado. Sirve de
// punto de partida cuando sumes una nueva: probás con este y, si el
// resultado sale raro, le escribís el suyo.
function mapearGenerico(datos, marca) {
  const lista = Array.isArray(datos)
    ? datos
    : (datos.items || datos.stations || []);

  return lista.map(e => ({
    stationId:   e.stationId || `${marca}-${e.street}-${e.houseNumber}`,
    brand:       e.brand || marca,
    owner:       e.owner || marca,
    street:      e.street || "",
    houseNumber: e.houseNumber || "",
    postalCode:  String(e.postalCode || ""),
    city:        e.city || "",
    coordinates: {
      latitude:  num(e.coordinates && e.coordinates.latitude),
      longitude: num(e.coordinates && e.coordinates.longitude),
    },
    prices: (e.prices || []).map(p => {
      const tipo = clasificarProducto(p.productName || p.product_name);
      if (!tipo) return null;
      return {
        fuelType:    p.fuelType || tipo.fuelType,
        octane:      p.octane != null ? p.octane : tipo.octane,
        premium:     tipo.premium,
        productName: p.productName || p.product_name,
        price:       num(p.price),
        currency:    p.currency || "DKK",
        lastUpdated: p.lastUpdated || e.lastUpdated,
      };
    }).filter(p => p && p.price !== null),
  }));
}

// --- Q8 / F24 ----------------------------------------------------
// VERIFICADO en vivo (241 estaciones). Se aparta del esquema por
// completo y trae DOS complicaciones propias:
//
//   1. El feed mezcla dos marcas: las estaciones con personal son
//      "Q8" y las automáticas son "F24" (la marca hermana). El campo
//      `stationName` dice cuál es.
//   2. NO trae coordenadas. La dirección viene como un solo string
//      ("Dronningemaen 34 Svendborg 5700 Danmark"). Sin lat/lng la
//      app las descartaría a todas, así que las geolocalizamos por
//      código postal usando el registro oficial danés (dataforsyningen).
//      La ubicación queda a nivel de código postal, no exacta —
//      suficiente para ordenar por cercanía, no para navegar.
//
// La tabla de códigos postales se baja una sola vez por contenedor y
// queda cacheada. Si dataforsyningen no responde, Q8 se cae sola
// (estaciones sin coordenadas → descartadas) y el resto sigue andando.
let _postalesCache = null;
async function centroidesPostales() {
  if (_postalesCache) return _postalesCache;
  try {
    const r = await fetch("https://api.dataforsyningen.dk/postnumre", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) { console.warn(`postnumre: HTTP ${r.status}`); return {}; }
    const arr = await r.json();
    const mapa = {};
    for (const p of arr) {
      // visueltcenter viene como [longitud, latitud]
      if (p && p.nr && Array.isArray(p.visueltcenter)) {
        mapa[String(p.nr)] = {
          lat: num(p.visueltcenter[1]),
          lng: num(p.visueltcenter[0]),
          navn: p.navn || "",
        };
      }
    }
    _postalesCache = mapa;
    return mapa;
  } catch (e) {
    console.warn(`postnumre: ${e.message}`);
    return {};
  }
}

async function mapearQ8(datos) {
  const geo = await centroidesPostales();
  const lista = (datos && datos.data && datos.data.stationsPrices) || [];

  return lista.map(e => {
    const addr = String(e.address || "");
    const mPost = addr.match(/\b(\d{4})\b/);          // el código postal es el ancla fiable
    const postalCode = mPost ? mPost[1] : "";
    const centro = geo[postalCode];
    const city = (centro && centro.navn) || "";

    // La calle es lo que queda al sacar "<postal> Danmark" y el nombre de ciudad del final
    let street = addr.replace(/\s*\d{4}\s*Danmark\s*$/i, "").trim();
    if (city && street.toLowerCase().endsWith(city.toLowerCase())) {
      street = street.slice(0, street.length - city.length).trim();
    }

    const esF24 = /f24/i.test(e.stationName || "");

    return {
      stationId:   `Q8-${e.stationId}`,
      brand:       esF24 ? "F24" : "Q8",
      owner:       esF24 ? "F24 A/S" : "Q8 Danmark A/S",
      street,
      houseNumber: "",
      postalCode,
      city,
      coordinates: {
        latitude:  centro ? centro.lat : null,
        longitude: centro ? centro.lng : null,
      },
      prices: (e.products || []).map(p => {
        const tipo = clasificarProducto(p.productName);
        if (!tipo) return null;
        return {
          fuelType:    tipo.fuelType,
          octane:      tipo.octane,
          premium:     tipo.premium,
          productName: p.productName,
          price:       num(p.price),
          currency:    "DKK",
          lastUpdated: p.priceChangeDate,
        };
      }).filter(p => p && p.price !== null),
    };
  });
}

// --- Circle K / INGO ---------------------------------------------
// VERIFICADO en vivo (403 estaciones: ~207 Circle K + ~196 INGO). Un
// solo feed para las dos marcas, que comparten infraestructura —igual
// que Q8/F24. La marca sale del campo `name`.
//
// Dos particularidades:
//   1. Header OBLIGATORIO `X-App-Name: PRICES` (no es una key secreta,
//      es un identificador fijo que documenta la propia API).
//   2. Tampoco trae coordenadas, pero sí calle, ciudad y código postal
//      en campos separados, así que geolocalizamos por código postal
//      con la misma tabla que Q8.
//
// Circle K vende su línea "miles" (miles 95, miles diesel) y variantes
// premium "miles+/milesPLUS". El clasificador se queda con la estándar,
// que es la que interesa comparar.
async function mapearCircleK(datos) {
  const geo = await centroidesPostales();
  const sites = (datos && datos.sites) || [];

  return sites.map(e => {
    const esIngo = /^ingo/i.test(e.name || "");
    const a = e.address || {};
    const postalCode = /^\d{4}$/.test(String(a.postalCode || "")) ? String(a.postalCode) : "";
    const centro = geo[postalCode];

    return {
      stationId:   `${esIngo ? "INGO" : "CK"}-${e.id}`,
      brand:       esIngo ? "INGO" : "Circle K",
      owner:       esIngo ? "Ingo Danmark" : "Circle K Danmark A/S",
      street:      a.street || "",
      houseNumber: "",
      postalCode,
      city:        a.city || (centro && centro.navn) || "",
      coordinates: {
        latitude:  centro ? centro.lat : null,
        longitude: centro ? centro.lng : null,
      },
      prices: (e.fuelPrices || []).map(p => {
        const tipo = clasificarProducto(p.displayName);
        if (!tipo) return null;
        return {
          fuelType:    tipo.fuelType,
          octane:      tipo.octane,
          premium:     tipo.premium,
          productName: p.displayName,
          price:       num(p.price),
          currency:    p.currency || "DKK",
          lastUpdated: p.lastUpdated,
        };
      }).filter(p => p && p.price !== null),
    };
  });
}

// ===================================================================
// 3. FUENTES
// -------------------------------------------------------------------
// `activa: false` → no se consulta. Poné true cuando tengas la key o
// hayas confirmado que el endpoint responde.
// ===================================================================
const FUENTES = [
  {
    marca: "OK",
    url: "https://mobility-prices.ok.dk/api/v1/fuel-prices",
    key: null,                       // pública, sin autenticación
    mapear: mapearOK,
    activa: true,
  },
  {
    marca: "Shell",
    url: "https://shellpumpepriser.geoapp.me/v1/prices",
    key: null,                       // pública, sin autenticación
    mapear: mapearShell,
    activa: true,
  },
  {
    marca: "Q8",
    url: "https://beta.q8.dk/Station/GetStationPrices?page=1&pageSize=2000",
    key: null,                       // pública, sin autenticación
    mapear: mapearQ8,                // trae Q8 + F24, geolocalizadas por código postal
    activa: true,
  },
  {
    marca: "Circle K / INGO",
    url: "https://api.circlek.com/eu/prices/v1/fuel/countries/DK",
    key: null,                       // pública; solo pide el header X-App-Name
    headers: { "X-App-Name": "PRICES" },
    mapear: mapearCircleK,           // trae Circle K + INGO, geolocalizadas por código postal
    activa: true,
  },
  {
    marca: "Go'on",
    url: "https://goon.nu/wp-json/goon/v1/pump-prices",
    key: process.env.GOON_KEY,       // requiere key (formulario en su web)
    mapear: d => mapearGenerico(d, "Go'on"),
    activa: true,
  },
  // Pendientes: INGO, Circle K, Uno-X, OIL!
  // Cuando consigas el endpoint, copiá un bloque de arriba.
];

// ===================================================================
// 4. DESCARGA
// -------------------------------------------------------------------
// Una petrolera caída no puede voltear toda la app: si algo falla,
// esa cadena devuelve lista vacía y el resto sigue andando.
// ===================================================================
async function obtener(fuente) {
  if (!fuente.activa) return [];

  if (fuente.key === undefined) {
    console.warn(`${fuente.marca}: falta la environment variable, la salteo`);
    return [];
  }

  try {
    const headers = { Accept: "application/json" };
    if (fuente.key) headers.Authorization = `Bearer ${fuente.key}`;
    if (fuente.headers) Object.assign(headers, fuente.headers);   // headers fijos (ej. X-App-Name)

    const respuesta = await fetch(fuente.url, {
      headers,
      signal: AbortSignal.timeout(9000),
    });

    if (!respuesta.ok) {
      console.warn(`${fuente.marca}: HTTP ${respuesta.status}`);
      return [];
    }

    // await: la mayoría de los mapeadores son síncronos, pero Q8 es async
    // (baja la tabla de códigos postales). await sobre un valor normal no molesta.
    const estaciones = await fuente.mapear(await respuesta.json());
    console.log(`${fuente.marca}: ${estaciones.length} estaciones`);
    return estaciones;

  } catch (error) {
    console.warn(`${fuente.marca}: ${error.message}`);
    return [];
  }
}

export default async function handler() {
  // Todas las cadenas en paralelo, no una atrás de la otra
  const resultados = await Promise.all(
    FUENTES.map(async fuente => ({
      marca: fuente.marca,
      estaciones: await obtener(fuente),
    }))
  );

  const estaciones = resultados
    .flatMap(r => r.estaciones)
    .filter(e =>
      Number.isFinite(e.coordinates.latitude) &&
      Number.isFinite(e.coordinates.longitude) &&
      e.prices.length > 0
    );

  // `fuentes` alimenta el indicador "en vivo" del encabezado: qué cadenas
  // respondieron con datos y cuántas estaciones aportó cada una.
  const fuentes = resultados.map(r => ({
    marca: r.marca,
    ok: r.estaciones.length > 0,
    n: r.estaciones.length,
  }));

  return new Response(JSON.stringify({ stations: estaciones, fuentes }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Caché de 5 min: nos mantiene lejos del límite de ~1 request/segundo
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
