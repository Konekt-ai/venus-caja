"use server";

import { revalidatePath } from "next/cache";
import {
  cerrarElDia,
  recibirDeBodega,
  regresarDelTianguis,
  type HojaRegistrada,
  type LineaMovimiento,
} from "@/lib/movimientosTianguis";
import { lugarDeSesion, sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";

/**
 * Entradas y salidas del tianguis, desde la caja del SUNMI. Solo con la
 * cuenta del tianguis: en la tienda no tiene caso y se prestaria a mover
 * piezas por error. Firma TIANGUIS (o quien haya entrado).
 */
async function quienFirma(): Promise<string | null> {
  const sesion = await sesionActual();
  if (!sesion || lugarDeSesion(sesion) !== "tianguis") return null;
  return sesion.nombre;
}

const SIN_PERMISO = "Esto se registra entrando con el PIN de TIANGUIS.";

function refrescar() {
  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function recibir(lineas: LineaMovimiento[], nota: string): Promise<Resultado<HojaRegistrada>> {
  const persona = await quienFirma();
  if (!persona) return { ok: false, error: SIN_PERMISO };
  const r = recibirDeBodega(lineas, persona, nota);
  if (r.ok) refrescar();
  return r;
}

export async function regresar(lineas: LineaMovimiento[]): Promise<Resultado<HojaRegistrada>> {
  const persona = await quienFirma();
  if (!persona) return { ok: false, error: SIN_PERMISO };
  const r = regresarDelTianguis(lineas, persona);
  if (r.ok) refrescar();
  return r;
}

export async function cierreDelDia(): Promise<Resultado<HojaRegistrada>> {
  const persona = await quienFirma();
  if (!persona) return { ok: false, error: SIN_PERMISO };
  const r = cerrarElDia(persona);
  if (r.ok) refrescar();
  return r;
}
