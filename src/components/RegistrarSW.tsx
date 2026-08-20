"use client";

import { useEffect } from "react";

/**
 * Prende el trabajador de servicio (public/sw.js).
 *
 * Es lo unico que hace, y no pinta nada en la pantalla: se cuelga una vez en
 * el layout y se olvida. Sin el, recargar la pagina sin internet deja la
 * caja en blanco y se pierde la venta.
 */
export default function RegistrarSW() {
  useEffect(() => {
    /*
     * Los trabajadores de servicio solo existen en paginas seguras: https o
     * localhost. En la tienda se entra por https (el tunel) y en la bodega
     * por localhost, asi que ahi si corre. Si alguien entra por la direccion
     * de red pelada (http://192.168.x.x) no hay trabajador, y esto no debe
     * tronar: la caja sigue cobrando igual, nomas no aguanta una recarga
     * sin internet.
     */
    if (!("serviceWorker" in window.navigator)) return;
    if (!window.isSecureContext) return;

    let cancelado = false;

    const registrar = () => {
      if (cancelado) return;
      window.navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((falla: unknown) => {
        // Que no se pueda registrar no es motivo para tirar la pantalla de
        // cobrar: queda en el registro del navegador y ya.
        console.warn("No se pudo prender el trabajador de servicio.", falla);
      });
    };

    /*
     * Hasta que termine de cargar todo. Registrarlo antes le quitaria turno
     * al catalogo, que es lo unico que de verdad se necesita para cobrar.
     */
    if (document.readyState === "complete") {
      registrar();
      return;
    }

    window.addEventListener("load", registrar);
    return () => {
      cancelado = true;
      window.removeEventListener("load", registrar);
    };
  }, []);

  return null;
}
