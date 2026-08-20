/**
 * El dinero se guarda en centavos, siempre como numero entero.
 *
 * Con decimales, sumar 33.33 tres veces no da 100 y el corte de caja
 * termina desfasado por unos centavos que nadie sabe de donde salieron.
 * Con enteros eso no puede pasar.
 */

/** 65000 -> "$650.00" */
export function pesos(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(centavos));
  const enteros = Math.floor(abs / 100);
  const decimales = abs % 100;
  return `${signo}$${enteros.toLocaleString("es-MX")}.${String(decimales).padStart(2, "0")}`;
}

/** 65000 -> "650.00" (para campos de captura, sin el signo) */
export function pesosSimple(centavos: number): string {
  const abs = Math.abs(Math.round(centavos));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Convierte lo que la vendedora teclea a centavos.
 * Aguanta "650", "650.5", "650.50", "$650", "1,300".
 * Devuelve null si no es un numero valido.
 */
export function aCentavos(entrada: string): number | null {
  const limpio = (entrada ?? "").replace(/[$\s,]/g, "").trim();
  if (!limpio) return null;
  if (!/^\d*\.?\d*$/.test(limpio)) return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

/**
 * Reparte el descuento de la venta entre sus lineas.
 *
 * Se hace para que los reportes de "lo mas vendido por dinero" sumen
 * exactamente el total cobrado: si el descuento se dejara nada mas en la
 * cabecera, la suma de los productos siempre saldria mas alta que la
 * venta. Los centavos que no alcanzan a repartirse se le cargan a la
 * linea mas grande, que es donde menos se nota.
 */
export function repartirDescuento(importes: number[], descuento: number): number[] {
  const suma = importes.reduce((a, b) => a + b, 0);
  if (descuento <= 0 || suma <= 0) return importes.map(() => 0);

  const partes = importes.map((importe) => Math.floor((importe * descuento) / suma));
  const repartido = partes.reduce((a, b) => a + b, 0);
  let sobrante = descuento - repartido;

  if (sobrante > 0) {
    let mayor = 0;
    for (let i = 1; i < importes.length; i++) {
      if ((importes[i] ?? 0) > (importes[mayor] ?? 0)) mayor = i;
    }
    partes[mayor] = (partes[mayor] ?? 0) + sobrante;
    sobrante = 0;
  }
  return partes;
}
