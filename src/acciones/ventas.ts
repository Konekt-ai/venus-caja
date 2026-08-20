"use server";

import { revalidatePath } from "next/cache";
import { sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";
import { cancelarVenta } from "@/lib/ventas";

/**
 * Cancelar un ticket. Pide motivo siempre: un ticket cancelado sin
 * explicacion es justo lo que despues nadie puede aclarar en el corte.
 */
export async function cancelar(id: string, motivo: string): Promise<Resultado> {
  const sesion = await sesionActual();
  if (!sesion) return { ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." };

  const resultado = cancelarVenta(id, motivo, sesion.nombre);
  if (resultado.ok) revalidatePath("/ventas");
  return resultado;
}
