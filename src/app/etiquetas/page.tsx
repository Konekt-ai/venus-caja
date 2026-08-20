import type { Metadata } from "next";
import HojaEtiquetas from "@/components/HojaEtiquetas";
import { TituloPagina } from "@/components/ui";
import { catalogoParaCaja } from "@/lib/consultas";

export const metadata: Metadata = { title: "Etiquetas" };

/** El catalogo se lee de la base en cada visita: la bodega da de alta modelos todo el dia. */
export const dynamic = "force-dynamic";

export default function PaginaEtiquetas() {
  const catalogo = catalogoParaCaja();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="no-imprimir">
        <TituloPagina
          titulo="Etiquetas"
          descripcion="Elige los modelos y cuantas etiquetas de cada uno. Salen 21 por hoja carta, de 63.5 x 38.1 mm, con el codigo de barras y el codigo a la vista por si el lector no dispara."
        />
      </div>
      <HojaEtiquetas catalogo={catalogo} />
    </div>
  );
}
