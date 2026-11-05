"use client";

import { ticketEscPos } from "./escpos";
import type { TicketVenta } from "./ticket";

/**
 * Imprimir con RawBT, la app de Android que hace de puente con la impresora.
 *
 * La impresora del SUNMI no la ve el navegador: no aparece en la ventana de
 * imprimir de Chrome. RawBT si la ve, y recibe el ticket ya armado en ESC/POS
 * (ver escpos.ts) por una liga especial de Android ("intent"). Al tocarla,
 * Android le pasa los bytes a RawBT, que los imprime y regresa a la caja.
 *
 * Como cada equipo imprime distinto (la tienda por el navegador, el SUNMI
 * por RawBT), la eleccion se guarda en el propio navegador del equipo, no
 * en la base: se elige una vez en la pantalla "Impresora de este equipo".
 */

export type ComoImprime = "navegador" | "rawbt";

const LLAVE = "venus_caja_impresora";

export function comoImprime(): ComoImprime {
  try {
    return window.localStorage.getItem(LLAVE) === "rawbt" ? "rawbt" : "navegador";
  } catch {
    return "navegador";
  }
}

export function guardarComoImprime(valor: ComoImprime): void {
  try {
    window.localStorage.setItem(LLAVE, valor);
  } catch {
    // Sin donde guardarlo, el equipo se queda imprimiendo por el navegador.
  }
}

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  // Por pedazos: String.fromCharCode con miles de argumentos revienta la pila.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return window.btoa(binario);
}

/**
 * La liga que abre RawBT con el ticket. "base64," le dice que lo que sigue
 * son bytes de impresora y no texto. 'package' hace que, si RawBT no esta
 * instalado, Android mande a la tienda de apps en vez de no hacer nada.
 */
export function ligaRawBT(bytes: Uint8Array): string {
  return `intent:base64,${aBase64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/**
 * Lo mismo pero como texto llano, sin imagen ni letras grandes. Sirve de
 * prueba por si alguna version de RawBT no entendiera los bytes.
 */
export function ligaRawBTTexto(texto: string): string {
  return `intent:${encodeURI(texto)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/**
 * Manda los bytes a RawBT. Tiene que llamarse en respuesta a un toque o
 * una tecla: Android no abre otra app si la pagina lo intenta sola.
 */
export function imprimirConRawBT(bytes: Uint8Array): void {
  window.location.href = ligaRawBT(bytes);
}

/**
 * Reimprime un ticket ya guardado: pide sus datos y lo manda a RawBT.
 * Devuelve el error para mostrarlo, o null si se mando.
 */
export async function reimprimirConRawBT(folio: string): Promise<string | null> {
  try {
    const respuesta = await fetch(`/api/ticket/${encodeURIComponent(folio)}`);
    const datos = (await respuesta.json()) as { ok?: boolean; venta?: TicketVenta; error?: string };
    if (!datos.ok || !datos.venta) return datos.error ?? "No se pudo leer el ticket.";
    imprimirConRawBT(ticketEscPos(datos.venta));
    return null;
  } catch {
    return "Sin conexion no se puede reimprimir. Vuelve a intentar cuando haya senal.";
  }
}
