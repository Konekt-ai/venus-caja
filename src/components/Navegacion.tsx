import Link from "next/link";
import { salir } from "@/acciones/sesion";
import {
  IconoAjustes,
  IconoCobrar,
  IconoEtiqueta,
  IconoHistorial,
  IconoPersona,
  IconoPrenda,
  IconoReportes,
} from "./iconos";

/**
 * La barra de arriba de las pantallas que no son la de cobrar.
 *
 * La de cobrar no la lleva a proposito: ahi no sobra ni un centimetro y no
 * se debe poder salir por error a media venta.
 */
export default function Navegacion({ nombre, duenio }: { nombre: string; duenio: boolean }) {
  const enlaces = [
    { href: "/", texto: "Cobrar", Icono: IconoCobrar, siempre: true },
    { href: "/ventas", texto: "Ventas del dia", Icono: IconoHistorial, siempre: true },
    { href: "/productos", texto: "Productos", Icono: IconoPrenda, siempre: false },
    { href: "/reportes", texto: "Reportes", Icono: IconoReportes, siempre: false },
    { href: "/vendedoras", texto: "Vendedoras", Icono: IconoPersona, siempre: false },
    { href: "/etiquetas", texto: "Etiquetas", Icono: IconoEtiqueta, siempre: false },
    { href: "/ajustes", texto: "Ajustes", Icono: IconoAjustes, siempre: false },
  ].filter((e) => e.siempre || duenio);

  const pintarEnlace = ({ href, texto, Icono }: (typeof enlaces)[number]) => (
    <Link
      key={href}
      href={href}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium text-humo transition-colors hover:bg-papel hover:text-vino"
    >
      <Icono tamano={17} />
      {texto}
    </Link>
  );

  return (
    <header className="capitone no-imprimir border-b border-linea-fuerte">
      <div className="mx-auto w-full max-w-6xl px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <span className="marca text-xl">Venus</span>
            {/* En pantalla ancha el menu cabe junto a la marca, en un renglon. */}
            <nav className="hidden items-center gap-1 lg:flex">{enlaces.map(pintarEnlace)}</nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="truncate text-sm font-semibold text-tinta">{nombre}</span>
            <form action={salir}>
              <button type="submit" className="text-xs font-semibold text-humo hover:text-vino">
                Salir
              </button>
            </form>
          </div>
        </div>

        {/* En angosto el menu no cabe, y dejandolo envolver quedaba en tres
            renglones comiendose media pantalla del telefono. Mejor un solo
            renglon que se desliza de lado, que es el gesto natural ahi. */}
        <nav className="sin-barra -mx-4 mt-1 flex items-center gap-1 overflow-x-auto px-4 lg:hidden">
          {enlaces.map(pintarEnlace)}
        </nav>
      </div>
    </header>
  );
}
