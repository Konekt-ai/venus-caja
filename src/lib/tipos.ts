/** Formas de pago que se aceptan en el mostrador. */
export const FORMAS_PAGO = ["efectivo", "tarjeta", "transferencia"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const NOMBRE_FORMA_PAGO: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

/** Un modelo del catalogo, ya con lo que la caja necesita para cobrarlo. */
export type ModeloCaja = {
  id: number;
  codigo: string;
  codigo_norm: string;
  prefijo: string;
  numero: number | null;
  descripcion: string;
  categoria: string;
  precio: number;
  en_tienda: number;
  barras: string[];
};

/** Un renglon de la venta que se esta cobrando. */
export type LineaVenta = {
  modelo_id: number;
  codigo: string;
  descripcion: string;
  piezas: number;
  /** Lo que se cobra por pieza en esta venta. */
  precio: number;
  /**
   * El precio registrado de la prenda cuando se agrego. Si es distinto de
   * 'precio', la vendedora lo cambio solo para esta venta. Las ventas que
   * se dejaron en espera antes de esto no lo traen.
   */
  precio_lista?: number;
};

export type TipoDescuento = "" | "porcentaje" | "pesos";

/** Una venta lista para guardarse. Es lo que viaja del navegador al servidor. */
export type VentaParaGuardar = {
  id: string;
  /**
   * El folio lo propone la caja para poder imprimir el ticket de inmediato,
   * aunque no haya internet. Si al llegar al servidor ese numero ya estaba
   * ocupado, el servidor asigna el siguiente libre y lo devuelve.
   */
  folio?: string;
  vendedora_id: number | null;
  lineas: LineaVenta[];
  descuento_tipo: TipoDescuento;
  descuento_valor: number;
  forma_pago: FormaPago;
  recibido: number;
  nota: string;
  /** Cuando se cobro de verdad. Importa para las ventas que se hicieron sin internet. */
  fecha_local: string;
};

export type Resultado<T = undefined> =
  | { ok: true; mensaje?: string; datos?: T }
  | { ok: false; error: string };
