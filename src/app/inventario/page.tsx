import { redirect } from "next/navigation";
import PanelInventarioTianguis from "@/components/PanelInventarioTianguis";
import PestanasTianguis from "@/components/PestanasTianguis";
import { TituloPagina } from "@/components/ui";
import { catalogoParaCaja } from "@/lib/consultas";
import { cajaDeLugar } from "@/lib/db";
import { inventarioDelTianguis, piezasEnBodega } from "@/lib/movimientosTianguis";
import { lugarDeSesion, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Inventario del tianguis: lo que hay (igual que en el sistema de bodega),
 * recibir de bodega, regresar a bodega y el cierre del dia. Es solo de la
 * caja del tianguis (el SUNMI), en su propia pagina para no mezclarlo con
 * cobrar. Se llega con la pestana Inventario de arriba.
 */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  if (lugarDeSesion(sesion) !== "tianguis") redirect("/");

  const catalogo = catalogoParaCaja("tianguis");
  const bodega = piezasEnBodega();
  const enTianguis = inventarioDelTianguis();

  return (
    <div className="min-h-screen bg-marfil">
      {/* El mismo encabezado que la pantalla de cobrar, con sus pestanas. */}
      <header className="capitone sticky top-0 z-30 border-b border-linea-fuerte">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="marca text-lg sm:text-xl">Venus</span>
            <span className="etiqueta mb-0 whitespace-nowrap">Tianguis {cajaDeLugar("tianguis")}</span>
          </div>
          <span className="truncate text-sm font-semibold text-tinta">{sesion.nombre}</span>
        </div>
        <PestanasTianguis activa="inventario" />
      </header>

      <main className="mx-auto w-full max-w-2xl p-3 pb-10 sm:p-6">
        <TituloPagina
          titulo="Inventario del tianguis"
          descripcion="Lo que hay, lo que llega de la bodega, lo que regresa y el cierre del dia."
        />
        <PanelInventarioTianguis catalogo={catalogo} bodega={bodega} enTianguis={enTianguis} />
      </main>
    </div>
  );
}
