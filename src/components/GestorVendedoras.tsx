"use client";

import { useState, useTransition } from "react";
import { agregarVendedora, ponerPin, ponerPinVentas, quitarPin, quitarPinDeVentas } from "@/acciones/vendedoras";
import type { Vendedora } from "@/lib/consultas";
import { Aviso, Boton, Insignia, Tarjeta } from "./ui";
import { IconoCandado, IconoPersona } from "./iconos";

/** El mismo nombre que NOMBRE_CUENTA_VENTAS de lib/sesion, que no se puede importar aqui (es del servidor). */
const NOMBRE_VENTAS = "VENTAS";

/**
 * Las vendedoras y los PIN para entrar. La lista sale del personal que ya
 * capturaron en la bodega: es la misma gente, no hay por que escribirla dos
 * veces. Una vendedora no necesita PIN para aparecer al cobrar: basta con
 * que este en la lista. El PIN de VENTAS es el que usan todas para entrar.
 */
export default function GestorVendedoras({
  personal,
  hayPinVentas,
}: {
  personal: Vendedora[];
  hayPinVentas: boolean;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [rol, setRol] = useState("vendedora");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [pinVentas, setPinVentas] = useState("");
  const [editandoVentas, setEditandoVentas] = useState(false);
  const [pendiente, empezar] = useTransition();

  const avisar = (resultado: { ok: true; mensaje?: string } | { ok: false; error: string }) =>
    setAviso(
      resultado.ok ? { tipo: "ok", texto: resultado.mensaje ?? "Listo." } : { tipo: "error", texto: resultado.error }
    );

  const guardarVentas = () => {
    empezar(async () => {
      const resultado = await ponerPinVentas(pinVentas);
      avisar(resultado);
      if (resultado.ok) {
        setPinVentas("");
        setEditandoVentas(false);
      }
    });
  };

  const guardar = (id: number) => {
    empezar(async () => {
      const resultado = await ponerPin(id, pin, rol);
      if (resultado.ok) {
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Listo." });
        setEditando(null);
        setPin("");
        setRol("vendedora");
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const quitar = (id: number) => {
    empezar(async () => {
      const resultado = await quitarPin(id);
      setAviso(
        resultado.ok
          ? { tipo: "ok", texto: resultado.mensaje ?? "Listo." }
          : { tipo: "error", texto: resultado.error }
      );
    });
  };

  const darDeAlta = () => {
    empezar(async () => {
      const resultado = await agregarVendedora(nombreNueva, "Vendedora");
      if (resultado.ok) {
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Listo." });
        setNombreNueva("");
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      {aviso ? <Aviso tipo={aviso.tipo === "ok" ? "ok" : "error"}>{aviso.texto}</Aviso> : null}

      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="etiqueta mb-1">PIN de la caja: {NOMBRE_VENTAS}</p>
            <p className="max-w-xl text-sm text-humo">
              Con este PIN entran todas a cobrar. Al cobrar se elige de la lista quien hizo la venta.{" "}
              {NOMBRE_VENTAS} no es una vendedora: no aparece en la lista ni en la bodega.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hayPinVentas ? (
              <Insignia tono="ok">
                <IconoCandado tamano={13} /> Con PIN
              </Insignia>
            ) : (
              <Insignia tono="aviso">Sin PIN</Insignia>
            )}
            <Boton
              onClick={() => {
                setEditandoVentas((abierto) => !abierto);
                setPinVentas("");
              }}
            >
              {hayPinVentas ? "Cambiar PIN" : "Poner PIN"}
            </Boton>
            {hayPinVentas ? (
              <Boton
                variante="peligro"
                onClick={() => empezar(async () => avisar(await quitarPinDeVentas()))}
                disabled={pendiente}
              >
                Quitar
              </Boton>
            ) : null}
          </div>
        </div>

        {editandoVentas ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-sm border border-linea bg-crema p-3">
            <div>
              <label className="etiqueta" htmlFor="pin-ventas">
                PIN nuevo
              </label>
              <input
                id="pin-ventas"
                className="campo sin-flechas w-40 text-lg"
                inputMode="numeric"
                value={pinVentas}
                maxLength={8}
                onChange={(e) => setPinVentas(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarVentas();
                }}
                placeholder="4 numeros"
                autoComplete="off"
              />
            </div>
            <Boton variante="primario" onClick={guardarVentas} disabled={pendiente}>
              Guardar
            </Boton>
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <p className="etiqueta">Agregar una vendedora</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <input
              className="campo"
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") darDeAlta();
              }}
              placeholder="Nombre de la vendedora"
              autoComplete="off"
            />
          </div>
          <Boton variante="primario" onClick={darDeAlta} disabled={pendiente || nombreNueva.trim().length < 2}>
            Agregar
          </Boton>
        </div>
        <p className="mt-2 text-xs text-humo">
          Queda en la misma lista de personal del sistema de bodega, no en una aparte.
        </p>
      </Tarjeta>

      {personal.length === 0 ? (
        <Tarjeta>
          <p className="text-sm text-humo">
            Todavia no hay personal dado de alta. Se captura en el sistema de bodega, en la pantalla de
            Personal, y aqui aparece solo.
          </p>
        </Tarjeta>
      ) : (
        <ul className="divide-y divide-linea overflow-hidden rounded-sm border border-linea bg-papel">
          {personal.map((persona) => (
            <li key={persona.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-crema text-humo">
                    <IconoPersona tamano={18} />
                  </span>
                  <div>
                    <p className="font-semibold text-tinta">{persona.nombre}</p>
                    <p className="text-xs text-humo">{persona.puesto || "Sin puesto"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {persona.rol === "duenio" ? <Insignia tono="vino">Duenio</Insignia> : null}
                  {persona.tiene_pin ? (
                    <Insignia tono="ok">
                      <IconoCandado tamano={13} /> Con PIN
                    </Insignia>
                  ) : (
                    // Sin PIN no entra por su cuenta, pero si aparece al cobrar:
                    // con el PIN de VENTAS eso es lo normal, no un pendiente.
                    <Insignia>Sin PIN propio</Insignia>
                  )}
                  <Boton
                    onClick={() => {
                      setEditando(editando === persona.id ? null : persona.id);
                      setPin("");
                      setRol(persona.rol);
                    }}
                  >
                    {persona.tiene_pin ? "Cambiar PIN" : "Poner PIN"}
                  </Boton>
                  {persona.tiene_pin ? (
                    <Boton variante="peligro" onClick={() => quitar(persona.id)} disabled={pendiente}>
                      Quitar
                    </Boton>
                  ) : null}
                </div>
              </div>

              {editando === persona.id ? (
                <div className="mt-3 flex flex-wrap items-end gap-3 rounded-sm border border-linea bg-crema p-3">
                  <div>
                    <label className="etiqueta" htmlFor={`pin-${persona.id}`}>
                      PIN nuevo
                    </label>
                    <input
                      id={`pin-${persona.id}`}
                      className="campo sin-flechas w-40 text-lg"
                      inputMode="numeric"
                      value={pin}
                      maxLength={8}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="4 numeros"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`rol-${persona.id}`}>
                      Que puede ver
                    </label>
                    <select
                      id={`rol-${persona.id}`}
                      className="campo w-52"
                      value={rol}
                      onChange={(e) => setRol(e.target.value)}
                    >
                      <option value="vendedora">Cobrar y ventas del dia</option>
                      <option value="duenio">Todo, incluidos reportes</option>
                    </select>
                  </div>
                  <Boton variante="primario" onClick={() => guardar(persona.id)} disabled={pendiente}>
                    Guardar
                  </Boton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
