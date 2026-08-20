"use client";

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
 */
export function imprimirDocumento(html: string): void {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  // Se esconde sacandolo de la pantalla, NUNCA con display:none ni
  // visibility:hidden: sin caja que medir, Chrome no calcula la pagina y saca
  // el papel en blanco.
  marco.style.position = "absolute";
  marco.style.left = "-10000px";
  marco.style.top = "0";
  marco.style.width = "80mm";
  marco.style.height = "1px";
  marco.style.border = "0";

  document.body.appendChild(marco);

  const doc = marco.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(marco);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const lanzar = () => {
    try {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    } catch {
      // Si el navegador no dejo imprimir, la venta ya quedo guardada: se
      // reimprime desde Ventas del dia.
    }
    // Se quita despues de un rato: quitarlo de inmediato cancela la
    // impresion en algunos navegadores.
    window.setTimeout(() => {
      if (marco.parentNode) marco.parentNode.removeChild(marco);
    }, 4000);
  };

  // Esperar a que el marco termine de cargar; si ya cargo, se lanza solo.
  if (doc.readyState === "complete") window.setTimeout(lanzar, 60);
  else marco.onload = () => window.setTimeout(lanzar, 60);
}

/**
 * Lo mismo, pero cuando el documento ya vive en una direccion del sistema
 * (la reimpresion de un ticket). Se usa la pagina del servidor para no
 * tener dos versiones del mismo ticket.
 */
export function imprimirDireccion(url: string): void {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.position = "absolute";
  marco.style.left = "-10000px";
  marco.style.top = "0";
  marco.style.width = "80mm";
  marco.style.height = "1px";
  marco.style.border = "0";
  marco.src = url;

  marco.onload = () => {
    window.setTimeout(() => {
      try {
        marco.contentWindow?.focus();
        marco.contentWindow?.print();
      } catch {
        // Ya quedo guardada: se puede volver a intentar.
      }
      window.setTimeout(() => {
        if (marco.parentNode) marco.parentNode.removeChild(marco);
      }, 4000);
    }, 120);
  };

  document.body.appendChild(marco);
}
