import "server-only";
import { getDb } from "./db";

/**
 * Los numeros del negocio: que se vendio, quien lo vendio y como pagaron.
 *
 * Dos reglas que valen para TODO lo de aqui:
 *
 * 1. Solo cuentan las ventas con estado 'cobrada'. Una venta cancelada
 *    sigue guardada (nunca se borra un ticket) pero ese dinero no entro,
 *    asi que no puede aparecer en ningun total.
 *
 * 2. Lo de productos se suma sobre caja_venta_lineas usando la columna
 *    'importe', que ya trae el descuento de la venta repartido entre sus
 *    renglones (lo hace repartirDescuento al guardar). Por eso la suma de
 *    "lo mas vendido por dinero" da exactamente el mismo numero que la suma
 *    de los totales de las ventas, centavo a centavo. Si se sumara
 *    precio*piezas, los reportes de producto siempre saldrian mas altos que
 *    la caja y nadie sabria a cual de los dos hacerle caso.
 */

export type Rango = { desde: string; hasta: string };

export type FilaPeriodo = {
  /** La clave con la que se agrupo: '2026-08-19', el lunes de la semana, o '2026-08'. */
  periodo: string;
  etiqueta: string;
  ventas: number;
  piezas: number;
  total: number;
};

export type FilaProducto = { codigo: string; descripcion: string; piezas: number; monto: number };

export type FilaVendedora = {
  vendedora: string;
  ventas: number;
  piezas: number;
  monto: number;
  ticket_promedio: number;
};

export type FilaFormaPago = { forma: string; ventas: number; monto: number };

export type FilaModelo = { codigo: string; piezas: number };

export type ResumenRango = {
  ventas: number;
  piezas: number;
  total: number;
  subtotal: number;
  descuento: number;
  ticket_promedio: number;
  canceladas: number;
};

/** Como se ordena "lo mas vendido": por cuantas piezas salieron o por cuanto dinero dejaron. */
export type OrdenProducto = "piezas" | "dinero";

const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** '2026-08-19' -> 'mie 19 ago'. Se arma en UTC para que no se recorra un dia segun la zona horaria. */
function etiquetaDeDia(dia: string): string {
  const partes = dia.split("-");
  const anio = Number(partes[0] ?? 0);
  const mes = Number(partes[1] ?? 0);
  const numero = Number(partes[2] ?? 0);
  if (!anio || !mes || !numero) return dia;
  const fecha = new Date(Date.UTC(anio, mes - 1, numero));
  return `${DIAS[fecha.getUTCDay()] ?? ""} ${numero} ${MESES_CORTOS[mes - 1] ?? ""}`;
}

/** '2026-08' -> 'Agosto 2026'. */
function etiquetaDeMes(clave: string): string {
  const partes = clave.split("-");
  const mes = Number(partes[1] ?? 0);
  return `${MESES[mes - 1] ?? clave} ${partes[0] ?? ""}`;
}

