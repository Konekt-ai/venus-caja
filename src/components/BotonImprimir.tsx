"use client";

import { useEffect, useRef } from "react";
import { Boton } from "@/components/ui";
import { IconoImprimir } from "@/components/iconos";

/**
 * Imprimir el ticket.
 *
 * En Windows la termica de 80mm se instala como una impresora cualquiera,
 * asi que no hace falta driver ni puerto serie: basta window.print() con la
 * hoja de estilos correcta. De ahi que todo esto sea tan corto.
 */

/** Lo que este ticket le grita a la pantalla que lo mando imprimir. */
export const AVISO_TICKET_IMPRESO = "venus:ticket-impreso";

/**
 * Cambiar el tamano de hoja no se puede con una clase: @page no entiende de
 * selectores. Lo unico que funciona en Chrome 109 y en Firefox 115 es meter
 * otra regla @page al final del documento, que gana por orden, y quitarla al
 * terminar. La clase .en-hoja es la que acomoda el ticket dentro de la carta.
 */
function imprimirEnHoja(): void {
  const raiz = document.documentElement;
  const estilo = document.createElement("style");
  estilo.textContent = "@page { size: auto; margin: 14mm; }";
  document.head.appendChild(estilo);
  raiz.classList.add("en-hoja");

  let limpio = false;
  const limpiar = () => {
    if (limpio) return;
    limpio = true;
    raiz.classList.remove("en-hoja");
    estilo.remove();
    window.removeEventListener("afterprint", limpiar);
  };

  window.addEventListener("afterprint", limpiar);
  // Red de seguridad: si el navegador no avisa que termino, la regla no se
  // queda pegada para siempre estorbando la siguiente impresion.
  window.setTimeout(limpiar, 30000);
  window.print();
}

export function BotonImprimir() {
  return (
    <Boton variante="primario" tamano="grande" onClick={() => window.print()}>
      <IconoImprimir />
      Imprimir ticket
    </Boton>
  );
}

export function BotonImprimirHoja() {
  return (
    <Boton variante="secundario" tamano="grande" onClick={imprimirEnHoja}>
      <IconoImprimir />
      Imprimir en hoja
    </Boton>
  );
}

/**
 * Impresion automatica al abrir /ticket/FOLIO?imprimir=1.
 *
 * Asi manda el ticket la pantalla de cobrar: mete esta pagina en un iframe
 * escondido y no la vuelve a tocar. Por eso aqui NO se llama a focus() ni se
 * abre ventana nueva: la vendedora se queda con el cursor en el buscador,
 * lista para la siguiente clienta, sin darse cuenta de que algo paso.
 *
 * El iframe debe medir 0 y esconderse fuera de la pantalla
 * (position:absolute; left:-10000px; width:0; height:0; border:0),
 * NUNCA con display:none: sin caja, Chrome no calcula la pagina y el papel
 * sale en blanco. Al terminar avisa con postMessage para que la pantalla de
 * cobrar quite el iframe y no queden veinte colgando en la memoria.
 */
export function ImpresionAutomatica({ activa, folio }: { activa: boolean; folio: string }) {
  // Una sola impresion por vida de la pagina, pase lo que pase con los
  // efectos: dos llamadas seguidas a print() sacan dos tickets.
  const yaSeMando = useRef(false);

  useEffect(() => {
    if (!activa || yaSeMando.current) return;
    yaSeMando.current = true;

    let avisado = false;
    const avisar = () => {
      if (avisado) return;
      avisado = true;
      window.removeEventListener("afterprint", avisar);
      if (window.parent !== window) {
        window.parent.postMessage({ venus: AVISO_TICKET_IMPRESO, folio }, window.location.origin);
      }
    };

    const mandar = () => {
      window.addEventListener("afterprint", avisar);
      // Un cuadro de espera para que el navegador ya haya pintado el ticket
      // con su hoja de estilos; imprimir antes saca el papel sin formato.
      window.requestAnimationFrame(() => {
        try {
          window.print();
        } finally {
          // Chrome regresa de print() cuando se cierra el dialogo; Firefox no
          // siempre, por eso el aviso tiene dos caminos y un solo efecto.
          avisar();
        }
      });
    };

    if (document.readyState === "complete") {
      mandar();
    } else {
      window.addEventListener("load", mandar, { once: true });
    }

    return () => {
      window.removeEventListener("load", mandar);
      window.removeEventListener("afterprint", avisar);
    };
  }, [activa, folio]);

  return null;
}
