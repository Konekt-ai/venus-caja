import { redirect } from "next/navigation";
import PanelInventario from "@/components/PanelInventario";
import PestanasCaja from "@/components/PestanasCaja";
import { TituloPagina } from "@/components/ui";
import { catalogoParaCaja } from "@/lib/consultas";
import { cajaDeLugar } from "@/lib/db";
import { inventarioDelLugar, piezasEnBodega } from "@/lib/movimientosDeLugar";
import { esDuenio, lugarDeSesion, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Inventario del lugar donde se cobra: lo que hay, recibir de bodega,
 * regresar a bodega y (en el tianguis) el cierre del dia. Lo ve cualquiera
 * que cobre, cada quien su lugar: con VENTAS o una vendedora, la tienda;
 * con TIANGUIS, el tianguis. El duenio no, porque no cobra. Va en su propia
 * pagina para no mezclarlo con cobrar; se llega con la pestana Inventario.
 */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  if (esDuenio(sesion)) redirect("/");

  const lugar = lugarDeSesion(sesion);
  const catalogo = catalogoParaCaja(lugar);
  const bodega = piezasEnBodega();
  const prendas = inventarioDelLugar(lugar);
  const enTianguis = lugar === "tianguis";

  return (
    <div className="min-h-screen bg-marfil">
      {/* El mismo encabezado que la pantalla de cobrar, con sus pestanas. */}
      <header className="capitone sticky top-0 z-30 border-b border-linea-fuerte">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="marca text-lg sm:text-xl">Venus</span>
            <span className="etiqueta mb-0 whitespace-nowrap">
              {enTianguis ? "Tianguis" : "Caja"} {cajaDeLugar(lugar)}
            </span>
          </div>
          <span className="truncate text-sm font-semibold text-tinta">{sesion.nombre}</span>
        </div>
        <PestanasCaja activa="inventario" />
      </header>

      <main className="mx-auto w-full max-w-2xl p-3 pb-10 sm:p-6">
        <TituloPagina
          titulo={enTianguis ? "Inventario del tianguis" : "Inventario de la tienda"}
          descripcion={
            enTianguis
              ? "Lo que hay, lo que llega de la bodega, lo que regresa y el cierre del dia."
              : "Lo que hay en la tienda, lo que llega de la bodega y lo que regresa."
          }
        />
        <PanelInventario lugar={lugar} catalogo={catalogo} bodega={bodega} prendas={prendas} />
      </main>
    </div>
  );
}
