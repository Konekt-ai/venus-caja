import Link from "next/link";
import { IconoCobrar, IconoPrenda } from "./iconos";

/**
 * Cobrar | Inventario, para la caja del tianguis.
 *
 * Van a lo ancho de la pantalla, debajo del encabezado, como las pestanas
 * del tianguis en el sistema de bodega: en el telefono se tocan con el
 * pulgar sin apuntar, y el encabezado queda libre para el nombre y los
 * avisos. Solo salen con la cuenta TIANGUIS.
 */
export default function PestanasTianguis({ activa }: { activa: "cobrar" | "inventario" }) {
  const pestanas = [
    { clave: "cobrar", href: "/", texto: "Cobrar", Icono: IconoCobrar },
    { clave: "inventario", href: "/inventario", texto: "Inventario", Icono: IconoPrenda },
  ] as const;

  return (
    <nav className="grid grid-cols-2 border-t border-linea-fuerte bg-papel" aria-label="Tianguis">
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
