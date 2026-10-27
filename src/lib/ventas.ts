import "server-only";
import type Database from "better-sqlite3";
import { getDb, leerAjuste, nombreCaja } from "./db";
import { repartirDescuento } from "./dinero";
import type { Resultado, VentaParaGuardar } from "./tipos";
import { FORMAS_PAGO } from "./tipos";

/**
 * Guardar la venta.
 *
 * Todo lo que sigue pasa dentro de UNA sola transaccion: o queda la venta
 * completa con su inventario descontado, o no queda nada. Nunca a medias,
 * porque una venta guardada sin sus piezas descontadas descuadra el
 * inventario en silencio y nadie se entera hasta el conteo.
 */

class ErrorDeVenta extends Error {}

/**
 * Deja la fecha del dispositivo en el formato que usa la base, o null si
 * viene rara.
 *
 * Acepta con y sin segundos, con T o con espacio, y con milesimas o zona
 * pegadas al final (que es lo que da toISOString()). Ser estricto de mas
 * aqui hacia lo contrario de lo que se buscaba: la venta cobrada ayer sin
 * internet se guardaba con la fecha de hoy y caia en el corte equivocado.
 */
function fechaValida(entrada: string): string | null {
  const m = (entrada ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
}

/**
 * El folio del ticket: C1-000123.
 *
 * El contador vive en la base y se lee y escribe dentro de la misma
 * transaccion de la venta, para que dos ventas al mismo tiempo no saquen el
 * mismo numero. La letra de la caja va adelante por si algun dia hay una
 * segunda caja: sus folios no chocan con los de esta.
 */
function siguienteFolio(db: Database.Database, caja: string): string {
  const clave = `folio_${caja}`;
  const fila = db.prepare("SELECT valor FROM caja_config WHERE clave = ?").get(clave) as
    | { valor: string }
    | undefined;
  const siguiente = (parseInt(fila?.valor ?? "0", 10) || 0) + 1;
  db.prepare(
    `INSERT INTO caja_config (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, String(siguiente));
  return `${caja}-${String(siguiente).padStart(6, "0")}`;
}

/**
 * El folio que va a llevar el ticket.
 *
 * La pantalla de cobrar lo propone ella misma para poder imprimir en el
 * momento, incluso sin internet, y que la clienta se vaya con su papel. Si
 * cuando la venta llega al servidor ese numero ya estaba ocupado (paso algo
 * raro, como reinstalar el navegador), se le da el siguiente libre y la
 * pantalla avisa cual quedo.
 */
function asignarFolio(db: Database.Database, caja: string, propuesto?: string): string {
  const limpio = (propuesto ?? "").trim().toUpperCase();
  const m = limpio.match(/^([A-Z0-9]{1,6})-(\d{1,8})$/);
  if (!m) return siguienteFolio(db, caja);

  const ocupado = db.prepare("SELECT 1 FROM caja_ventas WHERE folio = ?").get(limpio);
  if (ocupado) return siguienteFolio(db, caja);

  // El contador de la base se adelanta hasta el folio que llego, para que el
  // siguiente que se genere aqui no repita uno que ya se imprimio.
  const clave = `folio_${caja}`;
  const fila = db.prepare("SELECT valor FROM caja_config WHERE clave = ?").get(clave) as
    | { valor: string }
    | undefined;
  const actual = parseInt(fila?.valor ?? "0", 10) || 0;
  const numero = parseInt(m[2] ?? "0", 10) || 0;
  if (numero > actual) {
    db.prepare(
      `INSERT INTO caja_config (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    ).run(clave, String(numero));
  }
  return limpio;
}

/** El corte del dia se abre solo, con la primera venta. Nadie tiene que acordarse de abrirlo. */
function corteDelDia(db: Database.Database, caja: string, dia: string, quien: string): number {
  const existente = db.prepare("SELECT id FROM caja_cortes WHERE caja = ? AND dia = ?").get(caja, dia) as
    | { id: number }
    | undefined;
  if (existente) return existente.id;

  // El fondo con el que se abre es el mismo de siempre, guardado en Ajustes:
  // asi nadie tiene que capturarlo cada manana.
  const fondo = parseInt(leerAjuste("fondo_inicial", "0"), 10) || 0;
  const info = db
    .prepare(`INSERT INTO caja_cortes (caja, dia, fondo, abierto_por) VALUES (?, ?, ?, ?)`)
    .run(caja, dia, fondo, quien);
  return Number(info.lastInsertRowid);
}

export type VentaGuardada = {
  id: string;
  folio: string;
  total: number;
  cambio: number;
  avisos: string[];
};

export function registrarVenta(venta: VentaParaGuardar): Resultado<VentaGuardada> {
  const db = getDb();
  const caja = nombreCaja();

  try {
    return db.transaction((): Resultado<VentaGuardada> => {
      // Idempotencia: la caja manda la venta con un id que genero ella. Si la
      // tienda estaba sin internet y el reintento llega tres veces, las tres
      // traen el mismo id y solo se guarda la primera.
      const yaEsta = db.prepare("SELECT id, folio, total FROM caja_ventas WHERE id = ?").get(venta.id) as
        | { id: string; folio: string; total: number }
        | undefined;
      if (yaEsta) {
        return {
          ok: true,
          mensaje: "Esta venta ya estaba guardada.",
          datos: { id: yaEsta.id, folio: yaEsta.folio, total: yaEsta.total, cambio: 0, avisos: [] },
        };
      }

      if (!venta.lineas.length) throw new ErrorDeVenta("La venta esta vacia: agrega al menos una prenda.");
      if (!FORMAS_PAGO.includes(venta.forma_pago)) throw new ErrorDeVenta("Falta decir como se pago.");

      const vendedora = venta.vendedora_id
        ? (db.prepare("SELECT id, nombre FROM personal WHERE id = ?").get(venta.vendedora_id) as
            | { id: number; nombre: string }
            | undefined)
        : undefined;
      if (!vendedora) throw new ErrorDeVenta("Falta decir quien hizo la venta.");

      // --- Cuentas -------------------------------------------------------
      // Las piezas tienen que ser enteras y positivas. Sin esta revision, un
      // renglon con piezas negativas SUBE las existencias de la tienda: seria
      // una devolucion sin cancelacion y sin rastro, y el total de la venta
      // podria seguir saliendo positivo, asi que nadie lo notaria.
      for (const linea of venta.lineas) {
        if (!Number.isInteger(linea.piezas) || linea.piezas < 1) {
          throw new ErrorDeVenta(`Las piezas de ${linea.codigo || "la prenda"} deben ser un numero entero de 1 en adelante.`);
        }
        if (!Number.isInteger(linea.precio) || linea.precio < 0) {
          throw new ErrorDeVenta(`El precio de ${linea.codigo || "la prenda"} no es valido.`);
        }
      }

      const importes = venta.lineas.map((l) => l.precio * l.piezas);
      const subtotal = importes.reduce((a, b) => a + b, 0);
      if (subtotal <= 0) throw new ErrorDeVenta("La venta no tiene importe: revisa los precios.");

      let descuento = 0;
      if (venta.descuento_tipo === "porcentaje") {
        const porciento = Math.max(0, Math.min(100, venta.descuento_valor));
        descuento = Math.round((subtotal * porciento) / 100);
      } else if (venta.descuento_tipo === "pesos") {
        descuento = Math.max(0, Math.min(subtotal, venta.descuento_valor));
      }
      const total = subtotal - descuento;
      const piezas = venta.lineas.reduce((a, l) => a + l.piezas, 0);

      // Se redondea a centavos enteros: lo que llega del navegador puede traer
      // decimales de una division y el cajon no maneja fracciones de centavo.
      const recibido =
        venta.forma_pago === "efectivo" ? Math.round(Number(venta.recibido) || 0) : total;
      if (venta.forma_pago === "efectivo" && recibido < total) {
        throw new ErrorDeVenta("No alcanza: lo que recibiste es menos que el total.");
      }
      const cambio = venta.forma_pago === "efectivo" ? recibido - total : 0;

      // --- Cabecera ------------------------------------------------------
      const fecha = fechaValida(venta.fecha_local);
      const hoy = (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;
      const dia = fecha ? fecha.slice(0, 10) : hoy;
      const folio = asignarFolio(db, caja, venta.folio);
      const corteId = corteDelDia(db, caja, dia, vendedora.nombre);

      db.prepare(
        `INSERT INTO caja_ventas
           (id, folio, caja, fecha, vendedora_id, vendedora, subtotal, descuento,
            descuento_tipo, descuento_valor, total, piezas, estado, corte_id, nota)
         VALUES (@id, @folio, @caja, COALESCE(@fecha, datetime('now','localtime')), @vendedora_id, @vendedora,
                 @subtotal, @descuento, @descuento_tipo, @descuento_valor, @total, @piezas,
                 'cobrada', @corte_id, @nota)`
      ).run({
        id: venta.id,
        folio,
        caja,
        fecha,
        vendedora_id: vendedora.id,
        vendedora: vendedora.nombre,
        subtotal,
        descuento,
        descuento_tipo: venta.descuento_tipo,
        descuento_valor: venta.descuento_valor,
        total,
        piezas,
        corte_id: corteId,
        nota: venta.nota ?? "",
      });

      // El descuento se reparte entre las lineas para que los reportes de "lo
      // mas vendido por dinero" sumen exactamente lo que se cobro.
      const descuentos = repartirDescuento(importes, descuento);

      const insertarLinea = db.prepare(
        `INSERT INTO caja_venta_lineas
           (venta_id, modelo_id, codigo, descripcion, piezas, precio, importe, sin_respaldo, precio_lista)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const bajarTienda = db.prepare(
        `UPDATE modelos SET en_tienda = en_tienda - ?, actualizado_en = datetime('now','localtime') WHERE id = ?`
      );
      const insertarMovimiento = db.prepare(
        `INSERT INTO movimientos
           (modelo_id, tipo, cantidad, existencia_antes, existencia_despues, persona, nota, fecha)
         VALUES (?, 'venta', ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`
      );

      const bloquear = leerAjuste("bloquear_sin_existencia", "0") === "1";
      const avisos: string[] = [];

      for (let i = 0; i < venta.lineas.length; i++) {
        const linea = venta.lineas[i]!;
        const modelo = db
          .prepare("SELECT id, codigo, descripcion, existencia, en_tienda FROM modelos WHERE id = ?")
          .get(linea.modelo_id) as
          | { id: number; codigo: string; descripcion: string; existencia: number; en_tienda: number }
          | undefined;
        if (!modelo) throw new ErrorDeVenta(`Ya no existe el modelo ${linea.codigo} en el catalogo.`);

        const faltan = linea.piezas - modelo.en_tienda;
        if (faltan > 0) {
          // Hoy la bodega todavia no registra los envios a la tienda, asi que
          // casi todo esta en cero. Detener la venta por eso seria perderla:
          // se cobra igual, la linea queda marcada y el corte lo reporta.
          // Cuando el inventario sea confiable se enciende el candado en Ajustes.
          if (bloquear) {
            throw new ErrorDeVenta(
              `No alcanza: de ${modelo.codigo} quedan ${modelo.en_tienda} ` +
                `${modelo.en_tienda === 1 ? "pieza" : "piezas"} en la tienda.`
            );
          }
          avisos.push(
            `${modelo.codigo}: se vendieron ${linea.piezas} y en el sistema habia ${modelo.en_tienda}.`
          );
        }

        insertarLinea.run(
          venta.id,
          modelo.id,
          modelo.codigo,
          modelo.descripcion,
          linea.piezas,
          linea.precio,
          linea.precio * linea.piezas - (descuentos[i] ?? 0),
          faltan > 0 ? 1 : 0,
          // Es el precio que la vendedora tenia en pantalla, no el de la base
          // al subir: una venta sin internet se sube despues, y para entonces
          // el precio registrado pudo haber cambiado. Solo informa; si viene
          // raro se guarda como que no se sabe.
          Number.isInteger(linea.precio_lista) && (linea.precio_lista ?? -1) >= 0 ? linea.precio_lista : null
        );

        // Solo baja lo que hay en la tienda. La existencia de bodega no se
        // toca: esa pieza salio del rack cuando se hizo el envio, sumarla o
        // restarla aqui la reviviria o la desapareceria del rack.
        bajarTienda.run(linea.piezas, modelo.id);

        // El rastro que ve la bodega. 'existencia_antes' y 'despues' son las
        // de bodega, que no cambiaron: van iguales a proposito.
        insertarMovimiento.run(
          modelo.id,
          linea.piezas,
          modelo.existencia,
          modelo.existencia,
          vendedora.nombre,
          `Venta ${folio}`,
          fecha
        );
      }

      db.prepare(`INSERT INTO caja_pagos (venta_id, forma, monto, recibido, cambio) VALUES (?, ?, ?, ?, ?)`).run(
        venta.id,
        venta.forma_pago,
        total,
        recibido,
        cambio
      );

      return { ok: true, datos: { id: venta.id, folio, total, cambio, avisos } };
    }).immediate();
  } catch (e) {
    if (e instanceof ErrorDeVenta) return { ok: false, error: e.message };
    console.error("No se pudo guardar la venta:", e);
    return { ok: false, error: "No se pudo guardar la venta. Vuelve a intentar." };
  }
}

/**
 * Cancelar una venta.
 *
 * No se borra nunca: queda marcada, con motivo y con quien la cancelo. Un
 * ticket que desaparece es un hueco en el corte que despues nadie puede
 * explicar. Las piezas regresan a la tienda y queda su rastro en la bodega.
 */
export function cancelarVenta(id: string, motivo: string, quien: string): Resultado {
  const db = getDb();

  if (!motivo.trim()) return { ok: false, error: "Escribe por que se cancela." };

  try {
    return db.transaction((): Resultado => {
      const venta = db.prepare("SELECT id, folio, estado FROM caja_ventas WHERE id = ? OR folio = ?").get(id, id) as
        | { id: string; folio: string; estado: string }
        | undefined;
      if (!venta) throw new ErrorDeVenta("No se encontro esa venta.");
      if (venta.estado === "cancelada") throw new ErrorDeVenta("Esa venta ya estaba cancelada.");

      const lineas = db
        .prepare("SELECT modelo_id, piezas FROM caja_venta_lineas WHERE venta_id = ?")
        .all(venta.id) as { modelo_id: number | null; piezas: number }[];

      const regresar = db.prepare(
        `UPDATE modelos SET en_tienda = en_tienda + ?, actualizado_en = datetime('now','localtime') WHERE id = ?`
      );
      const rastro = db.prepare(
        `INSERT INTO movimientos (modelo_id, tipo, cantidad, existencia_antes, existencia_despues, persona, nota)
         VALUES (?, 'cancelacion', ?, ?, ?, ?, ?)`
      );

      for (const linea of lineas) {
        if (!linea.modelo_id) continue;
        const modelo = db.prepare("SELECT existencia FROM modelos WHERE id = ?").get(linea.modelo_id) as
          | { existencia: number }
          | undefined;
        if (!modelo) continue;
        regresar.run(linea.piezas, linea.modelo_id);
        rastro.run(
          linea.modelo_id,
          linea.piezas,
          modelo.existencia,
          modelo.existencia,
          quien,
          `Cancelacion ${venta.folio}: ${motivo.trim()}`
        );
      }

      db.prepare(
        `UPDATE caja_ventas
            SET estado = 'cancelada', motivo_cancelacion = ?, cancelada_por = ?,
                cancelada_en = datetime('now','localtime')
          WHERE id = ?`
      ).run(motivo.trim(), quien, venta.id);

      return { ok: true, mensaje: `Se cancelo el ticket ${venta.folio}.` };
    }).immediate();
  } catch (e) {
    if (e instanceof ErrorDeVenta) return { ok: false, error: e.message };
    console.error("No se pudo cancelar la venta:", e);
    return { ok: false, error: "No se pudo cancelar la venta." };
  }
}
