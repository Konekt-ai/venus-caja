"use server";

import { revalidatePath } from "next/cache";
import {
  formatearCodigo,
  normalizarCodigo,
  normalizarTexto,
  partirCodigo,
  sinAcentos,
  validarCodigo,
} from "@/lib/codigos";
import { getDb } from "@/lib/db";
import { aCentavos, pesos } from "@/lib/dinero";
import { esDuenio, sesionActual } from "@/lib/sesion";
import type { Resultado } from "@/lib/tipos";

/**
 * El catalogo y sus precios.
 *
 * El catalogo lo manda el sistema de bodega y NO trae precios: los pone
 * aqui el duenio. Por eso el precio vive en caja_precios y no como columna
 * de 'modelos': asi la caja nunca le cambia el esquema a la bodega.
 *
 * De la tabla 'modelos' esta pantalla solo toca la descripcion, la
 * categoria y el alta de codigos nuevos. Las piezas (existencia y
 * en_tienda) NO se tocan desde aqui por ningun motivo: esas se mueven
 * solas con los envios de la bodega y con las ventas del mostrador. Si se
 * pudieran teclear aqui, el dia que no cuadre el inventario nadie sabria
 * si fue un envio, una venta o un dedazo.
 */

/** Un precio mas alto que esto casi siempre es un cero de mas al teclear. */
const PRECIO_TOPE = 5000000;

/** Devuelve el aviso de por que no se puede, o null si si se puede. */
async function soloDuenio(): Promise<string | null> {
  const sesion = await sesionActual();
  if (!sesion) return "La sesion se cerro. Vuelve a entrar con tu PIN.";
  if (!esDuenio(sesion)) return "Solo el duenio puede cambiar precios y modelos.";
  return null;
}

/** El catalogo lo leen todas las pantallas (cobrar, etiquetas), no nada mas esta. */
function refrescar(): void {
  revalidatePath("/", "layout");
}

function leerPrecio(texto: string): { ok: true; centavos: number } | { ok: false; error: string } {
  const centavos = aCentavos(texto);
  if (centavos === null) {
    return {
      ok: false,
      error: `"${(texto ?? "").trim()}" no se entiende como precio. Escribelo asi: 650 o 650.50.`,
    };
  }
  if (centavos > PRECIO_TOPE) {
    return { ok: false, error: `${pesos(centavos)} se ve muy alto. Revisa que no le sobre un cero.` };
  }
  return { ok: true, centavos };
}

const SQL_PRECIO = `INSERT INTO caja_precios (modelo_id, precio) VALUES (?, ?)
   ON CONFLICT(modelo_id) DO UPDATE SET precio = excluded.precio,
                                        actualizado_en = datetime('now','localtime')`;

/** El precio que se tecleo en el renglon de la lista. */
export async function guardarPrecio(
  modeloId: number,
  texto: string
): Promise<Resultado<{ precio: number }>> {
  const negado = await soloDuenio();
  if (negado) return { ok: false, error: negado };

  const db = getDb();
  const modelo = db.prepare("SELECT codigo FROM modelos WHERE id = ?").get(modeloId) as
    | { codigo: string }
    | undefined;
  if (!modelo) return { ok: false, error: "Ese modelo ya no esta en el catalogo." };

  // Dejar el campo en blanco es como se deshace un precio mal puesto: el
  // modelo vuelve a la lista de "sin precio" en vez de quedarse en $0.00,
  // que en el mostrador se cobraria como prenda regalada.
  if (!texto.trim()) {
    db.prepare("DELETE FROM caja_precios WHERE modelo_id = ?").run(modeloId);
    refrescar();
    return { ok: true, mensaje: `Se quito el precio de ${modelo.codigo}.`, datos: { precio: 0 } };
  }

  const leido = leerPrecio(texto);
  if (!leido.ok) return { ok: false, error: leido.error };

  db.prepare(SQL_PRECIO).run(modeloId, leido.centavos);
  refrescar();
  return {
    ok: true,
    mensaje: `${modelo.codigo} quedo en ${pesos(leido.centavos)}.`,
    datos: { precio: leido.centavos },
  };
}

/**
 * El mismo precio a varios modelos de un jalon.
 *
 * En una boutique casi todos los vestidos de una linea valen igual;
 * capturarlos de uno en uno es media tarde perdida.
 */
