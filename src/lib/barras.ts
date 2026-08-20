import { normalizarCodigo } from "./codigos";

/**
 * Code 128, escrito a mano.
 *
 * La tienda no compra etiquetas: se las imprime ella. Se eligio Code 128
 * porque cualquier lector barato lo lee sin configurarle nada, aguanta
 * letras y numeros (los codigos son "VD 194", no solo digitos) y sale
 * corto: un codigo de cinco caracteres cabe en 35 mm, que es lo que hay de
 * ancho util en una etiqueta chica.
 *
 * Todo es SVG. Nada de canvas ni de imagenes: una barra dibujada como
 * rectangulo se imprime con el filo exacto que le dio la impresora, y una
 * imagen de 96 puntos por pulgada estirada a 300 sale con los bordes
 * comidos y el lector duda.
 */

/**
 * Los 107 patrones del simbolo.
 *
 * Cada renglon son seis numeros: barra, espacio, barra, espacio, barra,
 * espacio, y cada numero dice cuantos modulos (la barra mas delgada) mide
 * esa raya. Los seis siempre suman 11. El ultimo, el de fin, trae siete
 * numeros y suma 13 porque cierra con una barra de sobra.
 *
 * La tabla es del estandar; no se puede deducir. Lo que si se puede
 * comprobar, y se comprueba en la prueba, es que ningun patron se repita,
 * que todos sumen 11 y que las barras de cada patron sumen un numero par:
 * esa paridad es lo que usa el lector para saber que no se equivoco.
 */
const PATRONES: readonly string[] = [
  // 0
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  // 10
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  // 20
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  // 30
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  // 40
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  // 50
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  // 60
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  // 70
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  // 80
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  // 90
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  // 100
  "114131", "311141", "411131",
  // 103 arranque juego A, 104 arranque juego B, 105 arranque juego C, 106 fin
  "211412", "211214", "211232", "2331112",
];

const INICIO_B = 104;
const INICIO_C = 105;
const FIN = 106;

/** Juego B: letras, numeros y signos. Juego C: pares de digitos, sale a la mitad de largo. */
export type Juego = "B" | "C";

/**
 * Margen mudo: los diez modulos en blanco que el lector necesita a cada
 * lado para saber donde empieza el codigo. Sin ellos, una etiqueta pegada
 * junto a otra no se lee.
 */
export const MARGEN_MODULOS = 10;

export type CodigoBarras = {
  texto: string;
  juego: Juego;
  /** Arranque, datos, digito de control y fin. */
  valores: number[];
  /** Digito de control (modulo 103). Va aparte por si hay que revisarlo. */
  control: number;
  /** Anchos alternados empezando por barra: [barra, espacio, barra, ...]. */
  anchos: number[];
  /** Cuanto mide el simbolo en modulos, sin contar los margenes mudos. */
  modulos: number;
};

/**
 * Revisa si un texto se puede volver codigo de barras.
 * Devuelve el problema en llano, o null si esta bien.
 */
export function revisarCodigoBarras(texto: string): string | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return "Falta el codigo.";
  if (limpio.length > 20) return "El codigo es demasiado largo para la etiqueta (maximo 20 caracteres).";
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio.charCodeAt(i);
    if (c < 32 || c > 126) return `El codigo trae un caracter que el lector no entiende: ${limpio[i]}`;
  }
  return null;
}

/** Los digitos de un patron, ya como numeros. */
function anchosDe(valor: number): number[] {
  const patron = PATRONES[valor];
  if (patron === undefined) throw new Error(`No existe el patron ${valor} de Code 128.`);
  const salida: number[] = [];
  for (let i = 0; i < patron.length; i++) salida.push(Number(patron[i]));
  return salida;
}

/**
 * Convierte el texto a los valores del simbolo, sin arranque ni control.
 * En juego C cada valor son dos digitos juntos: "19" vale 19.
 */
function valoresDeTexto(texto: string, juego: Juego): number[] {
  const salida: number[] = [];
  if (juego === "C") {
    for (let i = 0; i < texto.length; i += 2) salida.push(Number(texto.slice(i, i + 2)));
    return salida;
  }
  for (let i = 0; i < texto.length; i++) salida.push(texto.charCodeAt(i) - 32);
  return salida;
}

