import { redirect } from "next/navigation";
import PanelInventarioTianguis from "@/components/PanelInventarioTianguis";
import { BotonEnlace, TituloPagina } from "@/components/ui";
import { IconoVolver } from "@/components/iconos";
import { catalogoParaCaja } from "@/lib/consultas";
import { inventarioDelTianguis, piezasEnBodega } from "@/lib/movimientosTianguis";
import { lugarDeSesion, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Inventario del tianguis: recibir de bodega, regresar a bodega y el cierre
 * del dia. Es solo de la caja del tianguis (el SUNMI), en su propia pagina
 * para no mezclarlo con cobrar. Se llega con el boton Inventario de arriba.
 */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  if (lugarDeSesion(sesion) !== "tianguis") redirect("/");

  const catalogo = catalogoParaCaja("tianguis");
  const bodega = piezasEnBodega();
  const enTianguis = inventarioDelTianguis();

  return (
    <main className="mx-auto w-full max-w-2xl p-3 pb-10 sm:p-6">
      <TituloPagina
        titulo="Inventario del tianguis"
        descripcion="Lo que llega de la bodega, lo que regresa y el cierre del dia."
        accion={
          <BotonEnlace href="/">
            <IconoVolver tamano={16} />
            Volver a cobrar
          </BotonEnlace>
        }
      />
      <PanelInventarioTianguis catalogo={catalogo} bodega={bodega} enTianguis={enTianguis} />
    </main>
  );
}
