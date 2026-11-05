import { NextResponse } from "next/server";
import { obtenerVenta } from "@/lib/consultas";
import { sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Los datos de un ticket, para reimprimirlo por RawBT en el SUNMI. Ahi el
 * ticket no se imprime como pagina sino que se arma en la pantalla (ver
 * escpos.ts), asi que hace falta la venta y no su HTML.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ folio: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ ok: false, error: "La sesion se cerro." }, { status: 401 });

  const { folio } = await params;
  const venta = obtenerVenta(decodeURIComponent(folio).trim());
  if (!venta) return NextResponse.json({ ok: false, error: "No se encontro ese ticket." }, { status: 404 });
  return NextResponse.json({ ok: true, venta });
}
