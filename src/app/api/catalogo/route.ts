import { NextResponse } from "next/server";
import { nombreCaja } from "@/lib/db";
import { catalogoParaCaja, quienesVenden, ultimoFolio } from "@/lib/consultas";
import { sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * El catalogo fresco para la pantalla de cobrar, que se queda abierta el
 * dia entero. Un precio, un codigo o una descripcion corregidos en bodega
 * llegan por aqui en el siguiente ciclo de sincronizacion; sin esto solo
 * llegarian cuando alguien recargara la pagina, y nadie la recarga.
 */
export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ ok: false, error: "La sesion se cerro." }, { status: 401 });

  try {
    return NextResponse.json({
      ok: true,
      catalogo: catalogoParaCaja(),
      ultimo_folio: ultimoFolio(nombreCaja()),
      // Una vendedora que dan de alta a media jornada aparece al cobrar sin recargar.
      vendedoras: quienesVenden(),
    });
  } catch {
    // La base no contesto (disco ocupado, OneDrive a medias). La caja sigue
    // cobrando con su copia; al minuto se vuelve a intentar.
    return NextResponse.json({ ok: false, error: "No se pudo leer el catalogo." }, { status: 500 });
  }
}
