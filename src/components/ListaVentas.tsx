"use client";

import { useState, useTransition } from "react";
import { cancelar } from "@/acciones/ventas";
import type { VentaResumen } from "@/lib/consultas";
import { pesos } from "@/lib/dinero";
import { imprimirDireccion } from "@/lib/imprimir";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/tipos";
import { Aviso, Boton, Insignia, Vacio } from "./ui";
import { IconoImprimir, IconoTicket } from "./iconos";

/** Lo cobrado hoy: reimprimir un ticket y cancelar uno equivocado. */
export default function ListaVentas({ ventas, puedeCancelar }: { ventas: VentaResumen[]; puedeCancelar: boolean }) {
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const confirmarCancelacion = (id: string) => {
    empezar(async () => {
      const resultado = await cancelar(id, motivo);
      if (resultado.ok) {
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Se cancelo." });
        setCancelando(null);
        setMotivo("");
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  if (ventas.length === 0) {
    return (
      <Vacio
        icono={<IconoTicket tamano={22} />}
        titulo="Todavia no se cobra nada hoy"
        descripcion="En cuanto se cobre la primera venta aparece aqui, con su ticket."
      />
    );
  }

  return (
    <div className="space-y-4">
      {aviso ? <Aviso tipo={aviso.tipo === "ok" ? "ok" : "error"}>{aviso.texto}</Aviso> : null}

      <div className="overflow-hidden rounded-sm border border-linea bg-papel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linea-fuerte text-left">
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo">Ticket</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo">Hora</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo">Vendio</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo">Pago</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-humo">
                Pzas
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-humo">
                Total
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => {
              const cancelada = venta.estado === "cancelada";
              return (
                <tr key={venta.id} className="border-b border-linea last:border-b-0">
                  <td className="codigo px-4 py-3">
                    {venta.folio}
                    {cancelada ? (
                      <span className="ml-2">
                        <Insignia tono="alto">Cancelada</Insignia>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-humo">{venta.fecha.slice(11, 16)}</td>
                  <td className="px-4 py-3">{venta.vendedora}</td>
                  <td className="px-4 py-3 text-humo">
                    {venta.formas
                      .split(", ")
                      .map((f) => NOMBRE_FORMA_PAGO[f as FormaPago] ?? f)
                      .join(", ")}
                  </td>
                  <td className="cifra px-4 py-3 text-right">{venta.piezas}</td>
                  <td className={`cifra px-4 py-3 text-right font-semibold ${cancelada ? "text-humo line-through" : ""}`}>
                    {pesos(venta.total)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Boton onClick={() => imprimirDireccion(`/ticket/${venta.folio}?imprimir=1`)}>
                        <IconoImprimir tamano={15} />
                        Ticket
                      </Boton>
                      {puedeCancelar && !cancelada ? (
                        <Boton variante="peligro" onClick={() => setCancelando(venta.id)}>
                          Cancelar
                        </Boton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cancelando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4">
          <div className="w-full max-w-md rounded-sm border border-linea-fuerte bg-papel p-5">
            <h2 className="titulo mb-2 text-xl">Cancelar el ticket</h2>
            <p className="mb-4 text-sm text-humo">
              La venta no se borra: queda marcada como cancelada y las piezas regresan al inventario de la
              tienda.
            </p>
            <label className="etiqueta" htmlFor="motivo">
              Por que se cancela
            </label>
            <input
              id="motivo"
              className="campo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Se equivoco de prenda, la clienta se arrepintio..."
              autoFocus
            />
            <div className="mt-5 flex gap-3">
              <Boton
                className="flex-1"
                onClick={() => {
                  setCancelando(null);
                  setMotivo("");
                }}
              >
                Mejor no
              </Boton>
              <Boton
                variante="peligro"
                className="flex-1"
                onClick={() => confirmarCancelacion(cancelando)}
                disabled={!motivo.trim() || pendiente}
              >
                Si, cancelar
              </Boton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
