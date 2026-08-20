"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { esDuenio, guardarPin, sesionActual } from "@/lib/sesion";
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

  // Dos vendedoras con el mismo PIN harian que las ventas se le acreditaran a
  // la equivocada, porque al entrar solo se teclea el PIN.
  const { verificarPin } = await import("@/lib/sesion");
  const yaEsDeAlguien = verificarPin(limpio);
  if (yaEsDeAlguien.ok && yaEsDeAlguien.sesion.id !== personalId) {
    return { ok: false, error: `Ese PIN ya es de ${yaEsDeAlguien.sesion.nombre}. Ponle otro.` };
  }

  guardarPin(personalId, limpio, rol === "duenio" ? "duenio" : "vendedora");
  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `${persona.nombre} ya puede entrar con su PIN.` };
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
export async function agregarVendedora(nombre: string, puesto: string): Promise<Resultado> {
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
  db.prepare("INSERT INTO personal (nombre, puesto, activo, orden) VALUES (?, ?, 1, ?)").run(
    limpio,
    puesto.trim() || "Vendedora",
    orden
  );

  revalidatePath("/vendedoras");
  return { ok: true, mensaje: `${limpio} quedo en la lista. Ahora ponle su PIN.` };
}
