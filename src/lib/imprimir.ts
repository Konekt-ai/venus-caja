"use client";

import { ajustarHojaAlTicket } from "./rollo";

/**
 * Mandar algo a la impresora sin perder el foco del buscador.
 *
 * Se hace en un marco oculto y no abriendo una ventana nueva porque la
 * ventana nueva roba el foco, tapa la pantalla y hay que cerrarla a mano:
 * tres estorbos justo cuando la siguiente clienta ya esta enfrente. Con el
 * marco oculto la vendedora ni se entera, solo oye la impresora.
 *
 * Para que ni siquiera salga el cuadro de "imprimir", el navegador de la
 * tienda se configura una sola vez: Chrome con --kiosk-printing en el
 * acceso directo, o Firefox con print.always_print_silent en about:config.
 * En el telefono (el SUNMI) el cuadro si sale y se queda abierto hasta que
 * se toca Imprimir.
 */

/**
 * El marco del ultimo ticket. No se quita al imprimir sino cuando se manda
 * el siguiente (o a los cinco minutos): en el telefono la pantalla de
 * imprimir se queda abierta lo que la vendedora tarde en tocar Imprimir, y
 * si el marco desaparece mientras tanto Chrome imprime la pantalla de
 * cobrar en lugar del ticket.
 */
let ultimoMarco: HTMLIFrameElement | null = null;

const CINCO_MINUTOS = 5 * 60 * 1000;

function quitar(marco: HTMLIFrameElement): void {
  if (marco.parentNode) marco.parentNode.removeChild(marco);
  if (ultimoMarco === marco) ultimoMarco = null;
}

/** Un marco escondido del ancho del rollo, en lugar del anterior. */
function nuevoMarco(rollo: 80 | 58): HTMLIFrameElement {
  if (ultimoMarco) quitar(ultimoMarco);

  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  // Se esconde sacandolo de la pantalla, NUNCA con display:none ni
  // visibility:hidden: sin caja que medir, Chrome no calcula la pagina y saca
  // el papel en blanco.
  marco.style.position = "absolute";
  marco.style.left = "-10000px";
  marco.style.top = "0";
  marco.style.width = `${rollo}mm`;
  marco.style.height = "1px";
  marco.style.border = "0";

  ultimoMarco = marco;
  window.setTimeout(() => quitar(marco), CINCO_MINUTOS);
  return marco;
}

export function imprimirDocumento(html: string, rollo: 80 | 58 = 80): void {
  const marco = nuevoMarco(rollo);
  document.body.appendChild(marco);

  const doc = marco.contentWindow?.document;
  if (!doc) {
    quitar(marco);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const lanzar = () => {
    try {
      if (rollo === 58 && marco.contentDocument) ajustarHojaAlTicket(marco.contentDocument, 58);
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    } catch {
      // Si el navegador no dejo imprimir, la venta ya quedo guardada: se
      // reimprime desde Ventas del dia.
    }
  };

  // Esperar a que el marco termine de cargar; si ya cargo, se lanza solo.
  if (doc.readyState === "complete") window.setTimeout(lanzar, 60);
  else marco.onload = () => window.setTimeout(lanzar, 60);
}

/**
 * Lo mismo, pero cuando el documento ya vive en una direccion del sistema
 * (la reimpresion de un ticket). Se usa la pagina del servidor para no
 * tener dos versiones del mismo ticket. Esa pagina, abierta con
 * ?imprimir=1, se imprime sola: aqui no se vuelve a llamar a print(), que
 * sacaria dos tickets.
 */
export function imprimirDireccion(url: string, rollo: 80 | 58 = 80): void {
  const marco = nuevoMarco(rollo);
  marco.src = url;
  document.body.appendChild(marco);
}
