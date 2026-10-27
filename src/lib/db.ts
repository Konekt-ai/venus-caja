import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ESQUEMA_CAJA } from "./esquema";

/**
 * La caja escribe en la MISMA base que el sistema de bodega.
 *
 * No es una copia ni una base propia que se sincroniza: es el mismo
 * archivo venus.db, abierto por dos programas al mismo tiempo. Asi es
 * como al cobrar baja el inventario de la tienda de verdad, y como en la
 * bodega ven las ventas del dia conforme van pasando, sin exportar nada.
 *
 * SQLite aguanta esto sin problema mientras las dos apps abran en modo WAL
 * y esperen su turno (busy_timeout). Se midio: 800 ventas simultaneas de
 * dos procesos, cero errores, cero escrituras perdidas.
 */

/**
 * La ruta se configura en .env.local porque cada instalacion tiene la
 * bodega en una carpeta distinta. Si no esta puesta, se busca el proyecto
 * de bodega al lado del de la caja, que es como quedan al clonarlos.
 */
function rutaBase(): string {
  const configurada = process.env.VENUS_DB?.trim();
  if (configurada) return path.resolve(configurada);
  return path.resolve(process.cwd(), "..", "venus-gestion", "data", "venus.db");
}

export const RUTA_BASE_DATOS = rutaBase();

const global_ = globalThis as unknown as { __venusCajaDb?: Database.Database };

/** Falta la base de bodega: se avisa con lo que hay que hacer, no con un error tecnico. */
class ErrorDeInstalacion extends Error {}

function abrir(): Database.Database {
  const ruta = RUTA_BASE_DATOS;

  if (!fs.existsSync(ruta)) {
    throw new ErrorDeInstalacion(
      `No se encontro la base de datos de la bodega en:\n${ruta}\n\n` +
        `Abre el archivo .env.local de la caja y corrige la linea VENUS_DB ` +
        `para que apunte al archivo venus.db del sistema de bodega.`
    );
  }

  const db = new Database(ruta);

  // Los mismos pragmas que usa la bodega. El WAL es lo que permite que las
  // dos apps escriban a la vez; ponerlo en DELETE aqui se lo quitaria a la
  // bodega, porque el modo se guarda en el archivo y no por conexion.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Mas holgado que los 5000 de bodega: la caja escribe mas seguido y es la
  // que no se puede quedar esperando con una clienta enfrente.
  db.pragma("busy_timeout = 10000");

  const tablasBodega = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('modelos','personal','movimientos')")
    .all() as { name: string }[];
  if (tablasBodega.length < 3) {
    throw new ErrorDeInstalacion(
      `El archivo ${ruta} no parece ser la base del sistema de bodega ` +
        `(le faltan las tablas de modelos y personal). Revisa la linea ` +
        `VENUS_DB del archivo .env.local.`
    );
  }

  // Solo las tablas de la caja. El esquema de la bodega no se toca: lo crea
  // ella al arrancar y no es asunto de este programa.
  db.exec(ESQUEMA_CAJA);
  columnasNuevas(db);

  return db;
}

/**
 * Columnas que se agregaron despues de instalar.
 *
 * CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe, asi que a las
 * bases de antes hay que agregarles la columna a mano. Solo se agrega lo que
 * falta y nunca se quita nada: las ventas que ya estaban se quedan igual.
 */
function columnasNuevas(db: Database.Database): void {
  const tiene = (tabla: string, columna: string) =>
    (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).some((c) => c.name === columna);

  if (!tiene("caja_venta_lineas", "precio_lista")) {
    db.exec("ALTER TABLE caja_venta_lineas ADD COLUMN precio_lista INTEGER");
  }
  if (!tiene("caja_ventas", "cobro")) {
    db.exec("ALTER TABLE caja_ventas ADD COLUMN cobro TEXT NOT NULL DEFAULT ''");
  }
}

export function getDb(): Database.Database {
  if (!global_.__venusCajaDb) global_.__venusCajaDb = abrir();
  return global_.__venusCajaDb;
}

/** Lee un ajuste de la caja. */
export function leerAjuste(clave: string, siNoHay = ""): string {
  const fila = getDb().prepare("SELECT valor FROM caja_config WHERE clave = ?").get(clave) as
    | { valor: string }
    | undefined;
  return fila?.valor ?? siNoHay;
}

/** Guarda un ajuste de la caja. */
export function guardarAjuste(clave: string, valor: string): void {
  getDb()
    .prepare(
      `INSERT INTO caja_config (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    .run(clave, valor);
}

/** Nombre de esta caja: sale en el ticket y encabeza el folio (C1-000123). */
export function nombreCaja(): string {
  return (process.env.VENUS_CAJA || "C1").trim().toUpperCase();
}
