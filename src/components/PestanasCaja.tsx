import Link from "next/link";
import { IconoCobrar, IconoPrenda } from "./iconos";

/**
 * Cobrar | Inventario, debajo del encabezado de la caja.
 *
 * Van a lo ancho de la pantalla, como las pestanas del tianguis en el
 * sistema de bodega: en el telefono se tocan con el pulgar sin apuntar, y
 * el encabezado queda libre para el nombre y los avisos. Salen para todos
 * los que cobran (tienda y tianguis); el duenio no las ve, porque no cobra.
 */
export default function PestanasCaja({ activa }: { activa: "cobrar" | "inventario" }) {
  const pestanas = [
    { clave: "cobrar", href: "/", texto: "Cobrar", Icono: IconoCobrar },
    { clave: "inventario", href: "/inventario", texto: "Inventario", Icono: IconoPrenda },
  ] as const;

  return (
    <nav className="grid grid-cols-2 border-t border-linea-fuerte bg-papel" aria-label="Caja">
      {pestanas.map(({ clave, href, texto, Icono }) => {
        const elegida = activa === clave;
        return (
          <Link
            key={clave}
            href={href}
            aria-current={elegida ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center gap-2 border-b-[3px] text-sm font-semibold ${
              elegida ? "border-vino text-vino" : "border-transparent text-humo hover:text-tinta"
            }`}
          >
            <Icono tamano={18} />
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