/** Deja la fecha en YYYY-MM-DD o devuelve null: lo que llega por la URL no es de fiar. */
export function fechaValida(texto: string | undefined): string | null {
  const limpio = (texto ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null;
  const mes = Number(limpio.slice(5, 7));
  const dia = Number(limpio.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return limpio;
}

export type NombrePeriodo = "hoy" | "semana" | "mes" | "mes-pasado";

/**
 * Los rangos de los botones rapidos.
 *
 * Se calculan en SQLite y no en JavaScript porque el dia de la tienda es el
 * de la base ('now','localtime'), que es el mismo reloj con el que se
 * guardan las ventas. Asi, si la computadora de la tienda trae mal la
 * fecha, el reporte de "hoy" sigue siendo el hoy de las ventas.
 *
 * La semana empieza en lunes: 'weekday 0' cae en el domingo que sigue (o en
 * el mismo dia si hoy es domingo) y de ahi se retroceden 6 dias.
 */
export function rangoDePeriodo(nombre: NombrePeriodo): Rango {
  const fila = getDb()
    .prepare(
      `SELECT date('now','localtime')                             AS hoy,
              date('now','localtime','weekday 0','-6 days')       AS lunes,
              date('now','localtime','start of month')            AS mes,
              date('now','localtime','start of month','-1 month') AS mes_pasado,
              date('now','localtime','start of month','-1 day')   AS fin_mes_pasado`
    )
    .get() as { hoy: string; lunes: string; mes: string; mes_pasado: string; fin_mes_pasado: string };

  if (nombre === "hoy") return { desde: fila.hoy, hasta: fila.hoy };
  if (nombre === "semana") return { desde: fila.lunes, hasta: fila.hoy };
  if (nombre === "mes-pasado") return { desde: fila.mes_pasado, hasta: fila.fin_mes_pasado };
  return { desde: fila.mes, hasta: fila.hoy };
}

/** Los numeros grandes de arriba: lo cobrado, cuantas ventas, cuantas piezas y el ticket promedio. */
export function resumenDelRango(desde: string, hasta: string): ResumenRango {
  const db = getDb();

  const totales = db
    .prepare(
      `SELECT COUNT(*)                   AS ventas,
              COALESCE(SUM(piezas),0)    AS piezas,
              COALESCE(SUM(total),0)     AS total,
              COALESCE(SUM(subtotal),0)  AS subtotal,
              COALESCE(SUM(descuento),0) AS descuento
         FROM caja_ventas
        WHERE date(fecha) BETWEEN ? AND ? AND estado = 'cobrada'`
    )
    .get(desde, hasta) as Omit<ResumenRango, "ticket_promedio" | "canceladas">;

  const canceladas = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM caja_ventas
          WHERE date(fecha) BETWEEN ? AND ? AND estado = 'cancelada'`
      )
      .get(desde, hasta) as { n: number }
  ).n;

  return {
    ...totales,
    canceladas,
    ticket_promedio: totales.ventas > 0 ? Math.round(totales.total / totales.ventas) : 0,
  };
}

type FilaAgrupada = { periodo: string; ventas: number; piezas: number; total: number };

function agrupar(expresion: string, desde: string, hasta: string): FilaAgrupada[] {
  return getDb()
    .prepare(
      `SELECT ${expresion}            AS periodo,
              COUNT(*)                AS ventas,
              COALESCE(SUM(piezas),0) AS piezas,
              COALESCE(SUM(total),0)  AS total
         FROM caja_ventas
        WHERE date(fecha) BETWEEN ? AND ? AND estado = 'cobrada'
        GROUP BY periodo
        ORDER BY periodo DESC`
    )
    .all(desde, hasta) as FilaAgrupada[];
}

export function ventasPorDia(desde: string, hasta: string): FilaPeriodo[] {
  return agrupar("date(fecha)", desde, hasta).map((f) => ({ ...f, etiqueta: etiquetaDeDia(f.periodo) }));
}

export function ventasPorSemana(desde: string, hasta: string): FilaPeriodo[] {
  return agrupar("date(fecha,'weekday 0','-6 days')", desde, hasta).map((f) => ({
    ...f,
    etiqueta: `Semana del ${etiquetaDeDia(f.periodo)}`,
  }));
}

export function ventasPorMes(desde: string, hasta: string): FilaPeriodo[] {
  return agrupar("strftime('%Y-%m', fecha)", desde, hasta).map((f) => ({
    ...f,
    etiqueta: etiquetaDeMes(f.periodo),
  }));
}

/**
 * Lo mas vendido, por piezas o por dinero.
 *
 * Se agrupa por el codigo que quedo escrito en la linea y no por modelo_id:
 * si algun dia se borra un modelo del catalogo su modelo_id queda en NULL, y
 * todas esas ventas viejas se juntarian en un solo renglon sin nombre. El
 * codigo es unico en el catalogo y ademas es lo que la bodega busca en el rack.
 */
export function masVendidos(
  desde: string,
  hasta: string,
  orden: OrdenProducto = "piezas",
  limite = 0
): FilaProducto[] {
  // El ORDER BY no se puede mandar como parametro, asi que se escoge entre
  // dos textos fijos: a la consulta no entra nada que venga de la URL.
  const porDonde = orden === "dinero" ? "monto DESC, piezas DESC" : "piezas DESC, monto DESC";
  const tope = limite > 0 ? `LIMIT ${Math.floor(limite)}` : "";

  return getDb()
    .prepare(
      `SELECT l.codigo                   AS codigo,
              MAX(l.descripcion)         AS descripcion,
              COALESCE(SUM(l.piezas),0)  AS piezas,
              COALESCE(SUM(l.importe),0) AS monto
         FROM caja_venta_lineas l
         JOIN caja_ventas v ON v.id = l.venta_id
        WHERE date(v.fecha) BETWEEN ? AND ? AND v.estado = 'cobrada'
        GROUP BY l.codigo
        ORDER BY ${porDonde}, l.codigo
        ${tope}`
    )
    .all(desde, hasta) as FilaProducto[];
}

/** Cuanto vendio cada quien. El ticket promedio es lo que dice si vende mucho o vende caro. */
export function porVendedora(desde: string, hasta: string): FilaVendedora[] {
  const filas = getDb()
    .prepare(
      `SELECT vendedora               AS vendedora,
              COUNT(*)                AS ventas,
              COALESCE(SUM(piezas),0) AS piezas,
              COALESCE(SUM(total),0)  AS monto
         FROM caja_ventas
        WHERE date(fecha) BETWEEN ? AND ? AND estado = 'cobrada'
        GROUP BY vendedora
        ORDER BY monto DESC`
    )
    .all(desde, hasta) as Omit<FilaVendedora, "ticket_promedio">[];

  return filas.map((f) => ({
    ...f,
    vendedora: f.vendedora || "Sin vendedora",
    ticket_promedio: f.ventas > 0 ? Math.round(f.monto / f.ventas) : 0,
  }));
}

/** Como pagaron. Dice cuanto se fue por la terminal y cuanto de verdad paso por el cajon. */
export function porFormaPago(desde: string, hasta: string): FilaFormaPago[] {
  return getDb()
    .prepare(
      `SELECT p.forma                  AS forma,
              COUNT(*)                 AS ventas,
              COALESCE(SUM(p.monto),0) AS monto
         FROM caja_pagos p
         JOIN caja_ventas v ON v.id = p.venta_id
        WHERE date(v.fecha) BETWEEN ? AND ? AND v.estado = 'cobrada'
        GROUP BY p.forma
        ORDER BY monto DESC`
    )
    .all(desde, hasta) as FilaFormaPago[];
}

/**
 * El papel que se lleva a la bodega para cuadrar el inventario: nada mas
 * codigo y piezas. Sin precios, porque quien esta contando prendas en el
 * rack no necesita saber cuanto costaron.
 */
export function loVendidoPorModelo(desde: string, hasta: string): FilaModelo[] {
  return getDb()
    .prepare(
      `SELECT l.codigo                  AS codigo,
              COALESCE(SUM(l.piezas),0) AS piezas
         FROM caja_venta_lineas l
         JOIN caja_ventas v ON v.id = l.venta_id
        WHERE date(v.fecha) BETWEEN ? AND ? AND v.estado = 'cobrada'
        GROUP BY l.codigo
        ORDER BY piezas DESC, l.codigo`
    )
    .all(desde, hasta) as FilaModelo[];
}

export type Cuadre = { ventas: number; productos: number; diferencia: number; cuadra: boolean };

/**
 * La prueba de que los dos lados dan lo mismo.
 *
 * Por un lado suma los totales de las ventas; por el otro, los importes de
 * sus renglones. Tienen que dar identico. Si no dieran, seria que un
 * descuento se guardo mal y los reportes de producto estarian mintiendo.
 * Se muestra en la pantalla porque el duenio tiene derecho a VER que sus
 * numeros cuadran, no a que se lo prometamos.
 */
export function cuadreDeDinero(desde: string, hasta: string): Cuadre {
  const fila = getDb()
    .prepare(
      `SELECT (SELECT COALESCE(SUM(total),0) FROM caja_ventas
                WHERE date(fecha) BETWEEN ? AND ? AND estado = 'cobrada')     AS ventas,
              (SELECT COALESCE(SUM(l.importe),0) FROM caja_venta_lineas l
                 JOIN caja_ventas v ON v.id = l.venta_id
                WHERE date(v.fecha) BETWEEN ? AND ? AND v.estado = 'cobrada') AS productos`
    )
    .get(desde, hasta, desde, hasta) as { ventas: number; productos: number };

  const diferencia = fila.ventas - fila.productos;
  return { ...fila, diferencia, cuadra: diferencia === 0 };
}
