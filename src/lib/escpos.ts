import { pesos } from "./dinero";
import { FIRMA_ESCPOS } from "./logoKonekt";
import type { TicketVenta } from "./ticket";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO } from "./tipos";

/**
 * El ticket en el idioma de las impresoras termicas (ESC/POS).
 *
 * Lo usa el SUNMI del tianguis: su impresora no la ve el navegador, asi que
 * el ticket no se puede mandar como pagina. Se arma aqui como bytes y se le
 * pasa a RawBT (ver rawbt.ts), que lo manda tal cual a la impresora.
 *
 * Es el mismo ticket que el de ticket.ts, con los mismos datos y en el mismo
 * orden, pero escrito para el rollo de 58 mm: 32 letras por renglon con la
 * letra normal de la impresora. Corre igual en el navegador que en las
 * pruebas: no toca la pantalla ni la base.
 */

/** Letras por renglon en el rollo de 58 mm (384 puntos, letra de 12 puntos). */
export const COLUMNAS = 32;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Quita acentos y todo lo que no sea ASCII. Las termicas traen cada una su
 * tabla de caracteres; con ASCII puro el ticket sale igual en todas, y un
 * "MARÍA" se lee bien como "MARIA". Lo que de plano no tenga equivalente
 * sale como "?" en vez de un garabato.
 */
export function aAscii(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[  ]/g, " ")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Parte un texto en renglones que quepan, cortando entre palabras. */
function partir(texto: string, ancho = COLUMNAS): string[] {
  const palabras = aAscii(texto).split(/\s+/).filter(Boolean);
  const renglones: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const pedazos = palabra.length > ancho ? palabra.match(new RegExp(`.{1,${ancho}}`, "g")) ?? [] : [palabra];
    for (const pedazo of pedazos) {
      if (!actual) actual = pedazo;
      else if (actual.length + 1 + pedazo.length <= ancho) actual += ` ${pedazo}`;
      else {
        renglones.push(actual);
        actual = pedazo;
      }
    }
  }
  if (actual) renglones.push(actual);
  return renglones.length ? renglones : [""];
}

/** Concepto a la izquierda y dinero a la derecha, en un renglon. */
function renglon(izquierda: string, derecha: string, ancho = COLUMNAS): string {
  const der = aAscii(derecha);
  const izq = aAscii(izquierda).slice(0, Math.max(0, ancho - der.length - 1));
  return izq + " ".repeat(Math.max(1, ancho - izq.length - der.length)) + der;
}

