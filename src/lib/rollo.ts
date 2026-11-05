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

/**
 * Le pide al navegador una hoja del largo exacto del ticket.
 *
 * El ticket dice "size: 58mm auto" (que la hoja mida lo que mida el
 * ticket), pero Chrome en el telefono no respeta ese "auto": usa una hoja
 * larga fija y el papel sale con un tramo en blanco enorme debajo del
 * ticket. Aqui se mide lo que de verdad ocupa y se pide ese largo, justo
 * antes de imprimir. Se usa en el rollo de 58 mm (el SUNMI); la termica de
 * la tienda ya corta donde acaba el ticket.
 */
export function ajustarHojaAlTicket(doc: Document, ancho: AnchoRollo): void {
  const ticket = doc.querySelector(".ticket");
  if (!ticket) return;
  // De pixeles de pantalla (96 por pulgada) a milimetros, mas un poquito
  // para que el ultimo renglon no quede pegado a la orilla del corte.
  const largo = Math.ceil((ticket.getBoundingClientRect().height * 25.4) / 96) + 4;
  const anterior = doc.getElementById("venus-hoja-del-ticket");
  if (anterior) anterior.remove();
  const estilo = doc.createElement("style");
  estilo.id = "venus-hoja-del-ticket";
  estilo.textContent = `@page { size: ${ancho}mm ${largo}mm; margin: 0; }`;
  doc.head.appendChild(estilo);
}
