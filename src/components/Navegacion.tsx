import Link from "next/link";
import { salir } from "@/acciones/sesion";
import { IconoCobrar, IconoEtiqueta, IconoHistorial, IconoPersona, IconoPrenda, IconoReportes } from "./iconos";

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
  ].filter((e) => e.siempre || duenio);

  return (
    <header className="capitone no-imprimir border-b border-linea-fuerte">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="marca text-xl">Venus</span>
          <nav className="flex flex-wrap items-center gap-1">
            {enlaces.map(({ href, texto, Icono }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium text-humo transition-colors hover:bg-papel hover:text-vino"
              >
                <Icono tamano={17} />
                {texto}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-tinta">{nombre}</span>
          <form action={salir}>
            <button type="submit" className="text-xs font-semibold text-humo hover:text-vino">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
