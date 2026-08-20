import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/sesion";
import type { VentaParaGuardar } from "@/lib/tipos";
import { registrarVenta } from "@/lib/ventas";

export const dynamic = "force-dynamic";

/**
 * Recibe una venta de la pantalla de cobrar.
 *
 * La misma venta puede llegar varias veces: la caja reintenta hasta que le
 * contestan. Por eso trae un id propio y registrarVenta la guarda una sola
 * vez. Contestar 200 en ese caso es lo correcto, no un error.
 */
export async function POST(peticion: Request) {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." }, { status: 401 });
  }

  let venta: VentaParaGuardar;
  try {
    venta = (await peticion.json()) as VentaParaGuardar;
  } catch {
    return NextResponse.json({ ok: false, error: "La venta llego incompleta." }, { status: 400 });
  }

  // La venta se firma con quien esta adentro, no con lo que venga en el
  // mensaje: asi nadie puede acreditarle una venta a otra vendedora.
  if (sesion.id > 0) venta.vendedora_id = sesion.id;

  const resultado = registrarVenta(venta);
  if (!resultado.ok) {
    // 400 y no 500: es un problema de la venta misma, reintentarla no la va
    // a arreglar y la cola no debe quedarse atorada con ella.
    return NextResponse.json(resultado, { status: 400 });
  }
  return NextResponse.json(resultado);
}
