import { redirect } from "next/navigation";
import Navegacion from "@/components/Navegacion";
import PanelImpresora from "@/components/PanelImpresora";
import { TituloPagina } from "@/components/ui";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Como imprime el equipo donde se abre la caja. La puede abrir cualquiera
 * que haya entrado: se configura en el propio SUNMI, con el PIN de
 * TIANGUIS, sin tener que ir por el duenio.
 */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={esDuenio(sesion)} />
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <TituloPagina
          titulo="Impresora de este equipo"
          descripcion="Cada equipo dice como imprime y de que ancho es su rollo: la tienda, 80 mm; el SUNMI, 58 mm."
        />
        <PanelImpresora />
      </main>
    </>
  );
}
