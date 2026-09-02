import "server-only";
import { getDb } from "./db";
import type { ModeloCaja } from "./tipos";

/**
 * Lecturas de la base. Todo lo que la caja necesita saber del catalogo,
 * de las vendedoras y de lo cobrado.
 */

/** Separador de los codigos de barras juntados por SQL: una coma podria venir dentro de un codigo hecho a mano. */
const SEPARADOR = String.fromCharCode(31);

/**
 * La bodega apunta en codigos_anteriores el codigo viejo cada vez que
 * corrige uno. La tabla es de bodega y una bodega sin actualizar no la
 * tiene; meterla al SQL sin preguntar tumbaria el catalogo completo.
 *
 * Solo se recuerda el "si existe". El "no" se vuelve a preguntar en cada
 * carga: si se recordara, actualizar la bodega no surtiria efecto en la
 * caja hasta reiniciarla, y nadie va a saber que eso hacia falta.
 */
let bodegaGuardaCodigosAnteriores = false;

function hayCodigosAnteriores(): boolean {
  if (!bodegaGuardaCodigosAnteriores) {
    const fila = getDb()
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'codigos_anteriores'")
      .get();
    if (fila) bodegaGuardaCodigosAnteriores = true;
  }
  return bodegaGuardaCodigosAnteriores;
}

type FilaModelo = {
  id: number;
  codigo: string;
  codigo_norm: string;
  prefijo: string;
  numero: number | null;
  descripcion: string;
  categoria: string;
  precio: number | null;
  en_tienda: number;
  barras: string | null;
  barras_viejas: string | null;
};

function partirBarras(juntas: string | null): string[] {
  return juntas ? juntas.split(SEPARADOR) : [];
}

/**
 * El catalogo entero, con precio y existencia de tienda.
 *
 * Son unos 130 modelos: cabe de sobra en el navegador. La pantalla de
 * cobrar se lo lleva completo de una vez y busca ahi, en vez de preguntarle
 * al servidor en cada tecla. Es lo que hace que la busqueda no tenga espera
 * y que se pueda seguir cobrando si se cae la conexion.
 */
export function catalogoParaCaja(): ModeloCaja[] {
  // Un codigo viejo solo sirve de alias mientras siga siendo inequivoco.
  // Si dos prendas lo tuvieron, o si hoy es el codigo vigente o un alias
  // manual de otra, escanearlo cobraria la prenda equivocada sin aviso,
  // porque en la busqueda el codigo de barras le gana hasta al codigo
  // exacto. Mejor no encontrar nada y que la vendedora pregunte; la bodega
  // resuelve el mismo caso igual.
  const barrasViejas = hayCodigosAnteriores()
    ? `(SELECT group_concat(ca.codigo_norm, char(31))
          FROM codigos_anteriores ca
         WHERE ca.modelo_id = m.id
           AND NOT EXISTS (SELECT 1 FROM codigos_anteriores ca2
                            WHERE ca2.codigo_norm = ca.codigo_norm
                              AND ca2.modelo_id <> ca.modelo_id)
           AND NOT EXISTS (SELECT 1 FROM modelos m2
                            WHERE m2.codigo_norm = ca.codigo_norm)
           AND NOT EXISTS (SELECT 1 FROM caja_codigos_barras cb2
                            WHERE cb2.codigo_barras = ca.codigo_norm
                              AND cb2.modelo_id <> ca.modelo_id))`
    : "NULL";

  const filas = getDb()
    .prepare(
      `SELECT m.id, m.codigo, m.codigo_norm, m.prefijo, m.numero, m.descripcion,
              m.categoria, p.precio AS precio, m.en_tienda,
              (SELECT group_concat(cb.codigo_barras, char(31))
                 FROM caja_codigos_barras cb WHERE cb.modelo_id = m.id) AS barras,
              ${barrasViejas} AS barras_viejas
         FROM modelos m
         LEFT JOIN caja_precios p ON p.modelo_id = m.id
        WHERE m.activo = 1
        ORDER BY m.prefijo, m.numero, m.codigo_norm`
    )
    .all() as FilaModelo[];

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    codigo_norm: f.codigo_norm,
    prefijo: f.prefijo,
    numero: f.numero,
    descripcion: f.descripcion,
    categoria: f.categoria,
    precio: f.precio ?? 0,
    en_tienda: f.en_tienda,
    // El Set quita repetidos: un codigo viejo puede estar tambien capturado
    // como alias manual de la misma prenda, y dos veces no aporta nada.
    barras: [...new Set([...partirBarras(f.barras), ...partirBarras(f.barras_viejas)])],
  }));
}

