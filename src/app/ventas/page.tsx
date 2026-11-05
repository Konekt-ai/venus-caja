import Link from "next/link";
import { redirect } from "next/navigation";
import ListaVentas from "@/components/ListaVentas";
import Navegacion from "@/components/Navegacion";
import PanelCorte from "@/components/PanelCorte";
import { TituloPagina } from "@/components/ui";
import { corteDelDia, estadoCorte, hoy, ventasDelDia } from "@/lib/consultas";
import { cajaDeLugar } from "@/lib/db";
import { LUGARES, lugarDeCaja, type Lugar } from "@/lib/lugar";
import { esDuenio, lugarDeSesion, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const NOMBRE: Record<Lugar, string> = { tienda: "Tienda", tianguis: "Tianguis" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; lugar?: string }>;
}) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");

  const parametros = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(parametros.dia ?? "") ? (parametros.dia as string) : hoy();

  // Cada quien ve la caja de su lugar. El duenio puede cambiar entre la
  // tienda y el tianguis: cada una tiene su propio corte y su propio cajon.
  const duenio = esDuenio(sesion);
  const lugar: Lugar =
    duenio && parametros.lugar === "tianguis" ? "tianguis" : duenio ? "tienda" : lugarDeSesion(sesion);
  const caja = cajaDeLugar(lugar);

  const ventas = ventasDelDia(dia, caja);
  const corte = corteDelDia(dia, caja);
  const estado = estadoCorte(dia, caja);

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={duenio} />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <TituloPagina
          titulo={dia === hoy() ? "Ventas del dia" : `Ventas del ${dia}`}
          descripcion={
            lugarDeCaja(caja) === "tianguis"
              ? `Lo cobrado en el tianguis (caja ${caja}), su corte y los tickets para reimprimir.`
              : "Lo cobrado, el corte de caja y los tickets para reimprimir."
          }
        />
        {duenio ? (
          <div className="mb-4 flex gap-2">
            {LUGARES.map((l) => (
              <Link
                key={l}
                href={`/ventas?lugar=${l}${dia !== hoy() ? `&dia=${dia}` : ""}`}
                aria-current={l === lugar ? "true" : undefined}
                className={`rounded-sm border px-4 py-2 text-sm font-semibold ${
                  l === lugar ? "border-vino bg-vino-palido text-vino" : "border-linea-fuerte bg-papel text-humo"
                }`}
              >
                {NOMBRE[l]}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="space-y-6">
          <PanelCorte
            caja={caja}
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
