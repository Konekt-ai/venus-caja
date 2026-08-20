import { normalizarCodigo, normalizarTexto, partirCodigo } from "./codigos";
import type { ModeloCaja } from "./tipos";

/**
 * La busqueda del mostrador.
 *
 * Corre en el navegador sobre el catalogo entero (unos 130 modelos), no en
 * el servidor: asi cada tecla responde al instante y la caja sigue
 * encontrando prendas aunque se caiga el internet.
 *
 * El orden de resultados es el MISMO que usa el sistema de bodega
 * (consultas.ts, el CASE de relevancia), para que buscar "84" no de una
 * cosa en la bodega y otra en la caja. Lo unico que se agrega adelante es
 * el codigo de barras: si el lector disparo, eso gana sobre todo lo demas.
 */

export type Coincidencia = { modelo: ModeloCaja; relevancia: number };

/** Que tan bien le queda un modelo a lo que se tecleo. Menor es mejor. */
function relevancia(modelo: ModeloCaja, consulta: Consulta): number | null {
  if (consulta.barras && modelo.barras.includes(consulta.barras)) return -1;
  if (!consulta.texto) return null;

  const { exacto, numero, prefijo, texto } = consulta;

  if (exacto && modelo.codigo_norm === exacto) return 0;
  if (numero !== null && modelo.numero === numero && modelo.prefijo === prefijo) return 1;
  if (exacto && modelo.codigo_norm.startsWith(exacto)) return 2;
  if (numero !== null && modelo.numero === numero) return 3;

  if (exacto && modelo.codigo_norm.includes(exacto)) return 4;

  const enTexto = `${modelo.descripcion} ${modelo.categoria}`;
  if (texto && normalizarTexto(enTexto).includes(texto)) return 4;

  return null;
}

type Consulta = {
  texto: string;
  exacto: string;
  numero: number | null;
  prefijo: string;
  barras: string;
};

/**
 * Separa la cantidad del codigo: "3*vd194" o "3x84" son tres piezas.
 * Es el atajo que evita tener que agregar la misma prenda tres veces.
 */
export function partirCantidad(entrada: string): { cantidad: number; resto: string } {
  const m = (entrada ?? "").trim().match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
  if (!m) return { cantidad: 1, resto: (entrada ?? "").trim() };
  const cantidad = parseInt(m[1] ?? "1", 10);
  if (!Number.isFinite(cantidad) || cantidad < 1) return { cantidad: 1, resto: (entrada ?? "").trim() };
  return { cantidad, resto: (m[2] ?? "").trim() };
}

function prepararConsulta(entrada: string): Consulta {
  const bruto = (entrada ?? "").trim();
  const partes = partirCodigo(bruto);
  return {
    texto: normalizarTexto(bruto),
    exacto: normalizarCodigo(bruto),
    numero: partes.numero,
    prefijo: partes.prefijo,
    // El lector teclea el codigo tal cual y manda Enter; no lo normalizamos
    // porque una etiqueta puede traer guiones que si forman parte del codigo.
    barras: bruto,
  };
}

export function buscar(catalogo: ModeloCaja[], entrada: string, limite = 8): ModeloCaja[] {
  const consulta = prepararConsulta(entrada);
  if (!consulta.texto && !consulta.exacto) return [];

  const encontrados: Coincidencia[] = [];
  for (const modelo of catalogo) {
    const r = relevancia(modelo, consulta);
    if (r !== null) encontrados.push({ modelo, relevancia: r });
  }

  encontrados.sort((a, b) => {
    if (a.relevancia !== b.relevancia) return a.relevancia - b.relevancia;
    if (a.modelo.prefijo !== b.modelo.prefijo) return a.modelo.prefijo < b.modelo.prefijo ? -1 : 1;
    return (a.modelo.numero ?? 0) - (b.modelo.numero ?? 0);
  });

  return encontrados.slice(0, limite).map((c) => c.modelo);
}

/**
 * Si los dos primeros resultados empatan en que tan bien le quedan a lo
 * tecleado, Enter no agrega nada y obliga a elegir.
 *
 * Es a proposito: hoy ningun numero se repite entre lineas, pero el dia que
 * exista un 194 de vestidos y otro de conjuntos, prefiero perder un segundo
 * a que a la clienta le cobren la prenda equivocada.
 */
export function hayEmpate(catalogo: ModeloCaja[], entrada: string): boolean {
  const consulta = prepararConsulta(entrada);
  if (!consulta.texto && !consulta.exacto) return false;

  const relevancias: number[] = [];
  for (const modelo of catalogo) {
    const r = relevancia(modelo, consulta);
    if (r !== null) relevancias.push(r);
  }
  if (relevancias.length < 2) return false;
  relevancias.sort((a, b) => a - b);
  // Un codigo exacto o un codigo de barras nunca empatan: son unicos.
  if ((relevancias[0] ?? 9) <= 0) return false;
  return relevancias[0] === relevancias[1];
}
