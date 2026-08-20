/**
 * Los iconos, dibujados a mano y todos de la misma familia.
 *
 * Es el mismo trazo del sistema de bodega: rejilla de 24, trazo de 1.5,
 * puntas redondeadas y coordenadas a .25 o .5 para que las lineas caigan
 * completas sobre el pixel y no se vean borrosas. Nada de emojis.
 */

type Props = React.SVGProps<SVGSVGElement> & { tamano?: number };

function Base({ tamano = 20, children, ...resto }: Props) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

export function IconoBuscar(p: Props) {
  return (
    <Base {...p}>
      <circle cx="10.75" cy="10.75" r="6" />
      <path d="m15.25 15.25 4.5 4.5" />
    </Base>
  );
}

export function IconoCobrar(p: Props) {
  return (
    <Base {...p}>
      <path d="M3.25 6.75h17.5v10.5a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6.75Z" />
      <path d="M3.25 10.25h17.5" />
      <path d="M6.75 14.25h3.5" />
    </Base>
  );
}

export function IconoTicket(p: Props) {
  return (
    <Base {...p}>
      <path d="M5.25 3.75h13.5v16.5l-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5V3.75Z" />
      <path d="M8.75 8.25h6.5" />
      <path d="M8.75 12.25h6.5" />
    </Base>
  );
}

export function IconoEfectivo(p: Props) {
  return (
    <Base {...p}>
      <rect x="2.75" y="6.75" width="18.5" height="10.5" rx="1" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M6.25 9.75v4.5M17.75 9.75v4.5" />
    </Base>
  );
}

export function IconoTarjeta(p: Props) {
  return (
    <Base {...p}>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="1" />
      <path d="M2.75 9.75h18.5" />
      <path d="M6.25 14.75h3.5" />
    </Base>
  );
}

export function IconoTransferencia(p: Props) {
  return (
    <Base {...p}>
      <path d="M4.25 8.75h13.5" />
      <path d="m14.75 5.75 3 3-3 3" />
      <path d="M19.75 15.25H6.25" />
      <path d="m9.25 12.25-3 3 3 3" />
    </Base>
  );
}

export function IconoPrenda(p: Props) {
  return (
    <Base {...p}>
      <path d="M9.25 3.75 12 6.25l2.75-2.5 5 2.75-1.75 3.5-1.75-.75v10.5a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5V9.25l-1.75.75L4.25 6.5l5-2.75Z" />
    </Base>
  );
}

export function IconoMas(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 5.25v13.5M5.25 12h13.5" />
    </Base>
  );
}

export function IconoMenos(p: Props) {
  return (
    <Base {...p}>
      <path d="M5.25 12h13.5" />
    </Base>
  );
}

export function IconoCerrar(p: Props) {
  return (
    <Base {...p}>
      <path d="m6.25 6.25 11.5 11.5M17.75 6.25 6.25 17.75" />
    </Base>
  );
}

export function IconoPalomita(p: Props) {
  return (
    <Base {...p}>
      <path d="m5.5 12.5 4.25 4.25L18.5 7.5" />
    </Base>
  );
}

export function IconoAlerta(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 4.25 2.75 19.75h18.5L12 4.25Z" />
      <path d="M12 10.25v3.5" />
      <circle cx="12" cy="16.75" r=".75" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconoPersona(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="8.25" r="3.5" />
      <path d="M4.75 19.75c0-3.25 3.25-5.5 7.25-5.5s7.25 2.25 7.25 5.5" />
    </Base>
  );
}

export function IconoReportes(p: Props) {
  return (
    <Base {...p}>
      <path d="M4.25 19.75V4.25" />
      <path d="M4.25 19.75h15.5" />
      <path d="M8.25 16.75v-5.5M12.25 16.75v-9.5M16.25 16.75v-3.5" />
    </Base>
  );
}

export function IconoHistorial(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.25V12l3.25 2" />
    </Base>
  );
}

export function IconoAjustes(p: Props) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M12 3.25v2.5M12 18.25v2.5M20.75 12h-2.5M5.75 12h-2.5M18.19 5.81l-1.77 1.77M7.58 16.42l-1.77 1.77M18.19 18.19l-1.77-1.77M7.58 7.58 5.81 5.81" />
    </Base>
  );
}

export function IconoImprimir(p: Props) {
  return (
    <Base {...p}>
      <path d="M7 9.25V4.75a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v4.5" />
      <path d="M7 16.5H5.25a1 1 0 0 1-1-1v-4.25a1 1 0 0 1 1-1h13.5a1 1 0 0 1 1 1v4.25a1 1 0 0 1-1 1H17" />
      <rect x="7" y="14" width="10" height="5.75" rx=".5" />
    </Base>
  );
}

export function IconoDescargar(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 4.25v10.5" />
      <path d="m8.25 11.25 3.75 3.5 3.75-3.5" />
      <path d="M4.75 18.25v1a.5.5 0 0 0 .5.5h13.5a.5.5 0 0 0 .5-.5v-1" />
    </Base>
  );
}

export function IconoEspera(p: Props) {
  return (
    <Base {...p}>
      <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="1" />
      <path d="M9.75 9.25v5.5M14.25 9.25v5.5" />
    </Base>
  );
}

export function IconoSinRed(p: Props) {
  return (
    <Base {...p}>
      <path d="M4.25 8.75a13 13 0 0 1 15.5 0" />
      <path d="M7.25 12.25a8.5 8.5 0 0 1 9.5 0" />
      <circle cx="12" cy="17.75" r=".75" fill="currentColor" stroke="none" />
      <path d="m4.75 4.75 14.5 14.5" />
    </Base>
  );
}

export function IconoEtiqueta(p: Props) {
  return (
    <Base {...p}>
      <path d="M11.25 3.75H19a1.25 1.25 0 0 1 1.25 1.25v7.75l-8.5 8.5-9-9 8.5-8.5Z" />
      <circle cx="16.25" cy="7.75" r="1.25" />
    </Base>
  );
}

export function IconoVolver(p: Props) {
  return (
    <Base {...p}>
      <path d="M19.75 12H4.25" />
      <path d="m10.25 5.75-6 6.25 6 6.25" />
    </Base>
  );
}

export function IconoCandado(p: Props) {
  return (
    <Base {...p}>
      <rect x="4.75" y="10.25" width="14.5" height="9.5" rx="1" />
      <path d="M8.25 10.25V7.5a3.75 3.75 0 0 1 7.5 0v2.75" />
    </Base>
  );
}
