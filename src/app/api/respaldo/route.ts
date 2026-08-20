import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, guardarAjuste } from "@/lib/db";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * El respaldo de un clic.
 *
 * Se usa VACUUM INTO y no una copia del archivo: la base corre en modo WAL,
 * asi que lo ultimo que se cobro todavia vive en venus.db-wal y una copia
 * directa se llevaria la base sin las ventas mas recientes, que son justo
 * las que a nadie le gustaria perder. VACUUM INTO le pide a SQLite que
 * escriba una base completa y ya compactada.
 *
 * El archivo que sale trae TODO: el inventario de la bodega y las ventas de
 * la caja, porque las dos cosas viven en el mismo venus.db. Por eso lo
 * descarga unicamente el duenio.
 */
export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." }, { status: 401 });
  }
  if (!esDuenio(sesion)) {
    return NextResponse.json(
      { ok: false, error: "Solo el duenio puede bajar el respaldo: ese archivo trae toda la base." },
      { status: 403 }
    );
  }

  const db = getDb();
  const fecha = (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;

  // El temporal lleva la hora y el numero de proceso para que dos respaldos
  // al mismo tiempo no se pisen el archivo uno al otro.
  const temporal = path.join(os.tmpdir(), `venus-respaldo-${Date.now()}-${process.pid}.db`);

  try {
    // VACUUM INTO se niega a escribir sobre un archivo que ya existe.
    if (fs.existsSync(temporal)) fs.unlinkSync(temporal);

    db.prepare("VACUUM INTO ?").run(temporal);
    const contenido = fs.readFileSync(temporal);

    // Se anota cuando fue, porque este respaldo se va a la computadora de
    // quien lo bajo y desde aqui ya no hay manera de saber que existio.
    const cuando = (db.prepare("SELECT datetime('now','localtime') AS d").get() as { d: string }).d;
    guardarAjuste("ultimo_respaldo", cuando);

    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="venus-respaldo-${fecha}.db"`,
        "Content-Length": String(contenido.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error
            ? `No se pudo hacer el respaldo: ${e.message}`
            : "No se pudo hacer el respaldo. Revisa que haya espacio en el disco.",
      },
      { status: 500 }
    );
  } finally {
    try {
      if (fs.existsSync(temporal)) fs.unlinkSync(temporal);
    } catch {
      // Si el temporal no se deja borrar no vale la pena tumbar la descarga.
    }
  }
}
