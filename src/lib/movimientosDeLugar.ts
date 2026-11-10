import "server-only";
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { EL_LUGAR, type Lugar } from "./lugar";
import type { Resultado } from "./tipos";

/**
 * Lo que entra y sale de la tienda o del tianguis, registrado desde la caja.
 *
 * Son los mismos movimientos que registra el sistema de bodega en Salidas y
 * en el Cierre del tianguis, escritos igual: mismos tipos, mismo historial y
 * misma hoja con folio (TIE-0001 la tienda, TIA-0001 el tianguis), del mismo
 * contador. Por eso aqui se escribe en tablas de la bodega (modelos,
 * movimientos, remisiones y su contador de folios en config): es justo lo
 * que la bodega espera ver, como si se hubiera capturado alla.
 *
 * Cada caja mueve lo de su lugar: la de la tienda, la tienda; la del
 * tianguis, el tianguis. Lo decide la cuenta con la que se entro.
 *
 * Una diferencia a proposito con la bodega: al recibir, la bodega puede
 * quedar en negativo. Mientras no se haga el primer conteo casi todo dice
 * cero en bodega, y no se puede detener a nadie por eso: el movimiento
 * queda anotado y el conteo lo cuadra.
 */

class ErrorDeMovimiento extends Error {}

export type LineaMovimiento = { modelo_id: number; piezas: number };

/**
 * Lo que cambia entre la tienda y el tianguis: su cuenta de piezas, sus
 * tipos de movimiento y su hoja. Son los mismos nombres que usa la bodega
 * (EFECTOS en su lugares.ts y siguienteFolio en su inventario.ts).
 */
const DE_LUGAR: Record<
  Lugar,
  {
    columna: "en_tienda" | "en_tianguis";
    salida: string;
    retorno: string;
    destino: string;
    contador: string;
    prefijo: string;
  }
> = {
  tienda: {
    columna: "en_tienda",
    salida: "salida_tienda",
    retorno: "retorno_tienda",
    destino: "TIENDA",
    contador: "folio_tienda",
    prefijo: "TIE",
  },
  tianguis: {
    columna: "en_tianguis",
    salida: "salida_tianguis",
    retorno: "retorno_tianguis",
    destino: "TIANGUIS",
    contador: "folio_tianguis",
    prefijo: "TIA",
  },
};

type Modelo = { id: number; codigo: string; existencia: number; piezas: number };

function modelo(db: Database.Database, lugar: Lugar, id: number): Modelo {
  const m = db
    .prepare(`SELECT id, codigo, existencia, ${DE_LUGAR[lugar].columna} AS piezas FROM modelos WHERE id = ?`)
    .get(id) as Modelo | undefined;
  if (!m) throw new ErrorDeMovimiento("Una de las prendas ya no esta en el catalogo. Recarga la pantalla.");
  return m;
}

/**
 * El siguiente folio de hoja: TIE-0007 o TIA-0007. Es el mismo contador que
 * usa la bodega, asi que los folios no se repiten capture quien capture.
 */
function siguienteFolio(db: Database.Database, lugar: Lugar): string {
  const { contador, prefijo } = DE_LUGAR[lugar];
  const fila = db.prepare("SELECT valor FROM config WHERE clave = ?").get(contador) as { valor: string } | undefined;
  const siguiente = (fila ? parseInt(fila.valor, 10) || 0 : 0) + 1;
  db.prepare(
    "INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
  ).run(contador, String(siguiente));
  return `${prefijo}-${String(siguiente).padStart(4, "0")}`;
}

/**
 * Pasa piezas de la bodega al lugar (salida_tienda o salida_tianguis).
 * 'existencia_antes' y 'despues' son las de bodega, como las anota la
 * bodega para estos tipos. La bodega puede quedar en negativo (ver arriba).
 */
export function pasarDeBodega(
  db: Database.Database,
  lugar: Lugar,
  datos: { modeloId: number; piezas: number; persona: string; nota: string; remisionId?: number | null; fecha?: string | null }
): void {
  const { columna, salida } = DE_LUGAR[lugar];
  const m = modelo(db, lugar, datos.modeloId);
  db.prepare(
    `UPDATE modelos SET existencia = existencia - ?, ${columna} = ${columna} + ?,
            actualizado_en = datetime('now','localtime') WHERE id = ?`
  ).run(datos.piezas, datos.piezas, m.id);
  db.prepare(
    `INSERT INTO movimientos
       (modelo_id, tipo, cantidad, existencia_antes, existencia_despues, remision_id, persona, nota, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`
  ).run(
    m.id,
    salida,
    datos.piezas,
    m.existencia,
    m.existencia - datos.piezas,
    datos.remisionId ?? null,
    datos.persona,
    datos.nota,
    datos.fecha ?? null
  );
}

