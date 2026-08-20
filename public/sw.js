/**
 * El trabajador de servicio de la caja.
 *
 * Existe por una sola razon: que la vendedora pueda RECARGAR la pagina sin
 * internet y siga cobrando. El catalogo, la cola de ventas y el ticket ya
 * viven en el navegador (src/lib/almacen.ts), pero el HTML y el programa
 * venian del servidor: sin red, una F5 dejaba la pantalla en blanco y ahi
 * se perdia la venta.
 *
 * Va escrito a mano y sin librerias a proposito. Este archivo se mete en
 * medio de TODO lo que pide el navegador, asi que un error aqui no rompe una
 * pantalla: deja la caja entera sin poder cobrar.
 */

/*
 * Al cambiar este numero se tiran los caches viejos y la caja se queda con
 * la version nueva del programa. Se sube cuando cambie algo de este archivo.
 */
const VERSION = "v1";
const CACHE_PAGINAS = "venus-caja-paginas-" + VERSION;
const CACHE_ARCHIVOS = "venus-caja-archivos-" + VERSION;
const NUESTROS = [CACHE_PAGINAS, CACHE_ARCHIVOS];

const PAGINA_SIN_CONEXION = "/sin-conexion";

/** Lo que esta en /public y queremos tener guardado desde el primer momento. */
const ARCHIVOS_PROPIOS = ["/manifest.json", "/icono.svg"];

/*
 * El cache de paginas no puede crecer para siempre: la computadora de la
 * tienda es de Windows 8 y va a llevar anios abriendo tickets. Se queda con
 * las ultimas pantallas, que son las que alguien podria recargar.
 */
const MAXIMO_PAGINAS = 40;

// --- Instalar -------------------------------------------------------------

self.addEventListener("install", (evento) => {
  evento.waitUntil(precargar());
  // Sin esto, la version nueva se queda formada hasta que cierren todas las
  // pestanas, y en la tienda hay una sola pestana abierta todo el dia.
  self.skipWaiting();
});

async function precargar() {
  await guardarDeLaRed(CACHE_ARCHIVOS, [PAGINA_SIN_CONEXION].concat(ARCHIVOS_PROPIOS));
}

/**
 * Guarda cada cosa por separado y NO tira la instalacion si alguna falla:
 * que el servidor se tarde un segundo no es razon para dejar a la caja sin
 * trabajador de servicio. Lo que no se alcance a guardar ahora se guarda
 * solo la primera vez que se use.
 */
async function guardarDeLaRed(nombreCache, rutas) {
  let cache;
  try {
    cache = await caches.open(nombreCache);
  } catch (e) {
    return;
  }
  for (const ruta of rutas) {
    try {
      // "reload" para no acabar guardando una copia vieja del navegador.
      const respuesta = await fetch(new Request(ruta, { cache: "reload" }));
      if (sirveParaGuardar(respuesta)) await cache.put(ruta, respuesta);
    } catch (e) {
      // Sin red justo al instalar. No es grave: se guarda cuando se use.
    }
  }
}

// --- Activar --------------------------------------------------------------

self.addEventListener("activate", (evento) => {
  evento.waitUntil(tirarLoViejo());
});

async function tirarLoViejo() {
  const nombres = await caches.keys();
  for (const nombre of nombres) {
    // Solo se borra lo que puso este archivo, nada de barrer caches ajenos.
    if (nombre.indexOf("venus-caja-") === 0 && NUESTROS.indexOf(nombre) === -1) {
      await caches.delete(nombre);
    }
  }
  // Tomar el mando de la pestana que ya estaba abierta. Si no, la primera
  // vez el trabajador no serviria de nada hasta que la recargaran.
  await self.clients.claim();
}

// --- Lo que pide el navegador --------------------------------------------

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  // Solo se mira lo que se pide para leer. Subir una venta es un POST y ni
  // se asoma por aqui.
  if (peticion.method !== "GET") return;

  let url;
  try {
    url = new URL(peticion.url);
  } catch (e) {
    return;
  }

  // Lo de otros dominios no es asunto nuestro.
  if (url.origin !== self.location.origin) return;

  /*
   * LA REGLA QUE NO SE NEGOCIA: /api/* jamas se guarda ni se contesta desde
   * una copia.
   *
   * Si /api/venta llegara a contestar desde el cache, la caja daria la venta
   * por subida, la sacaria de la cola y esa venta no existiria en la base
   * NUNCA. Al no llamar a respondWith, la peticion sale a la red tal cual y,
   * si no hay internet, falla limpio: la cola la reintenta sola.
   */
  if (url.pathname === "/api" || url.pathname.indexOf("/api/") === 0) return;

  // Una pantalla completa: primero la red, y la copia guardada de respaldo.
  if (peticion.mode === "navigate") {
    evento.respondWith(pagina(evento));
    return;
  }

  // El programa ya compilado: primero el cache, que es lo que hace que abra
  // rapido y que abra sin internet.
  if (llevaHuellaEnElNombre(url)) {
    evento.respondWith(archivo(evento));
    return;
  }

  // Todo lo demas (los datos que Next pide al cambiar de pantalla, por
  // ejemplo) sale a la red como si este archivo no existiera.
});