export async function ponerPrecioVarios(
  ids: number[],
  texto: string
): Promise<Resultado<{ cuantos: number; precio: number }>> {
  const negado = await soloDuenio();
  if (negado) return { ok: false, error: negado };

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Primero palomea los modelos a los que les vas a poner precio." };
  }
  if (!texto.trim()) return { ok: false, error: "Escribe el precio que les vas a poner." };

  const leido = leerPrecio(texto);
  if (!leido.ok) return { ok: false, error: leido.error };
  if (leido.centavos <= 0) {
    return { ok: false, error: "Un precio de $0.00 no se puede cobrar. Escribe cuanto vale la prenda." };
  }

  const db = getDb();
  const existe = db.prepare("SELECT id FROM modelos WHERE id = ?");
  const poner = db.prepare(SQL_PRECIO);

  const aplicar = db.transaction((lista: number[]): number => {
    let cuantos = 0;
    for (const id of lista) {
      if (!existe.get(id)) continue;
      poner.run(id, leido.centavos);
      cuantos++;
    }
    return cuantos;
  });

  const cuantos = aplicar(ids);
  if (cuantos === 0) return { ok: false, error: "Esos modelos ya no estan en el catalogo." };

  refrescar();
  return {
    ok: true,
    mensaje: `${cuantos} ${cuantos === 1 ? "modelo quedo" : "modelos quedaron"} en ${pesos(leido.centavos)}.`,
    datos: { cuantos, precio: leido.centavos },
  };
}

/**
 * Alta de un modelo que todavia no esta en la bodega.
 *
 * Pasa seguido: la prenda nueva llega al mostrador antes de que la
 * capturen alla, y sin codigo no se puede cobrar. Nace con cero piezas de
 * los dos lados; las piezas de verdad entran cuando la bodega mande el
 * envio.
 */
export async function crearModelo(entrada: {
  codigo: string;
  descripcion: string;
  categoria: string;
  precio: string;
}): Promise<Resultado<{ id: number }>> {
  const negado = await soloDuenio();
  if (negado) return { ok: false, error: negado };

  const errorCodigo = validarCodigo(entrada.codigo);
  if (errorCodigo) return { ok: false, error: errorCodigo };

  const descripcion = normalizarTexto(entrada.descripcion);
  if (!descripcion) {
    return { ok: false, error: "Escribe como se llama la prenda, por ejemplo VESTIDO MIDI OLANES." };
  }

  const db = getDb();
  const codigoNorm = normalizarCodigo(entrada.codigo);

  const repetido = db.prepare("SELECT codigo, activo FROM modelos WHERE codigo_norm = ?").get(codigoNorm) as
    | { codigo: string; activo: number }
    | undefined;
  if (repetido) {
    return {
      ok: false,
      error:
        repetido.activo === 1
          ? `Ya hay un modelo con el codigo ${repetido.codigo}.`
          : `Ya hay un modelo con el codigo ${repetido.codigo}, pero esta dado de baja en la bodega. Pide que lo reactiven alla.`,
    };
  }

  let precio = 0;
  if (entrada.precio.trim()) {
    const leido = leerPrecio(entrada.precio);
    if (!leido.ok) return { ok: false, error: leido.error };
    precio = leido.centavos;
  }

  const { prefijo, numero } = partirCodigo(entrada.codigo);
  const codigo = formatearCodigo(entrada.codigo);

  const alta = db.transaction((): number => {
    const info = db
      .prepare(
        `INSERT INTO modelos
           (codigo, codigo_norm, prefijo, numero, descripcion, categoria,
            existencia, en_tienda, activo)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1)`
      )
      .run(codigo, codigoNorm, prefijo, numero, descripcion, normalizarTexto(entrada.categoria));

    const id = Number(info.lastInsertRowid);
    if (precio > 0) db.prepare(SQL_PRECIO).run(id, precio);
    return id;
  });

  const id = alta();
  refrescar();
  return {
    ok: true,
    mensaje: `Se dio de alta ${codigo}. Las piezas entran cuando la bodega mande el envio.`,
    datos: { id },
  };
}

