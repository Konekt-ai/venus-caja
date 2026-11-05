"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  CUENTAS,
  esDuenio,
  guardarPin,
  guardarPinCuenta,
  pinDelDuenio,
  quitarPinCuenta,
  sesionActual,
  verificarPin,
  type CuentaCompartida,
} from "@/lib/sesion";
import { EL_LUGAR, esVendeEn, type VendeEn } from "@/lib/lugar";
import type { Resultado } from "@/lib/tipos";

/**
 * Las vendedoras son las mismas personas que ya estan dadas de alta en el
 * sistema de bodega (la tabla 'personal'). Aqui no se vuelven a capturar:
 * solo se les pone el PIN con el que van a firmar sus ventas.
 */
export async function ponerPin(personalId: number, pin: string, rol: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede cambiar los PIN." };

  const limpio = (pin ?? "").trim();
  if (!/^\d{4,8}$/.test(limpio)) return { ok: false, error: "El PIN son de 4 a 8 numeros." };

  const persona = getDb().prepare("SELECT nombre FROM personal WHERE id = ?").get(personalId) as
    | { nombre: string }
    | undefined;
  if (!persona) return { ok: false, error: "No se encontro a esa persona en el personal de la bodega." };

  const ocupado = pinOcupado(limpio, personalId);
  if (ocupado) return { ok: false, error: ocupado };

  guardarPin(personalId, limpio, rol === "duenio" ? "duenio" : "vendedora");
  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `${persona.nombre} ya puede entrar con su PIN.` };
}

/**
 * Por que un PIN no se puede usar, o null si esta libre.
 *
 * Al entrar solo se teclea el PIN, asi que dos cuentas con el mismo
 * entrarian a la que se revise primero: el del duenio le gana a todos, y
 * quien tuviera ese PIN entraria como duenio. 'propio' es la cuenta que se
 * esta cambiando (su PIN de antes no cuenta como ocupado).
 */
function pinOcupado(pin: string, propio: number): string | null {
  if (pin === pinDelDuenio()) return "Ese es el PIN del duenio. Ponle otro.";
  const yaEsDeAlguien = verificarPin(pin);
  if (yaEsDeAlguien.ok && yaEsDeAlguien.sesion.id !== propio) {
    return `Ese PIN ya es de ${yaEsDeAlguien.sesion.nombre}. Ponle otro.`;
  }
  return null;
}

/**
 * El PIN de una cuenta compartida, con el que entran todas a cobrar:
 * VENTAS en la tienda, TIANGUIS en el tianguis.
 */
export async function ponerPinCuenta(cuenta: CuentaCompartida, pin: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede cambiar los PIN." };
  if (!CUENTAS[cuenta]) return { ok: false, error: "Esa cuenta no existe." };

  const limpio = (pin ?? "").trim();
  if (!/^\d{4,8}$/.test(limpio)) return { ok: false, error: "El PIN son de 4 a 8 numeros." };

  const ocupado = pinOcupado(limpio, CUENTAS[cuenta].id);
  if (ocupado) return { ok: false, error: ocupado };

  guardarPinCuenta(cuenta, limpio);
  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `Listo: con ese PIN entran todas como ${CUENTAS[cuenta].nombre}.` };
}

export async function quitarPinDeCuenta(cuenta: CuentaCompartida): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede cambiar los PIN." };
  if (!CUENTAS[cuenta]) return { ok: false, error: "Esa cuenta no existe." };

  quitarPinCuenta(cuenta);
  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `Se quito el PIN de ${CUENTAS[cuenta].nombre}. Ya nadie entra con el.` };
}

export async function quitarPin(personalId: number): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede cambiar los PIN." };

  getDb()
    .prepare(`UPDATE caja_vendedoras SET pin_hash = '', pin_sal = '' WHERE personal_id = ?`)
    .run(personalId);
  revalidatePath("/vendedoras");
  return { ok: true, mensaje: "Se le quito el PIN. Ya no puede entrar a la caja." };
}

/**
 * Dar de alta a una vendedora.
 *
 * Escribe en la tabla 'personal', que es la MISMA que usa el sistema de
 * bodega: son las mismas personas y no tiene caso capturarlas dos veces.
 * Se puede dar de alta desde aqui porque el dia de la instalacion la lista
 * de la bodega puede estar vacia, y sin gente en esa tabla nadie podria
 * cobrar.
 */
/**
 * Donde vende una persona del personal: tienda, tianguis o los dos.
 *
 * Se guarda en caja_vendedoras aunque no tenga PIN: ahi viven los datos que
 * solo le importan a la caja. Si todavia no tenia renglon se crea sin PIN,
 * que es lo normal cuando entran con la cuenta compartida.
 */
function guardarVendeEn(personalId: number, vendeEn: VendeEn): void {
  getDb()
    .prepare(
      `INSERT INTO caja_vendedoras (personal_id, vende_en) VALUES (?, ?)
       ON CONFLICT(personal_id) DO UPDATE SET vende_en = excluded.vende_en`
    )
    .run(personalId, vendeEn);
}

export async function cambiarVendeEn(personalId: number, vendeEn: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede cambiar donde vende cada quien." };
  if (!esVendeEn(vendeEn)) return { ok: false, error: "Elige tienda, tianguis o los dos." };

  const persona = getDb().prepare("SELECT nombre FROM personal WHERE id = ?").get(personalId) as
    | { nombre: string }
    | undefined;
  if (!persona) return { ok: false, error: "No se encontro a esa persona en el personal de la bodega." };

  guardarVendeEn(personalId, vendeEn);
  revalidatePath("/vendedoras");
  const donde = vendeEn === "ambos" ? "en la tienda y en el tianguis" : `en ${EL_LUGAR[vendeEn]}`;
  return { ok: true, mensaje: `${persona.nombre} sale al cobrar ${donde}.` };
}

export async function agregarVendedora(nombre: string, puesto: string, vendeEn = "tienda"): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!esDuenio(sesion)) return { ok: false, error: "Solo el duenio puede dar de alta vendedoras." };

  const limpio = nombre.trim().toUpperCase();
  if (limpio.length < 2) return { ok: false, error: "Escribe el nombre de la vendedora." };

  const db = getDb();
  const repetida = db
    .prepare("SELECT id FROM personal WHERE upper(nombre) = ? AND activo = 1")
    .get(limpio) as { id: number } | undefined;
  if (repetida) return { ok: false, error: `${limpio} ya esta en la lista.` };

  const orden = (db.prepare("SELECT COALESCE(MAX(orden),0) + 1 AS n FROM personal").get() as { n: number }).n;
  const alta = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO personal (nombre, puesto, activo, orden) VALUES (?, ?, 1, ?)")
      .run(limpio, puesto.trim() || "Vendedora", orden);
    guardarVendeEn(Number(info.lastInsertRowid), esVendeEn(vendeEn) ? vendeEn : "tienda");
  });
  alta();

  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `${limpio} quedo en la lista: ya se puede elegir al cobrar.` };
}