/**
 * Regresa piezas del lugar a la bodega (retorno_tienda o retorno_tianguis).
 * Aqui si se revisa que alcance: no se puede regresar lo que el lugar no
 * tiene, porque lo dejaria debiendo piezas que nadie vio.
 */
function pasarABodega(
  db: Database.Database,
  lugar: Lugar,
  datos: { modeloId: number; piezas: number; persona: string; nota: string; remisionId: number }
): void {
  const { columna, retorno } = DE_LUGAR[lugar];
  const m = modelo(db, lugar, datos.modeloId);
  if (m.piezas < datos.piezas) {
    throw new ErrorDeMovimiento(
      `De ${m.codigo} hay ${m.piezas} ${m.piezas === 1 ? "pieza" : "piezas"} en ${EL_LUGAR[lugar]}: no se pueden regresar ${datos.piezas}.`
    );
  }
  db.prepare(
    `UPDATE modelos SET existencia = existencia + ?, ${columna} = ${columna} - ?,
            actualizado_en = datetime('now','localtime') WHERE id = ?`
  ).run(datos.piezas, datos.piezas, m.id);
  db.prepare(
    `INSERT INTO movimientos
       (modelo_id, tipo, cantidad, existencia_antes, existencia_despues, remision_id, persona, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(m.id, retorno, datos.piezas, m.existencia, m.existencia + datos.piezas, datos.remisionId, datos.persona, datos.nota);
}

/** Junta renglones del mismo modelo y descarta los que no traen piezas. */
function limpiar(lineas: LineaMovimiento[]): LineaMovimiento[] {
  const porModelo = new Map<number, number>();
  for (const l of lineas ?? []) {
    if (!Number.isInteger(l.modelo_id) || l.modelo_id <= 0) continue;
    if (!Number.isInteger(l.piezas) || l.piezas < 0) {
      throw new ErrorDeMovimiento("Las piezas tienen que ser numeros enteros.");
    }
    if (l.piezas > 0) porModelo.set(l.modelo_id, (porModelo.get(l.modelo_id) ?? 0) + l.piezas);
  }
  return [...porModelo.entries()].map(([modelo_id, piezas]) => ({ modelo_id, piezas }));
}

function nuevaHoja(
  db: Database.Database,
  lugar: Lugar,
  tipo: "envio" | "retorno",
  persona: string,
  nota: string,
  total: number
) {
  const folio = siguienteFolio(db, lugar);
  const info = db
    .prepare(
      `INSERT INTO remisiones (folio, destino, tipo, persona, nota, estado, total_piezas, cerrada_en)
       VALUES (?, ?, ?, ?, ?, 'cerrada', ?, datetime('now','localtime'))`
    )
    .run(folio, DE_LUGAR[lugar].destino, tipo, persona, nota, total);
  return { folio, remisionId: Number(info.lastInsertRowid) };
}

export type HojaRegistrada = { folio: string; piezas: number; avisos: string[] };

/**
 * Llego mercancia de la bodega: una hoja de envio con todos los modelos. Si
 * la bodega no las tenia registradas se recibe igual y se avisa.
 */
export function recibirDeBodega(
  lugar: Lugar,
  lineas: LineaMovimiento[],
  persona: string,
  nota = ""
): Resultado<HojaRegistrada> {
  const db = getDb();
  const textoNota = nota.trim() || `Recibido en ${EL_LUGAR[lugar]}`;
  try {
    return db.transaction((): Resultado<HojaRegistrada> => {
      const limpias = limpiar(lineas);
      if (!limpias.length) throw new ErrorDeMovimiento("Agrega al menos una prenda con sus piezas.");
      const total = limpias.reduce((s, l) => s + l.piezas, 0);
      const { folio, remisionId } = nuevaHoja(db, lugar, "envio", persona, textoNota, total);

      const avisos: string[] = [];
      for (const l of limpias) {
        const m = modelo(db, lugar, l.modelo_id);
        if (m.existencia < l.piezas) {
          avisos.push(`${m.codigo}: la bodega tenia ${m.existencia} registradas; quedo en ${m.existencia - l.piezas} hasta el conteo.`);
        }
        pasarDeBodega(db, lugar, { modeloId: l.modelo_id, piezas: l.piezas, persona, nota: textoNota, remisionId });
      }
      return { ok: true, datos: { folio, piezas: total, avisos }, mensaje: `Se registro la hoja ${folio}.` };
    }).immediate();
  } catch (e) {
    if (e instanceof ErrorDeMovimiento) return { ok: false, error: e.message };
    console.error("No se pudo registrar lo recibido:", e);
    return { ok: false, error: "No se pudo registrar. Vuelve a intentar." };
  }
}

/** Se regresan prendas a la bodega, con su hoja de retorno. */
export function regresarABodega(
  lugar: Lugar,
  lineas: LineaMovimiento[],
  persona: string,
  nota = lugar === "tianguis" ? "Regreso del tianguis" : "Regreso de la tienda"
): Resultado<HojaRegistrada> {
  const db = getDb();
  try {
    return db.transaction((): Resultado<HojaRegistrada> => {
      const limpias = limpiar(lineas);
      if (!limpias.length) throw new ErrorDeMovimiento("Agrega al menos una prenda con sus piezas.");
      const total = limpias.reduce((s, l) => s + l.piezas, 0);
      const { folio, remisionId } = nuevaHoja(db, lugar, "retorno", persona, nota, total);
      for (const l of limpias) {
        pasarABodega(db, lugar, { modeloId: l.modelo_id, piezas: l.piezas, persona, nota, remisionId });
      }
      return { ok: true, datos: { folio, piezas: total, avisos: [] }, mensaje: `Se registro la hoja ${folio}.` };
    }).immediate();
  } catch (e) {
    if (e instanceof ErrorDeMovimiento) return { ok: false, error: e.message };
    console.error("No se pudo registrar el regreso:", e);
    return { ok: false, error: "No se pudo registrar. Vuelve a intentar." };
  }
}

/**
 * Cierre del dia del tianguis: todo lo que quedo regresa a la bodega, en una
 * sola hoja. Es solo del tianguis: la tienda no levanta todo cada noche. Se
 * lee lo que hay al momento de cerrar, no lo que mostraba la pantalla: si
 * se vendio algo mientras tanto, no se regresa de mas.
 */
export function cerrarElDia(persona: string): Resultado<HojaRegistrada> {
  const quedan = getDb()
    .prepare("SELECT id AS modelo_id, en_tianguis AS piezas FROM modelos WHERE en_tianguis > 0")
    .all() as LineaMovimiento[];
  if (!quedan.length) return { ok: false, error: "No quedo nada en el tianguis: no hay que regresar." };
  return regresarABodega("tianguis", quedan, persona, "Cierre del tianguis");
}

export type PrendaDelLugar = {
  id: number;
  codigo: string;
  codigo_norm: string;
  numero: number | null;
  descripcion: string;
  categoria: string;
  tallas: string;
  /** Piezas en el lugar (la tienda o el tianguis). */
  piezas: number;
  existencia: number;
  /** Precio registrado en centavos, o null si no tiene. */
  precio: number | null;
};

/**
 * Lo que hay en el lugar ahorita. En el tianguis es la misma lista que
 * "Tianguis > Inventario" en el sistema de bodega (activos y con piezas, en
 * el mismo orden), con lo que hace falta para verla, regresarla y cerrar el
 * dia. En la tienda, lo mismo con las piezas de la tienda.
 */
export function inventarioDelLugar(lugar: Lugar): PrendaDelLugar[] {
  const columna = DE_LUGAR[lugar].columna;
  return getDb()
    .prepare(
      `SELECT m.id, m.codigo, m.codigo_norm, m.numero, m.descripcion, m.categoria, m.tallas,
              m.${columna} AS piezas, m.existencia,
              CASE WHEN p.precio > 0 THEN p.precio END AS precio
         FROM modelos m
         LEFT JOIN caja_precios p ON p.modelo_id = m.id
        WHERE m.activo = 1 AND m.${columna} > 0
        ORDER BY m.prefijo, m.numero, m.codigo_norm`
    )
    .all() as PrendaDelLugar[];
}

/** Las piezas de bodega de cada modelo, para que al recibir se vea cuantas hay alla. */
export function piezasEnBodega(): Record<number, number> {
  const filas = getDb().prepare("SELECT id, existencia FROM modelos WHERE activo = 1").all() as {
    id: number;
    existencia: number;
  }[];
  return Object.fromEntries(filas.map((f) => [f.id, f.existencia]));
}