/**
 * Elige el juego. El C solo entra cuando el codigo es todo digitos y de
 * largo par, que es cuando de verdad conviene: cada dos digitos ocupan lo
 * que uno solo en juego B, asi que el simbolo sale a la mitad de ancho y en
 * la etiqueta las barras quedan mas gordas y mas faciles de leer. Con largo
 * impar habria que mezclar los dos juegos y no vale la pena la maroma.
 */
export function juegoPara(texto: string): Juego {
  return /^\d+$/.test(texto) && texto.length % 2 === 0 ? "C" : "B";
}

/**
 * Codifica el texto. Truena con un mensaje llano si el texto no sirve, asi
 * que hay que pasarlo antes por revisarCodigoBarras().
 */
export function codificarCode128(texto: string): CodigoBarras {
  const limpio = (texto ?? "").trim();
  const problema = revisarCodigoBarras(limpio);
  if (problema) throw new Error(problema);

  const juego = juegoPara(limpio);
  const inicio = juego === "C" ? INICIO_C : INICIO_B;
  const datos = valoresDeTexto(limpio, juego);

  // El digito de control: el arranque pesa 1 y cada dato pesa su posicion.
  let suma = inicio;
  for (let i = 0; i < datos.length; i++) suma += (datos[i] ?? 0) * (i + 1);
  const control = suma % 103;

  const valores = [inicio, ...datos, control, FIN];
  const anchos: number[] = [];
  for (const valor of valores) anchos.push(...anchosDe(valor));

  let modulos = 0;
  for (const ancho of anchos) modulos += ancho;

  return { texto: limpio, juego, valores, control, anchos, modulos };
}

export type OpcionesSvg = {
  /** Cuanto mide en milimetros la barra mas delgada. Menos de 0.25 ya no lo lee un lector barato. */
  modulo?: number;
  /** Alto de las barras, en milimetros. */
  alto?: number;
  color?: string;
};

/**
 * El SVG completo como cadena, listo para meterse en una etiqueta o en un
 * ticket. El viewBox va en modulos y el ancho en milimetros: asi las barras
 * guardan proporciones exactas sin importar a que tamano se estire.
 */
export function svgCode128(texto: string, opciones: OpcionesSvg = {}): string {
  const modulo = opciones.modulo ?? 0.4;
  const alto = opciones.alto ?? 12;
  const color = opciones.color ?? "#000000";

  const codigo = codificarCode128(texto);
  const total = codigo.modulos + MARGEN_MODULOS * 2;

  const rectangulos: string[] = [];
  let x = MARGEN_MODULOS;
  for (let i = 0; i < codigo.anchos.length; i++) {
    const ancho = codigo.anchos[i] ?? 0;
    // Los pares son barra; los impares son espacio en blanco y no se dibujan.
    if (i % 2 === 0) {
      rectangulos.push(`<rect x="${x}" y="0" width="${ancho}" height="100" fill="${color}"/>`);
    }
    x += ancho;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(total * modulo).toFixed(2)}mm"` +
    ` height="${alto}mm" viewBox="0 0 ${total} 100" preserveAspectRatio="none"` +
    ` shape-rendering="crispEdges">${rectangulos.join("")}</svg>`
  );
}

/**
 * El codigo de barras que le toca a un modelo: su propio codigo, sin
 * espacios ni guiones. "VD 194" queda "VD194".
 *
 * A proposito no se inventa un consecutivo. Si la etiqueta se despega, se
 * arruga o el lector no dispara, la vendedora ve "VD 194" escrito en grande
 * en la misma etiqueta y lo teclea; con un numero inventado tendria que
 * averiguar primero a que prenda pertenece el 100347. Ademas es el mismo
 * codigo que la bodega trae en el cuaderno, asi que nadie se aprende dos
 * numeros para la misma prenda.
 */
export function codigoBarrasDeModelo(codigo: string): string {
  return normalizarCodigo(codigo);
}
