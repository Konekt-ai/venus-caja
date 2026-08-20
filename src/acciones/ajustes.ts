"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { RUTA_BASE_DATOS, getDb, guardarAjuste, leerAjuste, nombreCaja } from "@/lib/db";
import { aCentavos, pesos } from "@/lib/dinero";
import { esDuenio, sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";

/**
 * Los ajustes de la caja.
 *
 * Son pocos a proposito: cada perilla que se agrega aqui es una manera mas
 * de que la caja se comporte distinto en la tienda y en la bodega sin que
 * nadie sepa por que. Solo esta lo que de verdad cambia de una instalacion
 * a otra o de un mes a otro.
 */

/** Todos los ajustes cambian como cobra la tienda entera: nada mas el duenio. */
async function mandaElDuenio(): Promise<boolean> {
  return esDuenio(await sesionActual());
}

/**
 * El candado de existencias.
 *
 * Apagado (como esta hoy) la caja cobra aunque el modelo tenga cero piezas
 * en la tienda: solo lo anota. Encendido, esa venta no pasa.
 */
export async function guardarBloqueoSinExistencia(encendido: boolean): Promise<Resultado> {
  if (!(await mandaElDuenio())) return { ok: false, error: "Solo el duenio puede cambiar los ajustes." };

  guardarAjuste("bloquear_sin_existencia", encendido ? "1" : "0");
  revalidatePath("/ajustes");
  return {
    ok: true,
    mensaje: encendido
      ? "Listo: de aqui en adelante la caja NO deja cobrar una prenda sin piezas en la tienda."
      : "Listo: la caja vuelve a cobrar aunque la prenda no tenga piezas registradas.",
  };
}

/**
 * El fondo con el que abre la caja.
 *
 * Se guarda como ajuste y no en el corte de hoy porque casi siempre es la
 * misma cantidad todos los dias: asi nadie tiene que capturarlo cada
 * manana. El corte que ya esta abierto no se toca desde aqui; ese se
 * corrige en la pantalla de Ventas del dia, que es donde se cuenta el cajon.
 */
export async function guardarFondoInicial(texto: string): Promise<Resultado> {
  if (!(await mandaElDuenio())) return { ok: false, error: "Solo el duenio puede cambiar los ajustes." };

  const centavos = aCentavos(texto);
  if (centavos === null) return { ok: false, error: "Escribe cuanto dinero se deja en el cajon, por ejemplo 500." };
  if (centavos > 100_000_00) return { ok: false, error: "Ese fondo se ve altisimo. Revisa el numero." };

  guardarAjuste("fondo_inicial", String(centavos));
  revalidatePath("/ajustes");
  return { ok: true, mensaje: `El fondo quedo en ${pesos(centavos)}. Se usa al abrir el corte del dia siguiente.` };
}

export type EstadoSistema = {
  version: string;
  caja: string;
  ruta_base: string;
  /** "" cuando nunca se ha respaldado. */
  respaldo_cuando: string;
  respaldo_dias: number;
  respaldo_de: string;
  ventas: number;
  desde: string;
  actualizacion_cuando: string;
  problema: string;
};

/** La version sale de package.json: es la misma que se ve al actualizar. */
function versionDelSistema(): string {
  try {
    const crudo = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const datos = JSON.parse(crudo) as { version?: string };
    return datos.version?.trim() || "sin numero de version";
  } catch {
    return "sin numero de version";
  }
}

/** "2026-08-19 22:30" -> milisegundos. Sin la T no es fecha valida para Date. */
function enMilisegundos(fecha: string): number {
  const cuando = new Date(fecha.trim().replace(" ", "T")).getTime();
  return Number.isFinite(cuando) ? cuando : 0;
}

/**
 * El respaldo mas reciente, venga de donde venga.
 *
 * Hay dos maneras de respaldar y las dos cuentan: la tarea de las 22:30 (y
 * ACTUALIZAR.bat) dejan el archivo en la carpeta respaldos\, y el boton de
 * esta pantalla se lo lleva a la computadora de quien lo apreto, donde ya
 * no se puede ver. Por eso ese se anota en la base al descargarlo.
 */
function ultimoRespaldo(): { cuando: string; de: string; ms: number } | null {
  let ms = 0;
  let de = "";

  try {
    const carpeta = path.join(process.cwd(), "respaldos");
    for (const archivo of fs.readdirSync(carpeta)) {
      if (!/^venus-respaldo-.+\.db$/.test(archivo)) continue;
      const cuando = fs.statSync(path.join(carpeta, archivo)).mtimeMs;
      if (cuando > ms) {
        ms = cuando;
        de = "guardado solo en la carpeta respaldos";
      }
    }
  } catch {
    // Instalacion recien hecha: todavia no existe la carpeta.
  }

  const anotado = enMilisegundos(leerAjuste("ultimo_respaldo", ""));
  if (anotado > ms) {
    ms = anotado;
    de = "descargado desde esta pantalla";
  }

  if (ms === 0) return null;
  const f = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return {
    cuando: `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())} ${dos(f.getHours())}:${dos(f.getMinutes())}`,
    de,
    ms,
  };
}

/** Lo que se pregunta cuando algo anda raro y hay que dar soporte por telefono. */
export async function estadoDelSistema(): Promise<Resultado<EstadoSistema>> {
  if (!(await mandaElDuenio())) return { ok: false, error: "Solo el duenio puede ver el estado del sistema." };

  const estado: EstadoSistema = {
    version: versionDelSistema(),
    caja: nombreCaja(),
    ruta_base: RUTA_BASE_DATOS,
    respaldo_cuando: "",
    respaldo_dias: -1,
    respaldo_de: "",
    ventas: 0,
    desde: "",
    actualizacion_cuando: "",
    problema: "",
  };

  try {
    const db = getDb();
    const cuenta = db.prepare("SELECT COUNT(*) AS n, MIN(fecha) AS desde FROM caja_ventas").get() as {
      n: number;
      desde: string | null;
    };
    estado.ventas = cuenta.n;
    estado.desde = (cuenta.desde ?? "").slice(0, 16);
    estado.actualizacion_cuando = leerAjuste("ultima_actualizacion", "");

    const respaldo = ultimoRespaldo();
    if (respaldo) {
      estado.respaldo_cuando = respaldo.cuando;
      estado.respaldo_de = respaldo.de;
      estado.respaldo_dias = Math.floor((Date.now() - respaldo.ms) / 86_400_000);
    }
  } catch (e) {
    // Sin base no hay ventas que contar, pero la version y la ruta son justo
    // lo que hace falta ver cuando la base es la que no abre.
    estado.problema = e instanceof Error ? e.message : "No se pudo leer la base de datos.";
  }

  return { ok: true, datos: estado };
}