export type Vendedora = {
  id: number;
  nombre: string;
  puesto: string;
  rol: string;
  tiene_pin: boolean;
};

/** Las vendedoras salen de la tabla 'personal' de la bodega: es la misma gente. */
export function listarVendedoras(soloActivas = true): Vendedora[] {
  const filas = getDb()
    .prepare(
      `SELECT p.id, p.nombre, p.puesto,
              COALESCE(v.rol, 'vendedora') AS rol,
              CASE WHEN COALESCE(v.pin_hash,'') = '' THEN 0 ELSE 1 END AS tiene_pin
         FROM personal p
         LEFT JOIN caja_vendedoras v ON v.personal_id = p.id
        WHERE (? = 0 OR p.activo = 1)
          AND COALESCE(v.activa, 1) = 1
        ORDER BY p.orden, p.nombre`
    )
    .all(soloActivas ? 1 : 0) as {
    id: number;
    nombre: string;
    puesto: string;
    rol: string;
    tiene_pin: number;
  }[];

  return filas.map((f) => ({ ...f, tiene_pin: f.tiene_pin === 1 }));
}

export type VentaResumen = {
  id: string;
  folio: string;
  fecha: string;
  vendedora: string;
  piezas: number;
  total: number;
  estado: string;
  formas: string;
};

/** Lo cobrado en un dia (YYYY-MM-DD), lo mas reciente primero. */
export function ventasDelDia(dia: string): VentaResumen[] {
  return getDb()
    .prepare(
      `SELECT v.id, v.folio, v.fecha, v.vendedora, v.piezas, v.total, v.estado,
              COALESCE((SELECT group_concat(pg.forma, ', ') FROM caja_pagos pg WHERE pg.venta_id = v.id), '') AS formas
         FROM caja_ventas v
        WHERE date(v.fecha) = ?
        ORDER BY v.fecha DESC`
    )
    .all(dia) as VentaResumen[];
}

export type VentaCompleta = {
  venta: {
    id: string;
    folio: string;
    caja: string;
    fecha: string;
    vendedora: string;
    subtotal: number;
    descuento: number;
    total: number;
    piezas: number;
    estado: string;
    motivo_cancelacion: string;
    nota: string;
  };
  lineas: {
    codigo: string;
    descripcion: string;
    piezas: number;
    precio: number;
    importe: number;
  }[];
  pagos: { forma: string; monto: number; recibido: number; cambio: number }[];
};

export function obtenerVenta(id: string): VentaCompleta | null {
  const db = getDb();
  const venta = db.prepare(`SELECT * FROM caja_ventas WHERE id = ? OR folio = ?`).get(id, id) as
    | VentaCompleta["venta"]
    | undefined;
  if (!venta) return null;

  const lineas = db
    .prepare(
      `SELECT codigo, descripcion, piezas, precio, importe
         FROM caja_venta_lineas WHERE venta_id = ? ORDER BY id`
    )
    .all(venta.id) as VentaCompleta["lineas"];

  const pagos = db
    .prepare(`SELECT forma, monto, recibido, cambio FROM caja_pagos WHERE venta_id = ? ORDER BY id`)
    .all(venta.id) as VentaCompleta["pagos"];

  return { venta, lineas, pagos };
}

