"use client";

import { useState, useTransition } from "react";
import { cerrarCorte, guardarFondo, registrarRetiro } from "@/acciones/corte";
import type { CorteDelDia } from "@/lib/consultas";
import { aCentavos, pesos, pesosSimple } from "@/lib/dinero";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/tipos";
import { Aviso, Boton, Cifra, Insignia, Tarjeta } from "./ui";

/**
 * El corte del dia.
 *
 * Arriba lo que se vendio; abajo lo que de verdad importa para cerrar: el
 * efectivo que deberia estar en el cajon. Lo de tarjeta y transferencia se
 * separa porque ese dinero nunca paso por ahi.
 */
export default function PanelCorte({
  corte,
  cerrado,
  contado,
  diferencia,
}: {
  corte: CorteDelDia;
  cerrado: boolean;
  contado: number | null;
  diferencia: number | null;
}) {
  const [fondo, setFondo] = useState(pesosSimple(corte.fondo));
  const [retiro, setRetiro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [efectivo, setEfectivo] = useState("");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const correr = (accion: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => {
    empezar(async () => {
      const resultado = await accion();
      setAviso(
        resultado.ok
          ? { tipo: "ok", texto: resultado.mensaje ?? "Listo." }
          : { tipo: "error", texto: resultado.error ?? "No se pudo." }
      );
    });
  };

  return (
    <div className="space-y-4">
      {aviso ? <Aviso tipo={aviso.tipo === "ok" ? "ok" : "error"}>{aviso.texto}</Aviso> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra valor={pesos(corte.total)} texto="Cobrado hoy" tono="vino" />
        <Cifra valor={corte.ventas} texto="Ventas" />
        <Cifra valor={corte.piezas} texto="Piezas" />
        <Cifra valor={pesos(corte.ticket_promedio)} texto="Ticket promedio" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <p className="etiqueta">Como pagaron</p>
          {corte.por_forma.length === 0 ? (
            <p className="text-sm text-humo">Todavia no hay cobros hoy.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {corte.por_forma.map((f) => (
                <li key={f.forma} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium">
                    {NOMBRE_FORMA_PAGO[f.forma as FormaPago] ?? f.forma}
                    <span className="ml-2 text-xs text-humo">
                      {f.ventas} {f.ventas === 1 ? "venta" : "ventas"}
                    </span>
                  </span>
                  <span className="cifra font-semibold">{pesos(f.monto)}</span>
                </li>
              ))}
            </ul>
          )}
          {corte.canceladas > 0 ? (
            <p className="mt-3 text-xs text-humo">
              {corte.canceladas} {corte.canceladas === 1 ? "ticket cancelado" : "tickets cancelados"} (no cuentan en
              los totales).
            </p>
          ) : null}
        </Tarjeta>

        <Tarjeta>
          <div className="mb-3 flex items-center justify-between">
            <p className="etiqueta mb-0">El cajon</p>
            {cerrado ? <Insignia tono="ok">Corte cerrado</Insignia> : <Insignia tono="oro">Abierto</Insignia>}
          </div>

          <ul className="mb-4 divide-y divide-linea text-sm">
            <li className="flex justify-between py-2">
              <span className="text-humo">Fondo con el que abrio</span>
              <span className="cifra">{pesos(corte.fondo)}</span>
            </li>
            <li className="flex justify-between py-2">
              <span className="text-humo">Efectivo cobrado</span>
              <span className="cifra">
                {pesos(corte.por_forma.find((f) => f.forma === "efectivo")?.monto ?? 0)}
              </span>
            </li>
            <li className="flex justify-between py-2">
              <span className="text-humo">Retiros</span>
              <span className="cifra">-{pesos(corte.retiros)}</span>
            </li>
            <li className="flex items-center justify-between border-t border-linea-fuerte py-3">
              <span className="font-semibold">Debe haber en el cajon</span>
              <span className="titulo cifra text-[1.5rem]">{pesos(corte.efectivo_esperado)}</span>
            </li>
          </ul>

          {cerrado ? (
            <div className="rounded-sm border border-linea bg-crema p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-humo">Se conto</span>
                <span className="cifra font-semibold">{pesos(contado ?? 0)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-humo">Diferencia</span>
                <span
                  className={`cifra font-semibold ${
                    (diferencia ?? 0) === 0 ? "text-verde" : (diferencia ?? 0) > 0 ? "text-ambar" : "text-rojo"
                  }`}
                >
                  {pesos(diferencia ?? 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <label className="etiqueta" htmlFor="fondo">
                    Fondo
                  </label>
                  <input
                    id="fondo"
                    className="campo sin-flechas"
                    inputMode="decimal"
                    value={fondo}
                    onChange={(e) => setFondo(e.target.value)}
                  />
                </div>
                <Boton onClick={() => correr(() => guardarFondo(aCentavos(fondo) ?? 0))} disabled={pendiente}>
                  Guardar fondo
                </Boton>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <label className="etiqueta" htmlFor="retiro">
                    Retiro
                  </label>
                  <input
                    id="retiro"
                    className="campo sin-flechas"
                    inputMode="decimal"
                    value={retiro}
                    onChange={(e) => setRetiro(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="etiqueta" htmlFor="motivo-retiro">
                    Para que
                  </label>
                  <input
                    id="motivo-retiro"
                    className="campo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Comida, proveedor..."
                  />
                </div>
                <Boton
                  onClick={() =>
                    correr(async () => {
                      const r = await registrarRetiro(aCentavos(retiro) ?? 0, motivo);
                      if (r.ok) {
                        setRetiro("");
                        setMotivo("");
                      }
                      return r;
                    })
                  }
                  disabled={pendiente}
                >
                  Anotar
                </Boton>
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-linea pt-3">
                <div className="w-32">
                  <label className="etiqueta" htmlFor="efectivo">
                    Efectivo contado
                  </label>
                  <input
                    id="efectivo"
                    className="campo sin-flechas"
                    inputMode="decimal"
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="etiqueta" htmlFor="nota-corte">
                    Nota
                  </label>
                  <input
                    id="nota-corte"
                    className="campo"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <Boton
                  variante="primario"
                  onClick={() =>
                    correr(() => cerrarCorte(aCentavos(efectivo) ?? 0, corte.efectivo_esperado, nota))
                  }
                  disabled={pendiente || !efectivo}
                >
                  Cerrar el dia
                </Boton>
              </div>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
