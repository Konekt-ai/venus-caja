/**
 * Manejo de los codigos de modelo.
 *
 * En el cuaderno los codigos se escriben de formas distintas para la
 * misma prenda: "VD 194", "vd194", "VD-194". Y varios no traen letras
 * ("084", "004", "202"), donde el cero a la izquierda si importa
 * visualmente pero nadie lo teclea al buscar.
 *
 * Por eso cada modelo guarda dos cosas:
 *   codigo       lo que el cliente escribio, respetado tal cual ("VD 194")
 *   codigo_norm  la version comparable, sin espacios ni signos ("VD194")
 *
 * y ademas se guarda 'prefijo' + 'numero' por separado, que es lo que
 * permite que buscar "84" encuentre el modelo "084".
 */

/**
 * Marcas de acento combinantes: lo que normalize("NFD") separa de la
 * letra base. Se agrupa aqui para no repetir el rango en cada funcion.
 */
const ACENTOS = /[̀-ͯ]/g;

/** Quita acentos, pasa a mayusculas y elimina todo lo que no sea letra o digito. */
export function normalizarCodigo(entrada: string): string {
  return (entrada ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Igual que normalizarCodigo pero conserva espacios: sirve para texto libre. */
export function normalizarTexto(entrada: string): string {
  return (entrada ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Quita solo los acentos, conservando mayusculas/minusculas y signos. */
export function sinAcentos(entrada: string): string {
  return (entrada ?? "").normalize("NFD").replace(ACENTOS, "");
}

export type PartesCodigo = {
  /** Letras iniciales del codigo. "" cuando el codigo es solo numerico. */
  prefijo: string;
  /** Valor numerico del codigo, sin ceros a la izquierda. null si no trae digitos. */
  numero: number | null;
  /** Cualquier cosa que venga despues del numero, ej. la "B" de "VD194B". */
  sufijo: string;
};

/**
 * Parte un codigo en prefijo / numero / sufijo.
 *   "VD 194" -> { prefijo: "VD",  numero: 194, sufijo: ""  }
 *   "084"    -> { prefijo: "",    numero: 84,  sufijo: ""  }
 *   "VD194B" -> { prefijo: "VD",  numero: 194, sufijo: "B" }
 */
export function partirCodigo(entrada: string): PartesCodigo {
  const norm = normalizarCodigo(entrada);
  const m = norm.match(/^([A-Z]*)(\d*)([A-Z0-9]*)$/);
  if (!m) return { prefijo: norm, numero: null, sufijo: "" };
  // Los "?? ''" son lo unico que cambia respecto a la copia del sistema de
  // bodega: aqui TypeScript esta en modo estricto con los indices. El regex
  // garantiza los tres grupos, asi que el resultado es identico.
  const [, prefijo, digitos, sufijo] = m;
  return {
    prefijo: prefijo ?? "",
    numero: digitos ? parseInt(digitos, 10) : null,
    sufijo: sufijo ?? "",
  };
}

/**
 * Deja el codigo presentable para mostrarlo: "vd194" -> "VD 194".
 * Solo separa letras de numeros; no inventa ni quita ceros.
 */
export function formatearCodigo(entrada: string): string {
  const norm = normalizarCodigo(entrada);
  const m = norm.match(/^([A-Z]+)(\d.*)$/);
  return m ? `${m[1]} ${m[2]}` : norm;
}

/**
 * Valida un codigo capturado por el usuario.
 * Devuelve el error en lenguaje llano, o null si esta bien.
 */
export function validarCodigo(entrada: string): string | null {
  const norm = normalizarCodigo(entrada);
  if (!norm) return "Escribe el codigo del modelo.";
  if (norm.length > 20) return "El codigo es demasiado largo (maximo 20 caracteres).";
  if (!/\d/.test(norm)) return "El codigo debe llevar al menos un numero.";
  return null;
}
