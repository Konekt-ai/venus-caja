"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoPalomita, IconoSinRed } from "@/components/iconos";
import { Aviso, Boton, Tarjeta } from "@/components/ui";

/**
 * La pantalla que sale cuando se recarga la caja y no hay internet.
 *
 * El trabajador de servicio (public/sw.js) la guarda desde el primer dia y
 * la entrega cuando la red no contesta y no hay copia de la pantalla que se
 * pedia. Lo unico que tiene que lograr es que la vendedora NO piense que el
 * sistema se murio ni que las ventas se perdieron.
 */
export default function Pagina() {
  const [enLinea, setEnLinea] = useState(false);

  useEffect(() => {
    setEnLinea(window.navigator.onLine);
    const volvio = () => setEnLinea(true);
    const sefue = () => setEnLinea(false);
    window.addEventListener("online", volvio);
    window.addEventListener("offline", sefue);
    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", sefue);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-marfil p-4">
      <div className="w-full max-w-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="marca text-2xl">Venus</span>
          <span className="etiqueta mb-0">Caja</span>
        </div>

        <Tarjeta>
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-crema text-humo">
              <IconoSinRed tamano={24} />
            </span>
            <div>
              <h1 className="titulo text-2xl leading-tight">No hay internet</h1>
              <p className="mt-1 text-sm text-humo">
                No se pudo abrir esta pantalla porque no hay conexion con la computadora de la bodega.
              </p>
            </div>
          </div>

          <div className="filete mb-5" />

          <p className="text-sm leading-relaxed">
            Las ventas que ya se cobraron <strong>estan guardadas en esta computadora</strong> y se van a
            subir solas en cuanto vuelva la conexion. No se perdio ninguna. No cierres el navegador ni
            apagues la computadora hasta que se suban.
          </p>

          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-verde">
                <IconoPalomita tamano={18} />
              </span>
              <span>
                <strong>Si se puede cobrar e imprimir tickets.</strong> Vuelve a la pantalla de cobrar y
                sigue trabajando normal.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-ambar">
                <IconoAlerta tamano={18} />
              </span>
              <span>
                <strong>No se pueden ver los reportes ni el corte del dia</strong>, porque esos numeros
                viven en la bodega.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-ambar">
                <IconoAlerta tamano={18} />
              </span>
              <span>
                <strong>En la bodega no van a ver estas ventas todavia.</strong> Las van a ver todas
                juntas cuando regrese el internet.
              </span>
            </li>
          </ul>

          {enLinea ? (
            <div className="mt-5">
              <Aviso tipo="ok">Ya volvio la conexion. Dale a Reintentar.</Aviso>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Boton
              variante="primario"
              tamano="grande"
              onClick={() => window.location.reload()}
              className="flex-1"
            >
              Reintentar
            </Boton>
            {/*
              Con location y no con un enlace de Next: sin red, el enlace de
              Next pediria los datos de la pantalla al servidor y se quedaria
              pensando. Asi el navegador pide la pagina completa y el
              trabajador de servicio le entrega la copia guardada.
            */}
            <Boton tamano="grande" onClick={() => window.location.assign("/")}>
              Ir a cobrar
            </Boton>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-humo">
            Si esto sigue asi despues de un rato, revisa que la computadora de la bodega este prendida y
            con internet. La caja aguanta sin conexion todo el dia, pero las ventas no se ven en la
            bodega hasta que vuelva.
          </p>
        </Tarjeta>
      </div>
    </main>
  );
}
