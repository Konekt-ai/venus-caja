/**
 * Donde esta cobrando la caja: en la tienda o en el tianguis.
 *
 * Es el mismo programa en los dos lados. Lo que cambia es de que cuenta de
 * piezas se descuenta (en_tienda o en_tianguis, las columnas de la bodega),
 * que movimiento queda en el historial y con que letra empiezan los folios.
 * El lugar lo decide la cuenta con la que se entra: VENTAS es la tienda y
 * TIANGUIS es el tianguis.
 *
 * Este archivo no toca la base: lo usan igual la pantalla y el servidor.
 */

export type Lugar = "tienda" | "tianguis";

export const LUGARES: Lugar[] = ["tienda", "tianguis"];

/** "la tienda", "el tianguis": para los avisos. */
export const EL_LUGAR: Record<Lugar, string> = {
  tienda: "la tienda",
  tianguis: "el tianguis",
};

/**
 * Donde vende una vendedora: en uno de los dos lugares o en los dos. Al
 * cobrar solo aparecen las que venden en ese lugar.
 */
export type VendeEn = Lugar | "ambos";

export const OPCIONES_VENDE_EN: { valor: VendeEn; nombre: string }[] = [
  { valor: "tienda", nombre: "Tienda" },
  { valor: "tianguis", nombre: "Tianguis" },
  { valor: "ambos", nombre: "Los dos" },
];

export function esVendeEn(valor: unknown): valor is VendeEn {
  return valor === "tienda" || valor === "tianguis" || valor === "ambos";
}

export function esLugar(valor: unknown): valor is Lugar {
  return valor === "tienda" || valor === "tianguis";
}

/**
 * Los folios del tianguis empiezan con T (T1-000001) y los de la tienda con
 * cualquier otra letra (C1-000001). Asi se sabe de donde es un ticket con
 * solo verlo, y la bodega los separa igual.
 */
export function lugarDeCaja(caja: string): Lugar {
  return caja.trim().toUpperCase().startsWith("T") ? "tianguis" : "tienda";
}
