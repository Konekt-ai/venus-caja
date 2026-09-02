import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Las piezas sueltas de la interfaz, iguales a las del sistema de bodega
 * para que los dos programas se sientan uno solo.
 *
 * Lo unico que cambia aqui es el tamano: en la caja se toca con prisa y se
 * lee de lejos, asi que los botones son mas altos y las cifras mas grandes.
 */

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-sm border border-linea bg-papel p-5 ${className}`}>{children}</div>
  );
}

export function TituloPagina({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titulo text-[1.75rem] leading-tight sm:text-[2rem]">{titulo}</h1>
          {descripcion ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-humo">{descripcion}</p>
          ) : null}
        </div>
        {accion}
      </div>
      <div className="filete mt-4" />
    </div>
  );
}

export type Tono = "oro" | "vino" | "ok" | "aviso" | "alto" | "neutro";

export const TONOS: Record<Tono, string> = {
  oro: "border-oro-claro bg-oro-tenue text-oro",
  vino: "border-vino bg-vino-palido text-vino",
  ok: "border-verde bg-verde-palido text-verde",
  aviso: "border-ambar bg-ambar-palido text-ambar",
  alto: "border-rojo bg-rojo-palido text-rojo",
  neutro: "border-linea-fuerte bg-crema text-humo",
};

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-semibold ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

const BOTON_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const BOTON_VARIANTES = {
  primario: "bg-vino text-marfil hover:bg-vino-oscuro",
  secundario: "border border-linea-fuerte bg-papel text-tinta hover:border-oro hover:bg-oro-tenue",
  oscuro: "bg-tinta text-marfil hover:bg-carbon",
  peligro: "bg-rojo text-marfil hover:brightness-90",
};

const BOTON_TAMANOS = {
  // En el mostrador se toca rapido y a veces sin ver: los botones son altos.
  normal: "min-h-11 py-2.5",
  grande: "min-h-14 py-3 text-base",
};

export function Boton({
  variante = "secundario",
  tamano = "normal",
  className = "",
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof BOTON_VARIANTES;
  tamano?: keyof typeof BOTON_TAMANOS;
}) {
  return (
    <button
      {...resto}
      className={`${BOTON_BASE} ${BOTON_TAMANOS[tamano]} ${BOTON_VARIANTES[variante]} ${className}`}
    />
  );
}

export function BotonEnlace({
  children,
  href,
  variante = "secundario",
  tamano = "normal",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variante?: keyof typeof BOTON_VARIANTES;
  tamano?: keyof typeof BOTON_TAMANOS;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BOTON_BASE} ${BOTON_TAMANOS[tamano]} ${BOTON_VARIANTES[variante]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Aviso({ tipo, children }: { tipo: "ok" | "error" | "info"; children: ReactNode }) {
  const estilos = {
    ok: "border-verde bg-verde-palido text-verde",
    error: "border-rojo bg-rojo-palido text-rojo",
    info: "border-oro bg-oro-tenue text-tinta",
  };
  return (
    <div className={`rounded-sm border-l-2 px-4 py-3 text-sm font-medium ${estilos[tipo]}`}>{children}</div>
  );
}

export function Vacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-sm border border-dashed border-linea-fuerte px-6 py-12 text-center">
      {icono ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-crema text-humo">
          {icono}
        </div>
      ) : null}
      <p className="titulo text-lg">{titulo}</p>
      {descripcion ? <p className="mt-1 max-w-sm text-sm text-humo">{descripcion}</p> : null}
      {accion ? <div className="mt-4">{accion}</div> : null}
    </div>
  );
}

export function Cifra({
  valor,
  texto,
  tono = "neutro",
}: {
  valor: number | string;
  texto: string;
  tono?: Tono;
}) {
  const color = {
    oro: "text-oro",
    vino: "text-vino",
    ok: "text-verde",
    aviso: "text-ambar",
    alto: "text-rojo",
    neutro: "text-tinta",
  }[tono];

  // Mas apretada en telefono para que tres quepan en un renglon: sueltas
  // de una por fila, la primera pantalla se iba en puros numeros.
  return (
    <div className="rounded-sm border border-linea bg-papel px-3 py-2.5 sm:px-4 sm:py-3">
      <p className={`titulo cifra text-2xl leading-none sm:text-[2rem] ${color}`}>{valor}</p>
      <p className="etiqueta mb-0 mt-2">{texto}</p>
    </div>
  );
}
