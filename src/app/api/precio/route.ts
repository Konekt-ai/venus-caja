import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** Guarda el precio que se capturo al vuelo en el mostrador. */
export async function POST(peticion: Request) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ ok: false, error: "La sesion se cerro." }, { status: 401 });

  let datos: { modelo_id?: number; precio?: number };
  try {
    datos = (await peticion.json()) as { modelo_id?: number; precio?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "No llego el precio." }, { status: 400 });
  }

  const modeloId = Number(datos.modelo_id);
  const precio = Math.round(Number(datos.precio));
  if (!modeloId || !Number.isFinite(precio) || precio < 0) {
    return NextResponse.json({ ok: false, error: "El precio no es valido." }, { status: 400 });
  }

  getDb()
    .prepare(
      `INSERT INTO caja_precios (modelo_id, precio) VALUES (?, ?)
       ON CONFLICT(modelo_id) DO UPDATE SET precio = excluded.precio,
                                            actualizado_en = datetime('now','localtime')`
    )
    .run(modeloId, precio);

  return NextResponse.json({ ok: true });
}