/** La descripcion y la categoria, que a veces vienen mal escritas del catalogo. */
export async function editarModelo(
  modeloId: number,
  descripcion: string,
  categoria: string
): Promise<Resultado> {
  const negado = await soloDuenio();
  if (negado) return { ok: false, error: negado };

  const limpia = normalizarTexto(descripcion);
  if (!limpia) {
    return { ok: false, error: "Escribe como se llama la prenda, por ejemplo VESTIDO MIDI OLANES." };
  }

  const db = getDb();
  const modelo = db.prepare("SELECT codigo FROM modelos WHERE id = ?").get(modeloId) as
    | { codigo: string }
    | undefined;
  if (!modelo) return { ok: false, error: "Ese modelo ya no esta en el catalogo." };

  db.prepare(
    `UPDATE modelos
        SET descripcion = ?, categoria = ?, actualizado_en = datetime('now','localtime')
      WHERE id = ?`
  ).run(limpia, normalizarTexto(categoria), modeloId);

  refrescar();
  return { ok: true, mensaje: `${modelo.codigo} quedo como ${limpia}.` };
}

/* -------------------------------------------------------------------- */
/*  Importar el catalogo desde el CSV que exporta el sistema de bodega   */
/* -------------------------------------------------------------------- */

/**
 * El lector de CSV va aqui adentro y no en una libreria compartida porque
 * la caja no depende del proyecto de bodega: son dos programas que nada
 * mas comparten el archivo de la base.
 */

/**
 * Con que se separan las columnas. Se mira nada mas el encabezado, que es
 * el renglon donde no hay comas dentro de un campo: Excel en espanol
 * guarda con punto y coma y el mismo Excel en ingles con coma.
 */
function detectarSeparador(texto: string): string {
  const primera = texto.split("\n")[0] ?? "";
  let comas = 0;
  let puntoYComa = 0;
  let entreComillas = false;

  for (let i = 0; i < primera.length; i++) {
    const c = primera.charAt(i);
    if (c === '"') entreComillas = !entreComillas;
    else if (entreComillas) continue;
    else if (c === ",") comas++;
    else if (c === ";") puntoYComa++;
  }
  return puntoYComa > comas ? ";" : ",";
}

