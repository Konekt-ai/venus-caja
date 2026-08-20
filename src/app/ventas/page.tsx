import { redirect } from "next/navigation";
import ListaVentas from "@/components/ListaVentas";
import Navegacion from "@/components/Navegacion";
import PanelCorte from "@/components/PanelCorte";
import { TituloPagina } from "@/components/ui";
import { corteDelDia, estadoCorte, hoy, ventasDelDia } from "@/lib/consultas";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");

  const parametros = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(parametros.dia ?? "") ? (parametros.dia as string) : hoy();

  const ventas = ventasDelDia(dia);
  const corte = corteDelDia(dia);
  const estado = estadoCorte(dia);

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={esDuenio(sesion)} />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <TituloPagina
          titulo={dia === hoy() ? "Ventas del dia" : `Ventas del ${dia}`}
          descripcion="Lo cobrado, el corte de caja y los tickets para reimprimir."
        />
        <div className="space-y-6">
          <PanelCorte
            corte={corte}
            cerrado={estado.cerrado}
            contado={estado.contado}
            diferencia={estado.diferencia}
          />
          <ListaVentas ventas={ventas} puedeCancelar={true} />
        </div>
      </main>
    </>
  );
}
