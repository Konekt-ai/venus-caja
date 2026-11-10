"use server";

import { revalidatePath } from "next/cache";
import type { Lugar } from "@/lib/lugar";
import {
  cerrarElDia,
  recibirDeBodega,
  regresarABodega,
  type HojaRegistrada,
  type LineaMovimiento,
} from "@/lib/movimientosDeLugar";
import { esDuenio, lugarDeSesion, sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";

/**
 * Entradas y salidas de inventario desde la caja: lo que llega de la bodega,
 * lo que regresa y el cierre del tianguis. Lo puede registrar cualquiera que
 * cobre (VENTAS, TIANGUIS o una vendedora con su PIN), cada quien sobre su
 * lugar; el duenio no, porque no cobra en ninguno. Firma la cuenta con la
 * que se entro.
 */
async function quienYDonde(): Promise<{ persona: string; lugar: Lugar } | null> {
  const sesion = await sesionActual();
  if (!sesion || esDuenio(sesion)) return null;
  return { persona: sesion.nombre, lugar: lugarDeSesion(sesion) };
}

const SIN_PERMISO = "Esto se registra entrando con el PIN de VENTAS, de TIANGUIS o de una vendedora.";

function refrescar() {
  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function recibir(lineas: LineaMovimiento[], nota: string): Promise<Resultado<HojaRegistrada>> {
  const quien = await quienYDonde();
  if (!quien) return { ok: false, error: SIN_PERMISO };
  const r = recibirDeBodega(quien.lugar, lineas, quien.persona, nota);
  if (r.ok) refrescar();
  return r;
}

export async function regresar(lineas: LineaMovimiento[]): Promise<Resultado<HojaRegistrada>> {
  const quien = await quienYDonde();
  if (!quien) return { ok: false, error: SIN_PERMISO };
  const r = regresarABodega(quien.lugar, lineas, quien.persona);
  if (r.ok) refrescar();
  return r;
}

/** El cierre del dia es solo del tianguis: la tienda no levanta todo cada noche. */
export async function cierreDelDia(): Promise<Resultado<HojaRegistrada>> {
  const quien = await quienYDonde();
  if (!quien) return { ok: false, error: SIN_PERMISO };
  if (quien.lugar !== "tianguis") return { ok: false, error: "El cierre del dia es solo del tianguis." };
  const r = cerrarElDia(quien.persona);
  if (r.ok) refrescar();
  return r;
}
