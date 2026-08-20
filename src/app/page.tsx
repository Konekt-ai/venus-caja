import { redirect } from "next/navigation";
import Cobrar from "@/components/Cobrar";
import { Aviso, BotonEnlace, Tarjeta } from "@/components/ui";
import { catalogoParaCaja, nombreNegocio, ultimoFolio } from "@/lib/consultas";
import { nombreCaja } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import type { ModeloCaja } from "@/lib/tipos";

/**
 * La pantalla de cobrar es la pagina de inicio: es donde se pasa el 90% del
 * dia y no tiene caso hacer que la busquen.
 */
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");

  // El duenio entra con su propio PIN para configurar, pero no esta dado de
  // alta como vendedora: una venta tiene que quedar firmada por quien la hizo.
  if (sesion.id === 0) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <Tarjeta>
          <h1 className="titulo mb-3 text-2xl">Entraste como duenio</h1>
          <Aviso tipo="info">
            Para cobrar hay que entrar con el PIN de una vendedora, porque cada venta queda firmada con su
            nombre.
          </Aviso>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotonEnlace href="/vendedoras" variante="primario">
              Vendedoras y sus PIN
            </BotonEnlace>
            <BotonEnlace href="/reportes">Reportes</BotonEnlace>
            <BotonEnlace href="/entrar">Entrar con otro PIN</BotonEnlace>
          </div>
        </Tarjeta>
      </main>
    );
  }

  let catalogo: ModeloCaja[] = [];
  let folio = 0;
  let negocio = "Venus Boutique";
  try {
    catalogo = catalogoParaCaja();
    const caja = nombreCaja();
    folio = ultimoFolio(caja);
    negocio = nombreNegocio();
  } catch (e) {
    // Si la base de la bodega no esta a la mano, la caja no se queda muerta:
    // arranca con la copia que tenga guardada el navegador y avisa.
    console.error(e);
    catalogo = [];
  }

  return (
    <Cobrar
      catalogoInicial={catalogo}
      vendedora={{ id: sesion.id, nombre: sesion.nombre }}
      caja={nombreCaja()}
      negocio={negocio}
      ultimoFolio={folio}
    />
  );
}
