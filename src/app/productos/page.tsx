import type { Metadata } from "next";
import { redirect } from "next/navigation";
import GestorProductos from "@/components/GestorProductos";
import Navegacion from "@/components/Navegacion";
import { TituloPagina } from "@/components/ui";
import { catalogoParaCaja } from "@/lib/consultas";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const metadata: Metadata = { title: "Productos" };

/** El catalogo se lee en cada visita: la bodega da de alta modelos todo el dia. */
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  // Los precios son del duenio. Una vendedora no tiene por que poder
  // cambiar en cuanto se vende un vestido a media tarde.
  if (!esDuenio(sesion)) redirect("/");

  const catalogo = catalogoParaCaja();

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={esDuenio(sesion)} />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <TituloPagina
          titulo="Productos"
          descripcion="El catalogo viene del sistema de bodega y no trae precios: aqui se les ponen. Las piezas de la tienda se ven de referencia, pero se mueven solas con los envios y las ventas."
        />
        <GestorProductos catalogo={catalogo} />
      </main>
    </>
  );
}