/** "2026-08-19 14:05:22" -> "19/08/2026 02:05 p.m." */
function fechaLegible(texto: string): string {
  const m = (texto || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return texto;
  const horas = Number(m[4]);
  const doce = horas % 12 === 0 ? 12 : horas % 12;
  return `${m[3]}/${m[2]}/${m[1]} ${String(doce).padStart(2, "0")}:${m[5]} ${horas < 12 ? "a.m." : "p.m."}`;
}

function nombreDePago(forma: string): string {
  const conocida = FORMAS_PAGO.find((f) => f === forma);
  return conocida ? NOMBRE_FORMA_PAGO[conocida] : forma;
}

/** Junta los bytes conforme se van escribiendo. */
class Escritor {
  private bytes: number[] = [];

  cmd(...valores: number[]): this {
    this.bytes.push(...valores);
    return this;
  }

  texto(texto: string): this {
    for (const letra of aAscii(texto)) this.bytes.push(letra.charCodeAt(0));
    return this;
  }

  linea(texto = ""): this {
    return this.texto(texto).cmd(LF);
  }

  centro(): this {
    return this.cmd(ESC, 0x61, 1);
  }

  izquierda(): this {
    return this.cmd(ESC, 0x61, 0);
  }

  negritas(prendidas: boolean): this {
    return this.cmd(ESC, 0x45, prendidas ? 1 : 0);
  }

  /** Tamano de letra: 1 normal, 2 al doble. Alto y ancho por separado. */
  tamano(ancho: 1 | 2, alto: 1 | 2): this {
    return this.cmd(GS, 0x21, ((ancho - 1) << 4) | (alto - 1));
  }

  /** Letra blanca sobre fondo negro, para la banda de CANCELADA. */
  invertido(prendido: boolean): this {
    return this.cmd(GS, 0x42, prendido ? 1 : 0);
  }

  /** Imagen de 1 bit (GS v 0): ancho en puntos multiplo de 8. */
  imagen(ancho: number, alto: number, datos: Uint8Array): this {
    const bytesPorRenglon = ancho / 8;
    this.cmd(GS, 0x76, 0x30, 0, bytesPorRenglon & 0xff, bytesPorRenglon >> 8, alto & 0xff, alto >> 8);
    for (const b of datos) this.bytes.push(b);
    return this;
  }

  regla(caracter = "-"): this {
    return this.linea(caracter.repeat(COLUMNAS));
  }

  listo(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function desdeBase64(base64: string): Uint8Array {
  const crudo = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const salida = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

/** Los bytes del ticket, listos para la impresora. */
export function ticketEscPos(datos: TicketVenta): Uint8Array {
  const v = datos.venta;
  const cancelada = v.estado === "cancelada";
  const e = new Escritor();

  // Reinicia la impresora: cualquier tamano o negrita que se haya quedado
  // prendido de un ticket anterior se apaga.
  e.cmd(ESC, 0x40);

  e.centro();
  e.imagen(FIRMA_ESCPOS.ancho, FIRMA_ESCPOS.alto, desdeBase64(FIRMA_ESCPOS.base64));
  e.linea();
  e.negritas(true).tamano(2, 2).linea("VENUS").tamano(1, 1).negritas(false);
  e.linea("Boutique");
  e.linea("TICKET DE VENTA");

  if (cancelada) {
    e.linea();
    e.negritas(true).invertido(true).tamano(2, 1).linea(" CANCELADA ").tamano(1, 1).invertido(false).negritas(false);
    e.linea("Esta venta no se cobro");
    if (v.motivo_cancelacion) for (const r of partir(`Motivo: ${v.motivo_cancelacion}`)) e.linea(r);
  }

  e.izquierda();
  e.regla("=");
  e.linea(renglon("FOLIO", v.folio));
  e.linea(renglon("FECHA", fechaLegible(v.fecha)));
  e.linea(renglon("ATENDIO", v.vendedora || "Sin registrar"));
  e.regla();

  for (const linea of datos.lineas) {
    e.negritas(true).linea(partir(`${linea.codigo} ${linea.descripcion}`)[0]).negritas(false);
    for (const resto of partir(`${linea.codigo} ${linea.descripcion}`).slice(1)) e.linea(resto);
    e.linea(renglon(`  ${linea.piezas} x ${pesos(linea.precio)}`, pesos(linea.importe)));
  }

  e.regla("=");
  e.linea(renglon("Subtotal", pesos(v.subtotal)));
  if (v.descuento > 0) e.linea(renglon("Descuento", `-${pesos(v.descuento)}`));
  e.negritas(true).tamano(1, 2).linea(renglon("TOTAL", pesos(v.total))).tamano(1, 1).negritas(false);
  e.linea(renglon("", `${v.piezas} ${v.piezas === 1 ? "pieza" : "piezas"}`));
  e.regla();

  for (const pago of datos.pagos) {
    e.negritas(true).linea(renglon(nombreDePago(pago.forma).toUpperCase(), pesos(pago.monto))).negritas(false);
    // Solo el efectivo pasa por el cajon: es el unico con recibido y cambio.
    if (pago.forma === "efectivo" && pago.recibido > 0) {
      e.linea(renglon("  Recibido", pesos(pago.recibido)));
      e.linea(renglon("  Cambio", pesos(pago.cambio)));
    }
  }
  if (v.nota) for (const r of partir(`Nota: ${v.nota}`)) e.linea(r);

  e.regla();
  e.centro();
  if (cancelada) e.negritas(true).linea("CANCELADA").negritas(false);
  e.linea("Gracias por su compra");
  e.linea("VENUS BOUTIQUE");

  // Unos renglones en blanco para que el ticket salga completo de la ranura
  // antes de arrancarlo: el V3 no tiene cortador.
  e.cmd(ESC, 0x64, 4);
  return e.listo();
}

/** Una venta inventada, para revisar la impresora sin cobrar nada. */
export function ventaDePrueba(): TicketVenta {
  return {
    venta: {
      folio: "PRUEBA",
      fecha: new Date().toISOString().replace("T", " ").slice(0, 19),
      vendedora: "PRUEBA DE IMPRESORA",
      subtotal: 65000,
      descuento: 0,
      total: 65000,
      piezas: 1,
      estado: "cobrada",
      motivo_cancelacion: "",
      nota: "Si esto se lee completo y derecho, la impresora quedo lista.",
    },
    lineas: [{ codigo: "VD 194", descripcion: "VESTIDO DE PRUEBA", piezas: 1, precio: 65000, importe: 65000 }],
    pagos: [{ forma: "efectivo", monto: 65000, recibido: 70000, cambio: 5000 }],
  };
}
