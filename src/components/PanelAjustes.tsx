"use client";

import { useState, useTransition } from "react";
import { estadoDelSistema, guardarBloqueoSinExistencia, guardarFondoInicial } from "@/acciones/ajustes";
import type { EstadoSistema } from "@/acciones/ajustes";
import { Aviso, Boton, Insignia, Tarjeta } from "./ui";
import { IconoAlerta, IconoCandado, IconoDescargar, IconoEspera, IconoPalomita } from "./iconos";

/**
 * Los ajustes de la caja, el respaldo y la actualizacion.
 *
 * Esta pantalla la abre el duenio, casi siempre por telefono y con alguien
 * de la tienda del otro lado. Por eso cada perilla dice que pasa si se
 * prende y que pasa si se apaga, en lugar de nada mas el nombre del ajuste.
 */

export type DatosAjustes = {
  bloqueo: boolean;
  fondo: string;
  caja: string;
  rutaBase: string;
  permiteActualizar: boolean;
  baseAbierta: boolean;
};

type Recado = { tipo: "ok" | "error" | "info"; texto: string };

/** Las dos flechas en circulo. No estaba en iconos.tsx: mismo trazo, misma rejilla. */
function IconoActualizar({ tamano = 20 }: { tamano?: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.25 11.25a8.25 8.25 0 0 0-14.1-5.4L3.75 8.25" />
      <path d="M3.75 3.75v4.5h4.5" />
      <path d="M3.75 12.75a8.25 8.25 0 0 0 14.1 5.4l2.4-2.4" />
      <path d="M20.25 20.25v-4.5h-4.5" />
    </svg>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <span className="text-humo">{etiqueta}</span>
      <span className="codigo break-all text-right text-sm">{valor}</span>
    </li>
  );
}

