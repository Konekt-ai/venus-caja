import { redirect } from "next/navigation";
import Navegacion from "@/components/Navegacion";
import PanelReportes, { type Agrupacion, type Atajo } from "@/components/PanelReportes";
import { TituloPagina } from "@/components/ui";
import {
  cuadreDeDinero,
  fechaValida,
  loVendidoPorModelo,
  masVendidos,
  porFormaPago,
  porVendedora,
  rangoDePeriodo,
  resumenDelRango,
  ventasPorDia,
  ventasPorMes,
  ventasPorSemana,
  type OrdenProducto,
} from "@/lib/reportes";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** En la tabla caben de sobra; lo demas se lleva en el Excel, que es donde se analiza. */
const PRENDAS_EN_PANTALLA = 25;

type Parametros = { desde?: string; hasta?: string; agrupar?: string; orden?: string };

export default async function Pagina({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  // Cuanto vende cada vendedora y cuanto deja el negocio no es cosa del
  // mostrador: si no es el duenio, de regreso a cobrar.
  if (!esDuenio(sesion)) redirect("/");

  const parametros = await searchParams;

  const atajos: Atajo[] = [
    { nombre: "hoy", etiqueta: "Hoy", ...rangoDePeriodo("hoy") },
    { nombre: "semana", etiqueta: "Esta semana", ...rangoDePeriodo("semana") },
    { nombre: "mes", etiqueta: "Este mes", ...rangoDePeriodo("mes") },
    { nombre: "mes-pasado", etiqueta: "Mes pasado", ...rangoDePeriodo("mes-pasado") },
  ];

  // Sin fechas en la URL se abre en el mes en curso: es lo que el duenio
  // quiere ver al entrar, no un dia suelto.
  const mes = rangoDePeriodo("mes");
  const pedidoDesde = fechaValida(parametros.desde) ?? mes.desde;
  const pedidoHasta = fechaValida(parametros.hasta) ?? mes.hasta;
  // Si teclearon el rango al reves se voltea solo, en vez de mostrar la
  // pantalla vacia y dejar al duenio pensando que no vendio nada.
  const desde = pedidoDesde <= pedidoHasta ? pedidoDesde : pedidoHasta;
  const hasta = pedidoDesde <= pedidoHasta ? pedidoHasta : pedidoDesde;

  const agrupacion: Agrupacion =
    parametros.agrupar === "semana" ? "semana" : parametros.agrupar === "mes" ? "mes" : "dia";
  const orden: OrdenProducto = parametros.orden === "dinero" ? "dinero" : "piezas";

  const periodos =
    agrupacion === "semana"
      ? ventasPorSemana(desde, hasta)
      : agrupacion === "mes"
        ? ventasPorMes(desde, hasta)
        : ventasPorDia(desde, hasta);

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={true} />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <TituloPagina
          titulo="Reportes"
          descripcion="Que se vendio, quien lo vendio y como pagaron. Cualquier tabla se baja a Excel."
        />
        <PanelReportes
          desde={desde}
          hasta={hasta}
          agrupacion={agrupacion}
          orden={orden}
          atajos={atajos}
          resumen={resumenDelRango(desde, hasta)}
          periodos={periodos}
          productos={masVendidos(desde, hasta, orden, PRENDAS_EN_PANTALLA)}
          vendedoras={porVendedora(desde, hasta)}
          formas={porFormaPago(desde, hasta)}
          modelos={loVendidoPorModelo(desde, hasta)}
          cuadre={cuadreDeDinero(desde, hasta)}
        />
      </main>
    </>
  );
}