/** Convierte el texto del CSV en filas, respetando las comillas dobles. */
function leerCSV(texto: string): string[][] {
  // El BOM que Excel le pone al inicio a sus archivos. Si no se quita, la
  // primera columna se llamaria "﻿codigo" y no la reconoceriamos.
  const limpio = (texto ?? "").replace(/^﻿/, "");
  const separador = detectarSeparador(limpio);

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  // Se recorre con charAt y no con limpio[i] porque con noUncheckedIndexedAccess
  // el corchete devuelve string | undefined y aqui nunca sale del rango.
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio.charAt(i);

    if (entreComillas) {
      if (c === '"') {
        // Dos comillas seguidas dentro de un campo son una comilla de verdad.
        if (limpio.charAt(i + 1) === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c === "\r") {
      // El salto de verdad lo marca el \n; este se ignora.
    } else {
      campo += c;
    }
  }

  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** Cada quien le pone otro nombre a sus columnas; se reconocen todas. */
const ALIAS: Record<string, string[]> = {
  codigo: ["codigo", "modelo", "clave", "cod"],
  descripcion: ["descripcion", "nombre", "prenda", "producto"],
  categoria: ["categoria", "tipo", "linea"],
  tallas: ["tallas", "talla", "medidas"],
  colores: ["colores", "color"],
  tela: ["tela", "telas", "material"],
};

function mapearColumnas(encabezados: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};

  encabezados.forEach((bruto, i) => {
    // sinAcentos deja "descripción" como "descripcion", que es como viene
    // escrito el alias.
    const limpio = sinAcentos(bruto.trim().toLowerCase());
    for (const campo of Object.keys(ALIAS)) {
      if (mapa[campo] !== undefined) continue;
      const nombres = ALIAS[campo] ?? [];
      if (nombres.some((n) => limpio === n)) mapa[campo] = i;
    }
  });

  return mapa;
}

export type ResumenImportacion = {
  creados: number;
  actualizados: number;
  omitidos: { fila: number; motivo: string }[];
};

/**
 * Lee el archivo y dice que pasaria, o lo aplica.
 *
 * Con soloRevisar en true no escribe nada: el duenio ve cuantos se crean y
 * cuantos se actualizan antes de aceptar. Los modelos se empatan por
 * codigo_norm, asi que el "vd 194" del archivo cae en el mismo "VD 194"
 * que ya existe y no lo duplica.
 */
export async function importarCatalogo(
  contenido: string,
  soloRevisar: boolean
): Promise<Resultado<ResumenImportacion>> {
  const negado = await soloDuenio();
  if (negado) return { ok: false, error: negado };

  const filas = leerCSV(contenido);
  const encabezados = filas[0];
  if (!encabezados || filas.length < 2) {
    return {
      ok: false,
      error:
        "El archivo no trae renglones debajo del encabezado. Revisa que sea el CSV que exporta el sistema de bodega.",
    };
  }

  const columnas = mapearColumnas(encabezados);
  if (columnas.codigo === undefined) {
    return {
      ok: false,
      error:
        "No encontre la columna del codigo. El primer renglon del archivo tiene que decir 'codigo' en alguna columna.",
    };
  }

  const db = getDb();
  const resumen: ResumenImportacion = { creados: 0, actualizados: 0, omitidos: [] };

  const dato = (fila: string[], campo: string): string => {
    const i = columnas[campo];
    return i === undefined ? "" : (fila[i] ?? "").trim();
  };

  const buscarPorCodigo = db.prepare("SELECT id FROM modelos WHERE codigo_norm = ?");

  // Ni existencia ni en_tienda aparecen en el UPDATE: las piezas son de la
  // bodega. Y los campos vacios del archivo no borran lo que ya habia.
  const actualizar = db.prepare(
    `UPDATE modelos SET
       codigo = @codigo, prefijo = @prefijo, numero = @numero,
       descripcion = CASE WHEN @descripcion <> '' THEN @descripcion ELSE descripcion END,
       categoria   = CASE WHEN @categoria   <> '' THEN @categoria   ELSE categoria   END,
       tallas      = CASE WHEN @tallas      <> '' THEN @tallas      ELSE tallas      END,
       colores     = CASE WHEN @colores     <> '' THEN @colores     ELSE colores     END,
       tela        = CASE WHEN @tela        <> '' THEN @tela        ELSE tela        END,
       activo = 1,
       actualizado_en = datetime('now','localtime')
     WHERE id = @id`
  );

  const insertar = db.prepare(
    `INSERT INTO modelos
       (codigo, codigo_norm, prefijo, numero, descripcion, categoria,
        tallas, colores, tela, existencia, en_tienda, activo)
     VALUES (@codigo, @codigo_norm, @prefijo, @numero, @descripcion, @categoria,
             @tallas, @colores, @tela, 0, 0, 1)`
  );

  // Un codigo repetido dentro del mismo archivo cuenta como actualizado las
  // veces que vuelva a salir, que es justo lo que termina pasando.
  const vistos = new Set<string>();

  const pasar = (): void => {
    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i];
      if (!fila) continue;
      const renglon = i + 1;

      const codigoCrudo = dato(fila, "codigo");
      const errorCodigo = validarCodigo(codigoCrudo);
      if (errorCodigo) {
        resumen.omitidos.push({ fila: renglon, motivo: errorCodigo });
        continue;
      }

      // El codigo se guarda tal como viene, sin quitarle los ceros de
      // adelante: "084" y "84" son dos prendas distintas en el cuaderno.
      const codigoNorm = normalizarCodigo(codigoCrudo);
      const { prefijo, numero } = partirCodigo(codigoCrudo);

      const campos = {
        codigo: codigoCrudo.trim().toUpperCase(),
        codigo_norm: codigoNorm,
        prefijo,
        numero,
        descripcion: normalizarTexto(dato(fila, "descripcion")),
        categoria: normalizarTexto(dato(fila, "categoria")),
        tallas: normalizarTexto(dato(fila, "tallas")),
        colores: normalizarTexto(dato(fila, "colores")),
        tela: normalizarTexto(dato(fila, "tela")),
      };

      const existente = buscarPorCodigo.get(codigoNorm) as { id: number } | undefined;

      if (existente || vistos.has(codigoNorm)) {
        if (!soloRevisar && existente) actualizar.run({ ...campos, id: existente.id });
        resumen.actualizados++;
      } else {
        if (!soloRevisar) insertar.run(campos);
        resumen.creados++;
      }
      vistos.add(codigoNorm);
    }
  };

  try {
    if (soloRevisar) {
      // La revision no escribe nada: nada mas cuenta lo que pasaria.
      pasar();
      return { ok: true, datos: resumen };
    }
    db.transaction(pasar)();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }

  refrescar();

  const partes: string[] = [];
  if (resumen.creados) partes.push(`${resumen.creados} nuevos`);
  if (resumen.actualizados) partes.push(`${resumen.actualizados} actualizados`);
  if (resumen.omitidos.length) partes.push(`${resumen.omitidos.length} saltados`);

  return {
    ok: true,
    datos: resumen,
    mensaje: partes.length ? `Catalogo al dia: ${partes.join(", ")}.` : "No habia nada que importar.",
  };
}
