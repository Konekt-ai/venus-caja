"use client";

/**
 * De que ancho es el rollo de la impresora de ESTE equipo.
 *
 * La termica de la tienda es de 80 mm; la del SUNMI del tianguis, de 58 mm.
 * Imprimen el mismo ticket pero acomodado a su papel. Como cada equipo tiene
 * la suya, se guarda en el navegador del propio equipo (igual que si imprime
 * por el navegador o por RawBT) y se elige en "Impresora de este equipo".
 */

export type AnchoRollo = 80 | 58;

const LLAVE = "venus_caja_rollo";

export function anchoRollo(): AnchoRollo {
  try {
    return window.localStorage.getItem(LLAVE) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export function guardarAnchoRollo(ancho: AnchoRollo): void {
  try {
    window.localStorage.setItem(LLAVE, String(ancho));
  } catch {
    // Sin donde guardarlo, el equipo se queda con el rollo de 80 mm.
  }
}