export default function PanelAjustes({ datos }: { datos: DatosAjustes }) {
  const [bloqueo, setBloqueo] = useState(datos.bloqueo);
  const [fondo, setFondo] = useState(datos.fondo);
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [recado, setRecado] = useState<Recado | null>(null);
  const [pendiente, empezar] = useTransition();

  const cambiarBloqueo = (encender: boolean) => {
    empezar(async () => {
      const resultado = await guardarBloqueoSinExistencia(encender);
      if (resultado.ok) {
        setBloqueo(encender);
        setRecado({ tipo: "ok", texto: resultado.mensaje ?? "Listo." });
      } else {
        setRecado({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const guardarElFondo = () => {
    empezar(async () => {
      const resultado = await guardarFondoInicial(fondo);
      setRecado(
        resultado.ok
          ? { tipo: "ok", texto: resultado.mensaje ?? "Listo." }
          : { tipo: "error", texto: resultado.error }
      );
    });
  };

  const verEstado = () => {
    empezar(async () => {
      const resultado = await estadoDelSistema();
      if (resultado.ok && resultado.datos) setEstado(resultado.datos);
      else if (!resultado.ok) setRecado({ tipo: "error", texto: resultado.error });
    });
  };

  const actualizar = () => {
    setConfirmando(false);
    setActualizando(true);
    empezar(async () => {
      try {
        const respuesta = await fetch("/api/actualizar", { method: "POST" });
        const cuerpo = (await respuesta.json()) as { ok?: boolean; mensaje?: string; error?: string };
        if (cuerpo.ok) {
          setRecado({ tipo: "info", texto: cuerpo.mensaje ?? "Empezo la actualizacion." });
        } else {
          setActualizando(false);
          setRecado({ tipo: "error", texto: cuerpo.error ?? "No se pudo empezar la actualizacion." });
        }
      } catch {
        // Si el servidor alcanzo a apagarse antes de contestar, la
        // actualizacion SI arranco: decir que fallo mandaria a alguien a
        // apretar el boton otra vez a media actualizacion.
        setRecado({
          tipo: "info",
          texto: "Se mando la orden de actualizar. La caja se esta reiniciando; espera un par de minutos.",
        });
      }
    });
  };

  return (
    <div className="space-y-5">
      {recado ? <Aviso tipo={recado.tipo}>{recado.texto}</Aviso> : null}

      {!datos.baseAbierta ? (
        <Aviso tipo="error">
          No se pudo abrir la base de datos de la bodega. Revisa que la computadora de la bodega este
          encendida y que la ruta de aqui abajo sea la correcta.
        </Aviso>
      ) : null}

      {/* ---------- El candado de existencias ---------- */}
      <Tarjeta>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="titulo flex items-center gap-2 text-lg">
            <IconoCandado tamano={18} />
            Cobrar sin piezas en la tienda
          </h2>
          {bloqueo ? (
            <Insignia tono="alto">Encendido: no deja cobrar</Insignia>
          ) : (
            <Insignia tono="ok">Apagado: se cobra igual</Insignia>
          )}
        </div>

        <div className="space-y-2 text-sm leading-relaxed text-humo">
          <p>
            Encendido, la caja <strong className="text-tinta">NO deja cobrar</strong> una prenda que no tenga
            piezas registradas en la tienda.
          </p>
          <p>
            Hoy va apagado porque la bodega todavia no registra los envios a la tienda: casi todo el catalogo
            aparece en cero, y detener una venta por eso seria perderla. Mientras siga apagado la venta se
            cobra igual, la prenda queda marcada y el corte del dia reporta cuales salieron sin respaldo.
          </p>
          <p>
            Prendelo el dia que la bodega ya anote lo que manda a la tienda y los numeros sean de fiar. Ese
            dia el candado deja de estorbar y empieza a cuidar el inventario.
          </p>
        </div>

        <div className="mt-4">
          {bloqueo ? (
            <Boton onClick={() => cambiarBloqueo(false)} disabled={pendiente}>
              Apagar el candado
            </Boton>
          ) : (
            <Boton variante="primario" onClick={() => cambiarBloqueo(true)} disabled={pendiente}>
              Encender el candado
            </Boton>
          )}
        </div>
      </Tarjeta>

      {/* ---------- El fondo ---------- */}
      <Tarjeta>
        <h2 className="titulo mb-2 text-lg">Fondo con el que abre la caja</h2>
        <p className="mb-4 text-sm leading-relaxed text-humo">
          El dinero que se deja en el cajon para dar cambio. Se pone solo al abrir el corte de cada dia, para
          que nadie tenga que capturarlo cada manana. El fondo del dia que ya empezo se corrige en Ventas del
          dia, que es donde se cuenta el cajon.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <label className="etiqueta" htmlFor="fondo-inicial">
              Fondo
            </label>
            <input
              id="fondo-inicial"
              className="campo sin-flechas"
              inputMode="decimal"
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              placeholder="500.00"
            />
          </div>
          <Boton variante="primario" onClick={guardarElFondo} disabled={pendiente}>
            Guardar fondo
          </Boton>
        </div>
      </Tarjeta>

      {/* ---------- El respaldo ---------- */}
      <Tarjeta>
        <h2 className="titulo mb-2 flex items-center gap-2 text-lg">
          <IconoDescargar tamano={18} />
          Respaldo de un clic
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-humo">
          Baja una copia completa y sana de la base, aunque la tienda este cobrando en este momento. Llega
          como <span className="codigo">venus-respaldo-AAAA-MM-DD.db</span> a la carpeta de descargas de la
          computadora donde estes.
        </p>
        <div className="mb-4 flex items-start gap-2 rounded-sm border border-ambar bg-ambar-palido px-3 py-2.5 text-sm text-ambar">
          <span className="mt-0.5 shrink-0">
            <IconoAlerta tamano={17} />
          </span>
          <p className="leading-relaxed">
            Ese archivo trae <strong>TODO</strong>: el inventario completo de la bodega y todas las ventas de
            la caja, con sus precios y sus vendedoras. Es la base entera. Guardalo donde no lo abra cualquiera.
          </p>
        </div>
        {/* Un enlace de toda la vida y no un boton con fetch: asi el navegador
            se encarga de la descarga, se puede guardar con clic derecho, y la
            base no tiene que pasar por la memoria de la pagina. */}
        <a
          href="/api/respaldo"
          className="inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-sm bg-vino px-4 py-2.5 text-sm font-semibold text-marfil transition-colors hover:bg-vino-oscuro"
        >
          <IconoDescargar tamano={18} />
          Bajar respaldo ahora
        </a>
        <p className="mt-3 text-xs leading-relaxed text-humo">
          Ademas de este, la computadora de la bodega guarda uno sola todas las noches a las 22:30 en la
          carpeta respaldos, y se queda con los ultimos 30 dias. Los de aqui son para llevartelos fuera.
        </p>
      </Tarjeta>

      {/* ---------- La actualizacion ---------- */}
      <Tarjeta>
        <h2 className="titulo mb-2 flex items-center gap-2 text-lg">
          <IconoActualizar tamano={18} />
          Actualizar el sistema
        </h2>

        {datos.permiteActualizar ? (
          <>
            <p className="mb-3 text-sm leading-relaxed text-humo">
              Busca si hay una version nueva y la deja instalada. Antes de tocar nada saca un respaldo, y si
              la version nueva no sirve se regresa sola a la de ahorita: la tienda nunca se queda sin poder
              cobrar.
            </p>
            <p className="mb-4 text-sm leading-relaxed text-humo">
              <strong className="text-tinta">El sistema se va a reiniciar solo en un par de minutos.</strong>{" "}
              Es normal que la pantalla se quede sin responder un rato. No cierren nada, no apaguen la
              computadora y no le den otra vez al boton: cuando vuelva, se entra con el PIN de siempre. Mejor
              hazlo con la tienda cerrada o en una hora muerta.
            </p>

            {actualizando ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-vino">
                <IconoEspera tamano={18} />
                Actualizando. Espera un par de minutos y vuelve a cargar la pagina.
              </p>
            ) : confirmando ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Se va a reiniciar la caja. De verdad?</span>
                <Boton variante="primario" onClick={actualizar} disabled={pendiente}>
                  <IconoPalomita tamano={18} />
                  Si, actualizar
                </Boton>
                <Boton onClick={() => setConfirmando(false)} disabled={pendiente}>
                  Mejor no
                </Boton>
              </div>
            ) : (
              <Boton variante="oscuro" onClick={() => setConfirmando(true)} disabled={pendiente}>
                <IconoActualizar tamano={18} />
                Buscar actualizacion
              </Boton>
            )}
          </>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-humo">
              La actualizacion desde esta pantalla esta apagada, que es como viene de fabrica: es un boton que
              corre programas en la computadora de la bodega y no tiene por que estar prendido si nadie lo
              pidio.
            </p>
            <Aviso tipo="info">
              Para actualizar a mano: metete a la computadora de la bodega, abre la carpeta de venus-caja y
              dale doble clic a ACTUALIZAR.bat. Ahi mismo se ve todo lo que va haciendo y si algo fallo.
            </Aviso>
            <p className="mt-3 text-sm leading-relaxed text-humo">
              Para prender el boton, en el archivo <span className="codigo">.env.local</span> de la caja se
              agrega la linea <span className="codigo">VENUS_PERMITE_ACTUALIZAR=1</span> y se reinicia la
              caja.
            </p>
          </>
        )}
      </Tarjeta>

      {/* ---------- A que base esta pegada, y como va ---------- */}
      <Tarjeta>
        <h2 className="titulo mb-2 text-lg">Estado del sistema</h2>
        <p className="mb-4 text-sm leading-relaxed text-humo">
          Esto es lo que hay que leer cuando se pide ayuda por telefono. El nombre de la caja y la ruta de la
          base salen del archivo <span className="codigo">.env.local</span> y no se cambian desde aqui: se
          cambian en esa computadora y se reinicia la caja.
        </p>

        <ul className="divide-y divide-linea text-sm">
          <Renglon etiqueta="Nombre de esta caja" valor={datos.caja} />
          <Renglon etiqueta="Base de datos" valor={datos.rutaBase} />
        </ul>

        {estado ? (
          <ul className="divide-y divide-linea border-t border-linea text-sm">
            <Renglon etiqueta="Version del sistema" valor={estado.version} />
            <Renglon
              etiqueta="Ultimo respaldo"
              valor={
                estado.respaldo_cuando === ""
                  ? "Nunca se ha respaldado"
                  : estado.respaldo_cuando +
                    " (" +
                    (estado.respaldo_dias <= 0 ? "hoy" : "hace " + String(estado.respaldo_dias) + " dias") +
                    ", " +
                    estado.respaldo_de +
                    ")"
              }
            />
            <Renglon etiqueta="Ventas guardadas" valor={String(estado.ventas)} />
            <Renglon
              etiqueta="Hay registro desde"
              valor={estado.desde === "" ? "Todavia no se ha cobrado nada" : estado.desde}
            />
            {estado.actualizacion_cuando !== "" ? (
              <Renglon etiqueta="Ultima actualizacion pedida" valor={estado.actualizacion_cuando} />
            ) : null}
          </ul>
        ) : null}

        {estado && estado.problema !== "" ? (
          <p className="mt-3 text-sm text-rojo">{estado.problema}</p>
        ) : null}

        {estado && estado.respaldo_dias > 7 ? (
          <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-ambar">
            <span className="mt-0.5 shrink-0">
              <IconoAlerta tamano={17} />
            </span>
            <span>
              El ultimo respaldo ya tiene {estado.respaldo_dias} dias. Baja uno ahorita y guardalo fuera de
              esta computadora.
            </span>
          </p>
        ) : null}

        <div className="mt-4">
          <Boton onClick={verEstado} disabled={pendiente}>
            {estado ? "Volver a revisar" : "Ver estado"}
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}