/** Primero la red; si no contesta, la copia; si no hay copia, avisar. */
async function pagina(evento) {
  const peticion = evento.request;
  try {
    const deLaRed = await fetch(peticion);
    if (sirveParaGuardar(deLaRed)) {
      const copia = deLaRed.clone();
      // La clienta no espera a que se guarde, pero el guardado si tiene que
      // alcanzar a terminar: con waitUntil el navegador no apaga al
      // trabajador a media escritura y la copia no queda coja.
      evento.waitUntil(guardarPagina(peticion, copia));
    }
    return deLaRed;
  } catch (e) {
    // Se cayo el internet. Se entrega lo de la ultima vez.
    return await deRespaldo(peticion);
  }
}

async function deRespaldo(peticion) {
  try {
    /*
     * Se abre el cache y se busca ahi dentro, en vez de usar caches.match con
     * el nombre del cache: ese truena si el cache todavia no existe, y eso
     * pasa justo el peor dia, cuando alguien abre la caja por primera vez ya
     * sin internet. Tronar ahi dejaria la pantalla del error del navegador en
     * lugar de la pagina que explica que se puede seguir cobrando.
     *
     * ignoreSearch porque "/ventas" y "/ventas?dia=..." son la misma pantalla.
     */
    const paginas = await caches.open(CACHE_PAGINAS);
    const guardada = await paginas.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;

    const archivos = await caches.open(CACHE_ARCHIVOS);
    const sinConexion = await archivos.match(PAGINA_SIN_CONEXION);
    if (sinConexion) return sinConexion;
  } catch (e) {
    // Ni el cache contesto. Abajo hay algo que siempre contesta.
  }
  return respuestaDeEmergencia();
}

async function guardarPagina(peticion, respuesta) {
  try {
    const cache = await caches.open(CACHE_PAGINAS);
    await cache.put(peticion, respuesta);
    const llaves = await cache.keys();
    // keys() las devuelve en el orden en que se guardaron: las primeras son
    // las mas viejas.
    for (let i = 0; i < llaves.length - MAXIMO_PAGINAS; i++) {
      const llave = llaves[i];
      if (llave) await cache.delete(llave);
    }
  } catch (e) {
    // Disco lleno o el navegador no deja guardar. Se sigue cobrando igual.
  }
}

/** Primero el cache; si no esta, la red. */
async function archivo(evento) {
  const peticion = evento.request;
  let cache = null;
  try {
    cache = await caches.open(CACHE_ARCHIVOS);
    const guardado = await cache.match(peticion);
    // Estos archivos llevan la huella del programa en el nombre: si esta
    // guardado, es el bueno, y no hay para que preguntarle a la red.
    if (guardado) return guardado;
  } catch (e) {
    cache = null;
  }

  const deLaRed = await fetch(peticion);
  if (cache && sirveParaGuardar(deLaRed) && sePuedeGuardarParaSiempre(peticion, deLaRed)) {
    const copia = deLaRed.clone();
    evento.waitUntil(cache.put(peticion, copia).catch(() => {}));
  }
  return deLaRed;
}

// --- Reglas chicas --------------------------------------------------------

function llevaHuellaEnElNombre(url) {
  if (ARCHIVOS_PROPIOS.indexOf(url.pathname) !== -1) return true;
  return url.pathname.indexOf("/_next/static/") === 0;
}

/**
 * Que una respuesta se pueda guardar sin hacer dano:
 *  - status 200: nada de 404 ni de respuestas a medias.
 *  - type "basic": del mismo servidor.
 *  - que NO venga de una redireccion, como "/" cuando manda a "/entrar".
 *    Guardar una respuesta redirigida es peor que no guardar nada: al
 *    devolverla despues para una navegacion, el navegador la rechaza de tajo
 *    y la pantalla se queda en blanco.
 */
function sirveParaGuardar(respuesta) {
  if (!respuesta) return false;
  if (respuesta.redirected === true) return false;
  return respuesta.status === 200 && respuesta.type === "basic";
}

function sePuedeGuardarParaSiempre(peticion, respuesta) {
  let url;
  try {
    url = new URL(peticion.url);
  } catch (e) {
    return false;
  }
  if (ARCHIVOS_PROPIOS.indexOf(url.pathname) !== -1) return true;
  // Next marca "immutable" solo los archivos ya compilados, los que llevan
  // huella en el nombre. Mientras se programa no la llevan, y guardarlos
  // dejaria la caja corriendo el programa de ayer.
  const control = respuesta.headers.get("Cache-Control") || "";
  return control.indexOf("immutable") !== -1;
}

/** Si ni la pagina de sin conexion alcanzo a guardarse, algo hay que decir. */
function respuestaDeEmergencia() {
  const html =
    '<!doctype html><html lang="es-MX"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Sin conexion</title></head>" +
    '<body style="margin:0;background:#faf6ee;color:#1a1613;' +
    'font-family:Segoe UI,Arial,sans-serif;padding:2.5rem">' +
    '<h1 style="font-family:Georgia,serif;font-weight:400">No hay internet</h1>' +
    "<p>La caja no pudo cargar esta pantalla. Las ventas que ya se cobraron estan " +
    "guardadas en esta computadora y se van a subir solas.</p>" +
    "<p>Vuelve a intentar en un momento.</p></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
