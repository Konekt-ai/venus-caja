"use client";

import { useEffect, useState } from "react";
import { ticketEscPos, ventaDePrueba } from "@/lib/escpos";
import { imprimirDocumento } from "@/lib/imprimir";
import { comoImprime, guardarComoImprime, imprimirConRawBT, ligaRawBTTexto, type ComoImprime } from "@/lib/rawbt";
import { anchoRollo, guardarAnchoRollo, type AnchoRollo } from "@/lib/rollo";
import { documentoTicket } from "@/lib/ticket";
import { Aviso, Boton, Tarjeta } from "./ui";
import { IconoImprimir } from "./iconos";

const OPCIONES: { valor: ComoImprime; titulo: string; detalle: string }[] = [
  {
    valor: "navegador",
    titulo: "Por el navegador",
    detalle:
      "La computadora de la tienda, o el SUNMI con el plugin de impresora instalado: la impresora aparece al imprimir.",
  },
  {
    valor: "rawbt",
    titulo: "Por RawBT",
    detalle: "El SUNMI del tianguis: su impresora no la ve el navegador y se usa la app RawBT de puente.",
  },
];

/**
 * Como imprime ESTE equipo. Se guarda en el navegador del propio equipo, no
 * en la base: la tienda y el SUNMI usan el mismo programa pero imprimen
 * distinto, y cada uno se configura una sola vez.
 */
export default function PanelImpresora() {
  const [modo, setModo] = useState<ComoImprime>("navegador");
  const [rollo, setRollo] = useState<AnchoRollo>(80);
  const [aviso, setAviso] = useState<string | null>(null);

  // Se lee ya en el navegador: en el servidor no hay donde buscarlo.
  useEffect(() => {
    setModo(comoImprime());
    setRollo(anchoRollo());
  }, []);

  const elegirRollo = (ancho: AnchoRollo) => {
    guardarAnchoRollo(ancho);
    setRollo(ancho);
    setAviso(`El ticket de este equipo ahora se acomoda a rollo de ${ancho} mm.`);
  };

  const elegir = (valor: ComoImprime) => {
    guardarComoImprime(valor);
    setModo(valor);
    setAviso(valor === "rawbt" ? "Este equipo ahora imprime por RawBT." : "Este equipo ahora imprime por el navegador.");
  };

  const probar = () => {
    if (modo === "rawbt") imprimirConRawBT(ticketEscPos(ventaDePrueba()));
    else imprimirDocumento(documentoTicket(ventaDePrueba(), rollo), rollo);
  };

  return (
    <div className="space-y-4">
      {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}

      <Tarjeta>
        <p className="etiqueta">Como imprime este equipo</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => elegir(o.valor)}
              aria-pressed={modo === o.valor}
              className={`rounded-sm border px-4 py-3 text-left ${
                modo === o.valor ? "border-vino bg-vino-palido" : "border-linea-fuerte bg-papel hover:border-oro"
              }`}
            >
              <span className={`block font-semibold ${modo === o.valor ? "text-vino" : "text-tinta"}`}>
                {o.titulo}
              </span>
              <span className="mt-0.5 block text-sm text-humo">{o.detalle}</span>
            </button>
          ))}
        </div>
        {modo === "navegador" ? (
          <div className="mt-4">
            <p className="etiqueta">Ancho del rollo</p>
            <div className="grid grid-cols-2 gap-2">
              {([80, 58] as const).map((ancho) => (
                <button
                  key={ancho}
                  type="button"
                  onClick={() => elegirRollo(ancho)}
                  aria-pressed={rollo === ancho}
                  className={`rounded-sm border px-4 py-3 text-left ${
                    rollo === ancho ? "border-vino bg-vino-palido" : "border-linea-fuerte bg-papel hover:border-oro"
                  }`}
                >
                  <span className={`block font-semibold ${rollo === ancho ? "text-vino" : "text-tinta"}`}>
                    {ancho} mm
                  </span>
                  <span className="mt-0.5 block text-sm text-humo">
                    {ancho === 80 ? "La termica de la tienda" : "El SUNMI del tianguis"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-humo">
          Se guarda solo en este equipo. Cada computadora o celular se configura una vez.
        </p>
      </Tarjeta>

      <Tarjeta>
        <p className="etiqueta">Probar</p>
        <p className="mb-3 text-sm text-humo">
          Saca un ticket inventado, sin cobrar nada. Si sale completo y derecho, quedo lista. En el telefono
          sale la pantalla de imprimir: ahi se elige la impresora y se toca Imprimir.
        </p>
        <Boton variante="primario" tamano="grande" className="w-full sm:w-auto" onClick={probar}>
          <IconoImprimir />
          Imprimir ticket de prueba
        </Boton>
        {modo === "rawbt" ? (
          <div className="mt-4 border-t border-linea pt-4">
            <p className="text-sm text-humo">
              Si con el boton de arriba RawBT abre pero no sale nada, prueba con este. Imprime solo texto, sin logo
              ni letras grandes, y sirve para saber si el problema es el formato.
            </p>
            <Boton
              className="mt-2 w-full sm:w-auto"
              onClick={() => {
                window.location.href = ligaRawBTTexto(
                  "VENUS BOUTIQUE\nPrueba de texto simple\nSi esto se lee, RawBT recibe texto.\n\n\n"
                );
              }}
            >
              Probar con texto simple
            </Boton>
          </div>
        ) : null}
      </Tarjeta>

      {modo === "rawbt" ? (
        <Tarjeta>
          <p className="etiqueta">Preparar RawBT en el SUNMI (una sola vez)</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-tinta">
            <li>Instala RawBT desde la Play Store (se llama &quot;RawBT print service&quot;).</li>
            <li>
              Abrela y en la configuracion de la conexion elige <strong>Bluetooth</strong> y la impresora{" "}
              <strong>InnerPrinter</strong> (es la impresora interna del SUNMI).
            </li>
            <li>
              Pon el papel en <strong>58 mm</strong> y el modo de impresion en <strong>ESC/POS</strong>. Si tiene la
              opcion, apaga la vista previa para que imprima directo.
            </li>
            <li>Imprime la pagina de prueba de RawBT para confirmar que la impresora responde.</li>
            <li>Regresa aqui y toca &quot;Imprimir ticket de prueba&quot;.</li>
          </ol>
        </Tarjeta>
      ) : null}
    </div>
  );
}
