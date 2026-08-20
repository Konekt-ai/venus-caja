import { redirect } from "next/navigation";
import GestorVendedoras from "@/components/GestorVendedoras";
import { BotonEnlace, TituloPagina } from "@/components/ui";
import { listarVendedoras } from "@/lib/consultas";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  if (!esDuenio(sesion)) redirect("/");

  const personal = listarVendedoras(false);

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <TituloPagina
        titulo="Vendedoras"
        descripcion="Son las mismas personas del sistema de bodega. Aqui se les pone el PIN con el que firman sus ventas."
        accion={<BotonEnlace href="/">Ir a cobrar</BotonEnlace>}
      />
      <GestorVendedoras personal={personal} />
    </main>
  );
}
