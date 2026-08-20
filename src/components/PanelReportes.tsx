"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pesos } from "@/lib/dinero";
import type {
  Cuadre,
  FilaFormaPago,
  FilaModelo,
  FilaPeriodo,
  FilaProducto,
  FilaVendedora,
  OrdenProducto,
  ResumenRango,
} from "@/lib/reportes";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/tipos";
import { Aviso, Boton, Cifra, Tarjeta } from "./ui";
import { IconoAlerta, IconoDescargar, IconoPalomita, IconoReportes } from "./iconos";

/**
 * Los numeros del negocio, en tablas y nada mas.
 *
 * Sin graficas de colores a proposito: lo que el duenio hace con esto es
 * comparar dos cifras y decidir que vuelve a pedir. Una barra de colores no
 * le dice si vendio 12 o 14 piezas; un numero si. Todo va con la clase
 * .cifra (digitos de ancho fijo) para que las columnas queden derechas y
 * ordenado de mayor a menor, que es como se lee de un vistazo.
 *
 * El rango vive en la URL (?desde=&hasta=). Asi el duenio puede guardar en
 * favoritos "el mes pasado" y compartir la liga tal cual la esta viendo.
 */

export type Agrupacion = "dia" | "semana" | "mes";

export type Atajo = { nombre: string; etiqueta: string; desde: string; hasta: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * '2026-08-19' -> '19 ago 2026'.
 *
 * Se repite aqui y no se importa de reportes.ts porque ese archivo es
 * server-only: trae las consultas a la base y no puede viajar al navegador.
 */
function fechaLarga(dia: string): string {
  const partes = dia.split("-");
  const mes = Number(partes[1] ?? 0);
  return `${Number(partes[2] ?? 0)} ${MESES[mes - 1] ?? ""} ${partes[0] ?? ""}`;
}

const CLASE_BAJAR =
  "inline-flex select-none items-center gap-2 rounded-sm border border-linea-fuerte bg-papel px-3 py-2 " +
  "text-xs font-semibold text-humo transition-colors hover:border-oro hover:bg-oro-tenue hover:text-tinta";

/** El boton de bajar el CSV. Va como enlace normal y no como Link porque no navega: descarga. */
function Bajar({ tipo, desde, hasta }: { tipo: string; desde: string; hasta: string }) {
  return (
    <a className={CLASE_BAJAR} href={`/api/reporte?tipo=${tipo}&desde=${desde}&hasta=${hasta}`}>
      <IconoDescargar tamano={15} />
      Bajar a Excel
    </a>
  );
}

function Encabezado({ children, derecha = false }: { children: React.ReactNode; derecha?: boolean }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo ${
        derecha ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Cabecera({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="etiqueta mb-0">{titulo}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function SinDatos({ texto }: { texto: string }) {
  return <p className="py-6 text-center text-sm text-humo">{texto}</p>;
}

export default function PanelReportes({
  desde,
  hasta,
  agrupacion,
  orden,
  atajos,
  resumen,
  periodos,
  productos,
  vendedoras,
  formas,
  modelos,
  cuadre,
}: {
  desde: string;
  hasta: string;
  agrupacion: Agrupacion;
  orden: OrdenProducto;
  atajos: Atajo[];
  resumen: ResumenRango;
  periodos: FilaPeriodo[];
  productos: FilaProducto[];
  vendedoras: FilaVendedora[];
  formas: FilaFormaPago[];
  modelos: FilaModelo[];
  cuadre: Cuadre;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [inicio, setInicio] = useState(desde);
  const [fin, setFin] = useState(hasta);

  // Al llegar por un boton rapido la URL cambia sola: los campos de fecha
  // tienen que seguirla o se quedarian mostrando el rango anterior.
  useEffect(() => {
    setInicio(desde);
    setFin(hasta);
  }, [desde, hasta]);

  const ir = (cambios: { desde?: string; hasta?: string; agrupacion?: Agrupacion; orden?: OrdenProducto }) => {
    const partes = new URLSearchParams({
      desde: cambios.desde ?? desde,
      hasta: cambios.hasta ?? hasta,
      agrupar: cambios.agrupacion ?? agrupacion,
      orden: cambios.orden ?? orden,
    });
    empezar(() => router.push(`/reportes?${partes.toString()}`));
  };

  const esteAtajo = (a: Atajo) => a.desde === desde && a.hasta === hasta;

  const agrupaciones: { valor: Agrupacion; texto: string }[] = [
    { valor: "dia", texto: "Por dia" },
    { valor: "semana", texto: "Por semana" },
    { valor: "mes", texto: "Por mes" },
  ];

  const ordenes: { valor: OrdenProducto; texto: string }[] = [
    { valor: "piezas", texto: "Por piezas" },
    { valor: "dinero", texto: "Por dinero" },
  ];

  const masDeUnDia = desde !== hasta;

  return (
    <div className={`space-y-5 ${pendiente ? "opacity-60" : ""}`}>
      <Tarjeta>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="etiqueta">Periodo</p>
            <div className="flex flex-wrap gap-2">
              {atajos.map((a) => (
                <Boton
                  key={a.nombre}
                  variante={esteAtajo(a) ? "primario" : "secundario"}
                  onClick={() => ir({ desde: a.desde, hasta: a.hasta })}
                >
                  {a.etiqueta}
                </Boton>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="etiqueta" htmlFor="desde">
                Del dia
              </label>
              <input
                id="desde"
                type="date"
                className="campo cifra"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="hasta">
                Al dia
              </label>
              <input
                id="hasta"
                type="date"
                className="campo cifra"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
              />
            </div>
            <Boton
              variante="oscuro"
              onClick={() => ir({ desde: inicio, hasta: fin })}
              disabled={!inicio || !fin || pendiente}
            >
              Ver
            </Boton>
          </div>
        </div>

        <p className="mt-4 text-sm text-humo">
          {masDeUnDia ? `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}` : `Dia ${fechaLarga(desde)}`}
          {resumen.canceladas > 0
            ? ` · ${resumen.canceladas} ${
                resumen.canceladas === 1 ? "ticket cancelado no cuenta" : "tickets cancelados no cuentan"
              } en estos numeros.`
            : ""}
        </p>
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra valor={pesos(resumen.total)} texto="Cobrado" tono="vino" />
        <Cifra valor={resumen.ventas} texto={resumen.ventas === 1 ? "Venta" : "Ventas"} />
        <Cifra valor={resumen.piezas} texto="Piezas vendidas" />
        <Cifra valor={pesos(resumen.ticket_promedio)} texto="Ticket promedio" />
      </div>

      {resumen.descuento > 0 ? (
        <p className="text-sm text-humo">
          Se dieron <span className="cifra font-semibold text-tinta">{pesos(resumen.descuento)}</span> de
          descuento sobre <span className="cifra">{pesos(resumen.subtotal)}</span> de precio de lista.
        </p>
      ) : null}

      {/* La cuenta que respalda todo lo demas. Si algun dia no cuadra, se ve aqui y no en una hoja de Excel tres meses despues. */}
      {cuadre.cuadra ? (
        <p className="flex items-center gap-2 text-xs text-verde">
          <IconoPalomita tamano={15} />
          Los renglones de producto suman {pesos(cuadre.productos)}, exactamente lo mismo que las ventas.
        </p>
      ) : (
        <Aviso tipo="error">
          <span className="flex items-center gap-2">
            <IconoAlerta tamano={16} />
            Cuidado: las ventas suman {pesos(cuadre.ventas)} pero sus renglones suman {pesos(cuadre.productos)}.
            Hay {pesos(Math.abs(cuadre.diferencia))} de diferencia.
          </span>
        </Aviso>
      )}

      <Tarjeta>
        <Cabecera titulo="Como se vendio">
          {agrupaciones.map((a) => (
            <Boton
              key={a.valor}
              variante={agrupacion === a.valor ? "oscuro" : "secundario"}
              onClick={() => ir({ agrupacion: a.valor })}
            >
              {a.texto}
            </Boton>
          ))}
          <Bajar tipo={`por-${agrupacion}`} desde={desde} hasta={hasta} />
        </Cabecera>

        {periodos.length === 0 ? (
          <SinDatos texto="No se cobro nada en estas fechas." />
        ) : (
          <div className="overflow-hidden rounded-sm border border-linea">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea-fuerte">
                  <Encabezado>Periodo</Encabezado>
                  <Encabezado derecha>Ventas</Encabezado>
                  <Encabezado derecha>Piezas</Encabezado>
                  <Encabezado derecha>Total</Encabezado>
                </tr>
              </thead>
              <tbody>
                {periodos.map((f) => (
                  <tr key={f.periodo} className="border-b border-linea last:border-b-0">
                    <td className="px-4 py-2.5">{f.etiqueta}</td>
                    <td className="cifra px-4 py-2.5 text-right">{f.ventas}</td>
                    <td className="cifra px-4 py-2.5 text-right">{f.piezas}</td>
                    <td className="cifra px-4 py-2.5 text-right font-semibold">{pesos(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta>
          <Cabecera titulo="Quien vendio">
            <Bajar tipo="por-vendedora" desde={desde} hasta={hasta} />
          </Cabecera>

          {vendedoras.length === 0 ? (
            <SinDatos texto="Todavia nadie vendio en estas fechas." />
          ) : (
            <div className="overflow-hidden rounded-sm border border-linea">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea-fuerte">
                    <Encabezado>Vendedora</Encabezado>
                    <Encabezado derecha>Ventas</Encabezado>
                    <Encabezado derecha>Pzas</Encabezado>
                    <Encabezado derecha>Monto</Encabezado>
                    <Encabezado derecha>Ticket</Encabezado>
                  </tr>
                </thead>
                <tbody>
                  {vendedoras.map((f) => (
                    <tr key={f.vendedora} className="border-b border-linea last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{f.vendedora}</td>
                      <td className="cifra px-4 py-2.5 text-right">{f.ventas}</td>
                      <td className="cifra px-4 py-2.5 text-right">{f.piezas}</td>
                      <td className="cifra px-4 py-2.5 text-right font-semibold">{pesos(f.monto)}</td>
                      <td className="cifra px-4 py-2.5 text-right text-humo">{pesos(f.ticket_promedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <Tarjeta>
          <Cabecera titulo="Como pagaron">
            <Bajar tipo="por-forma-pago" desde={desde} hasta={hasta} />
          </Cabecera>

          {formas.length === 0 ? (
            <SinDatos texto="No hay cobros en estas fechas." />
          ) : (
            <div className="overflow-hidden rounded-sm border border-linea">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea-fuerte">
                    <Encabezado>Forma de pago</Encabezado>
                    <Encabezado derecha>Ventas</Encabezado>
                    <Encabezado derecha>Monto</Encabezado>
                  </tr>
                </thead>
                <tbody>
                  {formas.map((f) => (
                    <tr key={f.forma} className="border-b border-linea last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">
                        {NOMBRE_FORMA_PAGO[f.forma as FormaPago] ?? f.forma}
                      </td>
                      <td className="cifra px-4 py-2.5 text-right">{f.ventas}</td>
                      <td className="cifra px-4 py-2.5 text-right font-semibold">{pesos(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      <Tarjeta>
        <Cabecera titulo="Lo mas vendido">
          {ordenes.map((o) => (
            <Boton
              key={o.valor}
              variante={orden === o.valor ? "oscuro" : "secundario"}
              onClick={() => ir({ orden: o.valor })}
            >
              {o.texto}
            </Boton>
          ))}
          <Bajar
            tipo={orden === "dinero" ? "mas-vendidos-dinero" : "mas-vendidos"}
            desde={desde}
            hasta={hasta}
          />
        </Cabecera>

        {productos.length === 0 ? (
          <SinDatos texto="No salio ninguna prenda en estas fechas." />
        ) : (
          <>
            <div className="overflow-hidden rounded-sm border border-linea">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea-fuerte">
                    <Encabezado>Codigo</Encabezado>
                    <Encabezado>Prenda</Encabezado>
                    <Encabezado derecha>Piezas</Encabezado>
                    <Encabezado derecha>Dinero</Encabezado>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((f) => (
                    <tr key={f.codigo} className="border-b border-linea last:border-b-0">
                      <td className="codigo px-4 py-2.5">{f.codigo}</td>
                      <td className="px-4 py-2.5 text-humo">{f.descripcion}</td>
                      <td className="cifra px-4 py-2.5 text-right font-semibold">{f.piezas}</td>
                      <td className="cifra px-4 py-2.5 text-right">{pesos(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-humo">
              Se ven las primeras {productos.length} prendas. El archivo de Excel trae todas.
            </p>
          </>
        )}
      </Tarjeta>

      <Tarjeta>
        <Cabecera titulo="Para la bodega: lo que salio de la tienda">
          <Bajar tipo="vendido-por-modelo" desde={desde} hasta={hasta} />
        </Cabecera>

        <p className="mb-3 text-sm text-humo">
          Codigo y piezas, nada mas. Es el papel con el que en la bodega cuadran el inventario de la tienda
          contra lo que se cobro.
        </p>

        {modelos.length === 0 ? (
          <SinDatos texto="No hay piezas vendidas en estas fechas." />
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {modelos.slice(0, 18).map((f) => (
                <div
                  key={f.codigo}
                  className="flex items-baseline justify-between border-b border-linea py-1.5 text-sm"
                >
                  <span className="codigo">{f.codigo}</span>
                  <span className="cifra font-semibold">
                    {f.piezas} {f.piezas === 1 ? "pza" : "pzas"}
                  </span>
                </div>
              ))}
            </div>
            {modelos.length > 18 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-humo">
                <IconoReportes tamano={15} />
                Hay {modelos.length - 18} modelos mas. Vienen todos en el archivo.
              </p>
            ) : null}
          </>
        )}
      </Tarjeta>
    </div>
  );
}
