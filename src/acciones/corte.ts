"use server";

import { revalidatePath } from "next/cache";
import { getDb, guardarAjuste, nombreCaja } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";

/**
 * El corte de caja.
 *
 * Un corte sirve de verdad cuando dice cuanto DEBERIA haber en el cajon.
 * Para eso hacen falta tres cosas que no son ventas: el fondo con el que se
 * abrio, los retiros del dia, y el conteo del efectivo al cerrar.
 */

/** El corte del dia se abre solo con la primera venta; esto lo alcanza o lo crea. */
function corteDeHoy(): { id: number; dia: string } {
  const db = getDb();
  const caja = nombreCaja();
  const hoy = (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;

  const existente = db.prepare("SELECT id FROM caja_cortes WHERE caja = ? AND dia = ?").get(caja, hoy) as
    | { id: number }
    | undefined;
  if (existente) return { id: existente.id, dia: hoy };

  const info = db
    .prepare(`INSERT INTO caja_cortes (caja, dia, fondo, abierto_por) VALUES (?, ?, 0, '')`)
    .run(caja, hoy);
  return { id: Number(info.lastInsertRowid), dia: hoy };
}

/**
 * El fondo se guarda tambien como ajuste porque casi siempre es el mismo
 * todos los dias: asi nadie tiene que capturarlo cada manana.
 */
export async function guardarFondo(centavos: number): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion) return { ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." };
  if (!Number.isFinite(centavos) || centavos < 0) return { ok: false, error: "El fondo no puede ser negativo." };

  const { id } = corteDeHoy();
  getDb().prepare("UPDATE caja_cortes SET fondo = ? WHERE id = ?").run(Math.round(centavos), id);
  guardarAjuste("fondo_inicial", String(Math.round(centavos)));
  revalidatePath("/ventas");
  return { ok: true, mensaje: "Se guardo el fondo con el que abrio la caja." };
}

export async function registrarRetiro(centavos: number, motivo: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion) return { ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." };
  if (!Number.isFinite(centavos) || centavos <= 0) return { ok: false, error: "Escribe cuanto se saco del cajon." };
  if (!motivo.trim()) return { ok: false, error: "Escribe para que se saco el dinero." };

  const { id } = corteDeHoy();
  getDb()
    .prepare(`INSERT INTO caja_retiros (corte_id, monto, motivo, persona) VALUES (?, ?, ?, ?)`)
    .run(id, Math.round(centavos), motivo.trim(), sesion.nombre);
  revalidatePath("/ventas");
  return { ok: true, mensaje: "Se anoto el retiro." };
}

/**
 * Cerrar el dia: se cuenta el efectivo del cajon y se guarda la diferencia
 * contra lo que el sistema esperaba. La diferencia no se corrige ni se
 * esconde: queda anotada, que es justo lo que sirve para revisarla despues.
 */
export async function cerrarCorte(efectivoContado: number, esperado: number, nota: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion) return { ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." };
  if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
    return { ok: false, error: "Escribe cuanto efectivo hay en el cajon." };
  }

  const { id } = corteDeHoy();
  const diferencia = Math.round(efectivoContado) - Math.round(esperado);

  getDb()
    .prepare(
      `UPDATE caja_cortes
          SET efectivo_contado = ?, diferencia = ?, nota = ?, estado = 'cerrado',
              cerrado_por = ?, cerrado_en = datetime('now','localtime')
        WHERE id = ?`
    )
    .run(Math.round(efectivoContado), diferencia, nota.trim(), sesion.nombre, id);

  revalidatePath("/ventas");
  return {
    ok: true,
    mensaje:
      diferencia === 0
        ? "El corte cuadro exacto."
        : diferencia > 0
          ? `Cerro con ${(diferencia / 100).toFixed(2)} de mas en el cajon.`
          : `Cerro con ${(Math.abs(diferencia) / 100).toFixed(2)} de menos en el cajon.`,
  };
}