export type CorteDelDia = {
  dia: string;
  fondo: number;
  ventas: number;
  piezas: number;
  total: number;
  ticket_promedio: number;
  canceladas: number;
  por_forma: { forma: string; ventas: number; monto: number }[];
  retiros: number;
  efectivo_esperado: number;
};

/**
 * El corte: lo que deberia haber en el cajon al cerrar.
 *
 * Solo el efectivo cuenta para eso. Lo de tarjeta y transferencia se cobro
 * pero nunca paso por el cajon, asi que se reporta aparte.
 */
export function corteDelDia(dia: string): CorteDelDia {
  const db = getDb();

  const totales = db
    .prepare(
      `SELECT COUNT(*) AS ventas, COALESCE(SUM(piezas),0) AS piezas, COALESCE(SUM(total),0) AS total
         FROM caja_ventas WHERE date(fecha) = ? AND estado = 'cobrada'`
    )
    .get(dia) as { ventas: number; piezas: number; total: number };

  const canceladas = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM caja_ventas WHERE date(fecha) = ? AND estado = 'cancelada'`)
      .get(dia) as { n: number }
  ).n;

  const por_forma = db
    .prepare(
      `SELECT pg.forma, COUNT(*) AS ventas, COALESCE(SUM(pg.monto),0) AS monto
         FROM caja_pagos pg
         JOIN caja_ventas v ON v.id = pg.venta_id
        WHERE date(v.fecha) = ? AND v.estado = 'cobrada'
        GROUP BY pg.forma
        ORDER BY monto DESC`
    )
    .all(dia) as { forma: string; ventas: number; monto: number }[];

  const corte = db.prepare(`SELECT id, fondo FROM caja_cortes WHERE dia = ?`).get(dia) as
    | { id: number; fondo: number }
    | undefined;

  const retiros = corte
    ? (
        db.prepare(`SELECT COALESCE(SUM(monto),0) AS n FROM caja_retiros WHERE corte_id = ?`).get(corte.id) as {
          n: number;
        }
      ).n
    : 0;

  const efectivo = por_forma.find((f) => f.forma === "efectivo")?.monto ?? 0;
  const fondo = corte?.fondo ?? 0;

  return {
    dia,
    fondo,
    ventas: totales.ventas,
    piezas: totales.piezas,
    total: totales.total,
    ticket_promedio: totales.ventas > 0 ? Math.round(totales.total / totales.ventas) : 0,
    canceladas,
    por_forma,
    retiros,
    efectivo_esperado: fondo + efectivo - retiros,
  };
}

/**
 * El nombre del negocio sale en el ticket. Se lee del mismo ajuste que usa
 * el sistema de bodega, para que los dos digan lo mismo.
 */
export function nombreNegocio(): string {
  const fila = getDb().prepare("SELECT valor FROM config WHERE clave = 'negocio'").get() as
    | { valor: string }
    | undefined;
  return fila?.valor?.trim() || "Venus Boutique";
}

/** Hasta que folio va la caja. La pantalla lo usa para no repetir numero al cobrar sin conexion. */
export function ultimoFolio(caja: string): number {
  const fila = getDb().prepare("SELECT valor FROM caja_config WHERE clave = ?").get(`folio_${caja}`) as
    | { valor: string }
    | undefined;
  return parseInt(fila?.valor ?? "0", 10) || 0;
}

export type EstadoCorte = { cerrado: boolean; contado: number | null; diferencia: number | null };

/** Si el dia ya se cerro, cuanto se conto y de cuanto fue la diferencia. */
export function estadoCorte(dia: string): EstadoCorte {
  const fila = getDb()
    .prepare("SELECT estado, efectivo_contado, diferencia FROM caja_cortes WHERE dia = ?")
    .get(dia) as { estado: string; efectivo_contado: number | null; diferencia: number | null } | undefined;
  return {
    cerrado: fila?.estado === "cerrado",
    contado: fila?.efectivo_contado ?? null,
    diferencia: fila?.diferencia ?? null,
  };
}

/** El dia de hoy en la hora de la tienda, no la del servidor. */
export function hoy(): string {
  return (getDb().prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;
}
