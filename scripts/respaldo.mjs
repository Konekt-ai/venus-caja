/**
 * Respaldo de la base de Venus.
 *
 * Se usa VACUUM INTO y no una copia del archivo porque la base corre en modo
 * WAL: lo ultimo que se cobro vive en venus.db-wal, no en venus.db. Copiar el
 * archivo a mano se llevaria una base a medias, justo las ventas mas recientes.
 * VACUUM INTO le pide a SQLite que escriba una base completa y ya compactada.
 *
 *   node scripts/respaldo.mjs [--destino <carpeta>]
 *
 * Se puede correr con la caja encendida: no estorba ni bloquea el cobro.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// Todo se resuelve contra la carpeta del proyecto y no contra la carpeta
// donde se paro el usuario: la tarea programada de Windows arranca desde
// C:\Windows\system32 y ahi no hay ni .env.local ni node_modules.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const DIAS_QUE_SE_GUARDAN = 30;

/** Parser de .env: una linea es clave=valor, lo que empieza con # es comentario. */
function leerEnv(archivo) {
  const valores = {};
  if (!fs.existsSync(archivo)) return valores;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    const corte = limpia.indexOf("=");
    if (limpia.startsWith("#") || corte < 1) continue;
    valores[limpia.slice(0, corte).trim()] = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return valores;
}

function argumento(nombre) {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function dosDigitos(n) {
  return String(n).padStart(2, "0");
}

/** venus-respaldo-2026-08-19-2230.db */
function nombreDelRespaldo(cuando) {
  const f = [cuando.getFullYear(), dosDigitos(cuando.getMonth() + 1), dosDigitos(cuando.getDate())].join("-");
  const h = dosDigitos(cuando.getHours()) + dosDigitos(cuando.getMinutes());
  return `venus-respaldo-${f}-${h}.db`;
}

function tamanioLegible(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function borrarLosViejos(carpeta) {
  const limite = Date.now() - DIAS_QUE_SE_GUARDAN * 24 * 60 * 60 * 1000;
  let borrados = 0;
  for (const archivo of fs.readdirSync(carpeta)) {
    if (!/^venus-respaldo-.+\.db$/.test(archivo)) continue;
    const completa = path.join(carpeta, archivo);
    if (fs.statSync(completa).mtimeMs < limite) {
      fs.unlinkSync(completa);
      borrados += 1;
    }
  }
  return borrados;
}

function main() {
  const env = leerEnv(path.join(RAIZ, ".env.local"));
  // La variable de entorno gana sobre el .env.local: asi se puede respaldar
  // otra base sin editar la configuracion de la instalacion.
  const configurada = (process.env.VENUS_DB || env.VENUS_DB || "").trim();
  const rutaBase = path.resolve(
    configurada || path.join(RAIZ, "..", "venus-gestion", "data", "venus.db")
  );

  if (!fs.existsSync(rutaBase)) {
    console.error("No se encontro la base de datos en:");
    console.error("  " + rutaBase);
    console.error("");
    console.error("Abre el archivo .env.local y revisa la linea VENUS_DB.");
    process.exit(1);
  }

  const carpeta = path.resolve(argumento("--destino") || path.join(RAIZ, "respaldos"));
  fs.mkdirSync(carpeta, { recursive: true });

  const destino = path.join(carpeta, nombreDelRespaldo(new Date()));
  // VACUUM INTO se niega a escribir sobre un archivo que ya existe, y dos
  // respaldos en el mismo minuto caerian con el mismo nombre.
  if (fs.existsSync(destino)) fs.unlinkSync(destino);

  console.log("Respaldando la base de Venus");
  console.log("  Base:     " + rutaBase);
  console.log("  Respaldo: " + destino);
  console.log("");

  const empezo = Date.now();
  const db = new Database(rutaBase, { fileMustExist: true });
  try {
    // Si la bodega o la caja estan escribiendo en este momento, se espera
    // su turno en lugar de tronar.
    db.pragma("busy_timeout = 15000");
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  // Se abre el respaldo recien hecho para confirmar que sirve. Un respaldo
  // que nadie probo no es un respaldo.
  const copia = new Database(destino, { readonly: true, fileMustExist: true });
  const revision = copia.pragma("quick_check", { simple: true });
  // Las tablas de la caja las crea la caja la primera vez que se enciende,
  // asi que en una instalacion recien hecha todavia no existen.
  const cuenta = (tabla) => {
    const hay = copia
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tabla);
    if (!hay) return null;
    return copia.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
  };
  const modelos = cuenta("modelos");
  const ventas = cuenta("caja_ventas");
  copia.close();

  if (revision !== "ok") {
    console.error("El respaldo salio danado. No se borro nada, revisa el disco.");
    process.exit(1);
  }

  const peso = fs.statSync(destino).size;
  const segundos = ((Date.now() - empezo) / 1000).toFixed(1);

  console.log("Listo. El respaldo quedo bien.");
  console.log(`  Peso:     ${tamanioLegible(peso)}`);
  console.log(`  Tardo:    ${segundos} segundos`);
  const inventario = modelos === null ? "sin tabla de modelos" : `${modelos} modelos`;
  const cobros = ventas === null ? "la caja todavia no ha cobrado" : `${ventas} ventas de caja`;
  console.log(`  Contiene: ${inventario} y ${cobros}`);

  const borrados = borrarLosViejos(carpeta);
  console.log("");
  if (borrados > 0) {
    console.log(`Se borraron ${borrados} respaldo(s) de mas de ${DIAS_QUE_SE_GUARDAN} dias.`);
  } else {
    console.log(`No habia respaldos de mas de ${DIAS_QUE_SE_GUARDAN} dias que borrar.`);
  }
  const quedan = fs.readdirSync(carpeta).filter((a) => /^venus-respaldo-.+\.db$/.test(a)).length;
  console.log(`Quedan ${quedan} respaldo(s) guardados en la carpeta.`);
}

try {
  main();
} catch (error) {
  console.error("No se pudo hacer el respaldo.");
  console.error("  " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
