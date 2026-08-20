import type { Metadata } from "next";
import { BotonImprimir, BotonImprimirHoja, ImpresionAutomatica } from "@/components/BotonImprimir";
import { IconoVolver } from "@/components/iconos";
import { BotonEnlace, Tarjeta } from "@/components/ui";
import { obtenerVenta } from "@/lib/consultas";
import { armarTicketHtml, CSS_TICKET } from "@/lib/ticket";

/**
 * El ticket de una venta.
 *
 * Se abre de dos maneras: la vendedora entra a verlo o a reimprimirlo, o la
 * pantalla de cobrar lo carga con ?imprimir=1 dentro de un iframe escondido
 * para que salga solo del rollo. En los dos casos lo que se imprime es lo
 * mismo, por eso la pagina no trae menu ni barra: lo poco que sirve nada mas
 * en pantalla va marcado con .no-imprimir.
 *
 * El ticket se pinta con el mismo armador que usa la pantalla de cobrar
 * (src/lib/ticket.ts). Se hace asi, y no con un componente aparte, para que
 * un ticket reimpreso salga identico al que se le dio a la clienta: con dos
 * versiones, tarde o temprano una se queda atras.
 */

type Props = {
  params: Promise<{ folio: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Un ticket cancelado tiene que verse cancelado en cuanto se recarga: aqui
// no se guarda nada en cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { folio } = await params;
  return { title: `Ticket ${decodeURIComponent(folio)}` };
}

export default async function PaginaTicket({ params, searchParams }: Props) {
  const { folio } = await params;
  const consulta = await searchParams;
  const buscado = decodeURIComponent(folio || "").trim();
  const venta = obtenerVenta(buscado);

  if (!venta) {
    return (
      <main className="no-imprimir mx-auto max-w-md px-4 py-16">
        <Tarjeta>
          <p className="titulo text-xl">No se encontro el ticket {buscado}</p>
          <p className="mt-2 text-sm leading-relaxed text-humo">
            Revisa el folio: se escribe asi C1-000123. Si la venta se acaba de cobrar y todavia no
            aparece, buscala en las ventas del dia.
          </p>
          <div className="mt-5">
            <BotonEnlace href="/">
              <IconoVolver />
              Volver a cobrar
            </BotonEnlace>
          </div>
        </Tarjeta>
      </main>
    );
  }

  const automatico = consulta.imprimir === "1";

  return (
    <main className="px-4 py-6">
      <style dangerouslySetInnerHTML={{ __html: CSS_TICKET }} />
      <ImpresionAutomatica activa={automatico} folio={venta.venta.folio} />

      <div className="no-imprimir mx-auto mb-6 flex max-w-lg flex-wrap items-center justify-center gap-3">
        <BotonEnlace href="/" tamano="grande">
          <IconoVolver />
          Volver a cobrar
        </BotonEnlace>
        <BotonImprimir />
        <BotonImprimirHoja />
      </div>

      {/* El texto ya viene escapado por armarTicketHtml. */}
      <div className="hoja mx-auto w-fit" dangerouslySetInnerHTML={{ __html: armarTicketHtml(venta) }} />
    </main>
  );
}
