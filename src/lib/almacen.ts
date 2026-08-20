"use client";

import type { LineaVenta, ModeloCaja, VentaParaGuardar } from "./tipos";

/**
 * Lo que la caja guarda en la propia computadora de la tienda.
 *
 * Es lo que sostiene la regla mas importante del sistema: si se cae el
 * internet, se sigue cobrando. La venta se escribe aqui primero, el ticket
 * se imprime desde aqui, y la subida al servidor va por atras. Si la subida
 * falla, la venta se queda en la cola y se reintenta sola.
 */

const LLAVE_COLA = "venus_caja_cola";
const LLAVE_CATALOGO = "venus_caja_catalogo";
const LLAVE_ESPERA = "venus_caja_espera";
const LLAVE_FOLIO = "venus_caja_folio";

function leer<T>(llave: string, siNoHay: T): T {
  try {
    const crudo = window.localStorage.getItem(llave);
    if (!crudo) return siNoHay;
    return JSON.parse(crudo) as T;
  } catch {
    return siNoHay;
  }
}

function escribir(llave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    // Si el navegador no deja guardar (modo privado, disco lleno), la venta
    // ya se mando al servidor de todos modos: se pierde la red de seguridad,
    // no la venta.
  }
}

/**
 * Un identificador unico por venta. Es la llave que evita que una venta
 * reintentada tres veces se guarde tres veces.
 *
 * crypto.randomUUID solo existe en paginas seguras (https o localhost); si
 * entran por la direccion de red de la bodega, no esta, y hay que armarlo a
 * mano.
 */
export function idUnico(): string {
  const c = window.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const azar = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(azar);
  else for (let i = 0; i < 16; i++) azar[i] = Math.floor(Math.random() * 256);
  let salida = "";
  for (let i = 0; i < 16; i++) salida += (azar[i] ?? 0).toString(16).padStart(2, "0");
  return `${salida.slice(0, 8)}-${salida.slice(8, 12)}-${salida.slice(12, 16)}-${salida.slice(
    16,
    20
  )}-${salida.slice(20)}`;
}

// --- Catalogo -------------------------------------------------------------

/** Se guarda una copia para poder cobrar aunque el servidor no conteste. */
export function guardarCatalogo(catalogo: ModeloCaja[]): void {
  escribir(LLAVE_CATALOGO, catalogo);
}

export function catalogoGuardado(): ModeloCaja[] {
  return leer<ModeloCaja[]>(LLAVE_CATALOGO, []);
}

// --- Folio ----------------------------------------------------------------

/**
 * El folio se calcula aqui para que el ticket se imprima en el momento,
 * haya internet o no. El servidor lo respeta si esta libre.
 */
export function siguienteFolioLocal(caja: string, minimo: number): string {
  const guardado = leer<number>(LLAVE_FOLIO, 0);
  const siguiente = Math.max(guardado, minimo) + 1;
  escribir(LLAVE_FOLIO, siguiente);
  return `${caja}-${String(siguiente).padStart(6, "0")}`;
}

export function ajustarFolioLocal(numero: number): void {
  const guardado = leer<number>(LLAVE_FOLIO, 0);
  if (numero > guardado) escribir(LLAVE_FOLIO, numero);
}

// --- Cola de ventas por subir --------------------------------------------

export type EnCola = { venta: VentaParaGuardar; intentos: number };

export function encolar(venta: VentaParaGuardar): void {
  const cola = leer<EnCola[]>(LLAVE_COLA, []);
  cola.push({ venta, intentos: 0 });
  escribir(LLAVE_COLA, cola);
}

export function cola(): EnCola[] {
  return leer<EnCola[]>(LLAVE_COLA, []);
}

export function sacarDeCola(id: string): void {
  const cola = leer<EnCola[]>(LLAVE_COLA, []);
  escribir(
    LLAVE_COLA,
    cola.filter((c) => c.venta.id !== id)
  );
}

export function contarIntento(id: string): void {
  const actual = leer<EnCola[]>(LLAVE_COLA, []);
  for (const c of actual) if (c.venta.id === id) c.intentos += 1;
  escribir(LLAVE_COLA, actual);
}

/**
 * Intenta subir lo que este pendiente. Se llama al cobrar, al volver la
 * conexion y cada minuto.
 */
export async function vaciarCola(): Promise<{
  subidas: number;
  pendientes: number;
  cambiosDeFolio: { enviado: string; quedo: string }[];
}> {
  let subidas = 0;
  const cambiosDeFolio: { enviado: string; quedo: string }[] = [];

  for (const pendiente of cola()) {
    try {
      const respuesta = await fetch("/api/venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendiente.venta),
      });
      if (respuesta.ok) {
        // El servidor respeta el folio que se imprimio, salvo que ya
        // estuviera ocupado. Si le toco otro hay que decirlo: la clienta se
        // fue con un papel que ya no coincide con el registro.
        try {
          const cuerpo = (await respuesta.json()) as { datos?: { folio?: string } };
          const quedo = cuerpo?.datos?.folio;
          const enviado = pendiente.venta.folio;
          if (quedo && enviado && quedo !== enviado) cambiosDeFolio.push({ enviado, quedo });
        } catch {
          // Sin cuerpo que leer: la venta se subio igual, es lo que importa.
        }
        sacarDeCola(pendiente.venta.id);
        subidas++;
        continue;
      }
      // Si el servidor la rechaza por algo de la venta misma (400), reintentar
      // no va a servir de nada: se saca de la cola para no atorar a las demas.
      if (respuesta.status >= 400 && respuesta.status < 500) {
        sacarDeCola(pendiente.venta.id);
        continue;
      }
      contarIntento(pendiente.venta.id);
    } catch {
      // Sin conexion: se queda para la proxima.
      contarIntento(pendiente.venta.id);
    }
  }
  return { subidas, pendientes: cola().length, cambiosDeFolio };
}

// --- Ventas en espera -----------------------------------------------------

export type VentaEnEspera = {
  id: string;
  etiqueta: string;
  lineas: LineaVenta[];
  guardada: string;
};

export function ventasEnEspera(): VentaEnEspera[] {
  return leer<VentaEnEspera[]>(LLAVE_ESPERA, []);
}

export function dejarEnEspera(lineas: LineaVenta[]): VentaEnEspera[] {
  const lista = ventasEnEspera();
  const primera = lineas[0];
  const otras = lineas.length - 1;

  lista.push({
    id: idUnico(),
    // La etiqueta se arma sola con la primera prenda: alcanza para que la
    // vendedora reconozca de quien era sin tener que escribir nada.
    etiqueta: !primera
      ? "Venta vacia"
      : otras === 0
        ? primera.codigo
        : `${primera.codigo} y ${otras} ${otras === 1 ? "prenda mas" : "prendas mas"}`,
    lineas,
    guardada: new Date().toISOString(),
  });
  escribir(LLAVE_ESPERA, lista);
  return lista;
}

export function retomarDeEspera(id: string): { lineas: LineaVenta[]; resto: VentaEnEspera[] } {
  const lista = ventasEnEspera();
  const encontrada = lista.find((v) => v.id === id);
  const resto = lista.filter((v) => v.id !== id);
  escribir(LLAVE_ESPERA, resto);
  return { lineas: encontrada?.lineas ?? [], resto };
}
