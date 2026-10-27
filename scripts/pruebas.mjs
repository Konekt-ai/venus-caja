/**
 * Pruebas de la caja.
 *
 *   npm test
 *
 * No son pruebas de juguete: corren contra una COPIA de la base de datos
 * real de la bodega, con su catalogo de verdad, y cobran ventas llamando a
 * las mismas funciones que usa la pantalla de cobrar. Lo que se comprueba
 * es lo que no se ve a simple vista: que el inventario de la tienda baje
 * exactamente lo vendido, que la existencia de la bodega no se mueva ni un
 * numero, que un reintento no cobre dos veces y que el corte cuadre.
 *
 * La base real NUNCA se abre para escribir: se copia a una carpeta
 * temporal y todo apunta ahi con VENUS_DB. Al terminar, la copia se borra.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** La base de la bodega. VENUS_DB_REAL la mueve si esta instalada en otro lado. */
const BASE_REAL = process.env.VENUS_DB_REAL
  ? path.resolve(process.env.VENUS_DB_REAL)
  : path.resolve(RAIZ, "..", "venus-gestion", "data", "venus.db");

/**
 * El codigo de la app importa sin extension ("./esquema"), como es normal en
 * Next; Node exige la extension exacta. Este resolvedor reintenta con .ts
 * para poder probar los modulos reales sin ensuciarlos. Va en una URL de
 * datos y no en un archivo aparte para que las pruebas sean un solo archivo.
 */
const CARGADOR_TS =
  "data:text/javascript," +
  encodeURIComponent(
    [
      "export async function resolve(especificador, contexto, siguiente) {",
      "  try { return await siguiente(especificador, contexto); } catch (error) {",
      "    const relativo = especificador.startsWith('./') || especificador.startsWith('../');",
      "    const ultimo = especificador.slice(especificador.lastIndexOf('/') + 1);",
      "    if (relativo && !ultimo.includes('.')) {",
      "      for (const extension of ['.ts', '.tsx', '/index.ts']) {",
      "        try { return await siguiente(especificador + extension, contexto); } catch {}",
      "      }",
      "    }",
      "    throw error;",
      "  }",
      "}",
      "export async function load(url, contexto, siguiente) {",
      "  if (url.endsWith('.ts') || url.endsWith('.tsx')) {",
      "    return siguiente(url, { ...contexto, format: 'module-typescript' });",
      "  }",
      "  return siguiente(url, contexto);",
      "}",
    ].join("\n")
  );

register(CARGADOR_TS);

// --- La copia de la base ------------------------------------------------
if (!fs.existsSync(BASE_REAL)) {
  console.error(
    "\nNo se encontro la base de datos de la bodega en:\n" +
      BASE_REAL +
      "\n\nLas pruebas necesitan el catalogo de verdad. Si la bodega esta en otra " +
      "carpeta, corre las pruebas asi:\n  VENUS_DB_REAL=C:/ruta/a/venus.db npm test\n"
  );
  process.exit(1);
}

const CARPETA = fs.mkdtempSync(path.join(os.tmpdir(), "venus-caja-pruebas-"));
const BASE_COPIA = path.join(CARPETA, "venus.db");

// Se copia tambien el -wal: ahi viven los ultimos cambios de la bodega que
// todavia no pasan al archivo principal. Copiar solo el .db daria un
// catalogo viejo. El -shm no hace falta, SQLite lo rehace solo.
for (const sufijo of ["", "-wal"]) {
  if (fs.existsSync(BASE_REAL + sufijo)) fs.copyFileSync(BASE_REAL + sufijo, BASE_COPIA + sufijo);
}

// Una caja instalada antes de que existiera precio_lista tiene la tabla de
// renglones sin esa columna. Si la copia todavia no trae tablas de la caja,
// se deja la de renglones como era antes: asi cada corrida comprueba que la
// caja nueva sabe ponerse al dia sola sobre una base vieja.
{
  const { default: Database } = await import("better-sqlite3");
  const vieja = new Database(BASE_COPIA);
  const yaHay = vieja.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='caja_venta_lineas'").get();
  if (!yaHay) {
    vieja.exec(`CREATE TABLE caja_venta_lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id TEXT NOT NULL, modelo_id INTEGER,
      codigo TEXT NOT NULL DEFAULT '', descripcion TEXT NOT NULL DEFAULT '',
      piezas INTEGER NOT NULL DEFAULT 1, precio INTEGER NOT NULL DEFAULT 0,
      importe INTEGER NOT NULL DEFAULT 0, sin_respaldo INTEGER NOT NULL DEFAULT 0)`);
  }
  vieja.close();
}

process.env.VENUS_DB = BASE_COPIA;
process.env.VENUS_CAJA = "C1";

const URL_VENTAS = pathToFileURL(path.join(RAIZ, "src", "lib", "ventas.ts")).href;

const { getDb } = await import(pathToFileURL(path.join(RAIZ, "src", "lib", "db.ts")).href);
const { registrarVenta, cancelarVenta } = await import(URL_VENTAS);
const { catalogoParaCaja, corteDelDia, obtenerVenta, ventasDelDia } = await import(
  pathToFileURL(path.join(RAIZ, "src", "lib", "consultas.ts")).href
);
const { buscar, hayEmpate } = await import(pathToFileURL(path.join(RAIZ, "src", "lib", "busqueda.ts")).href);

const db = getDb();

// --- Marcador -----------------------------------------------------------
let pasadas = 0;
let fallidas = 0;

function comprobar(descripcion, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log("  ok    " + descripcion);
  } else {
    fallidas++;
    console.log("  FALLA " + descripcion + (detalle ? "\n          -> " + detalle : ""));
  }
}

function iguales(descripcion, obtenido, esperado) {
  comprobar(
    descripcion,
    JSON.stringify(obtenido) === JSON.stringify(esperado),
    "se obtuvo " + JSON.stringify(obtenido) + ", se esperaba " + JSON.stringify(esperado)
  );
}

function seccion(titulo) {
  console.log("\n" + titulo);
  console.log("  " + "-".repeat(titulo.length));
}

// --- Preparar la copia --------------------------------------------------
// La base real trae el catalogo pero no trae quien cobra ni piezas en la
// tienda (la bodega todavia no registra los envios). Se siembra sobre la
// COPIA lo minimo para poder cobrar: una vendedora y existencias conocidas.
const HOY = db.prepare("SELECT date('now','localtime') AS d").get().d;

let vendedora = db.prepare("SELECT id, nombre FROM personal WHERE activo = 1 ORDER BY orden, id").get();
if (!vendedora) {
  const info = db
    .prepare("INSERT INTO personal (nombre, puesto) VALUES ('MARISOL DE PRUEBA', 'vendedora')")
    .run();
  vendedora = { id: Number(info.lastInsertRowid), nombre: "MARISOL DE PRUEBA" };
}

const catalogo = db
  .prepare("SELECT id, codigo, descripcion FROM modelos WHERE activo = 1 ORDER BY id LIMIT 4")
  .all();
if (catalogo.length < 4) {
  console.error("\nEl catalogo de la bodega tiene menos de 4 modelos activos: no hay con que probar.\n");
  process.exit(1);
}

const [A, B, C, D] = catalogo;
// Existencias de bodega distintas entre si: si el codigo las moviera o las
// confundiera con las de la tienda, el numero cambiado se nota luego luego.
const EXISTENCIA = { [A.id]: 7, [B.id]: 9, [C.id]: 4, [D.id]: 11 };
for (const modelo of catalogo) {
  db.prepare("UPDATE modelos SET existencia = ?, en_tienda = 50 WHERE id = ?").run(EXISTENCIA[modelo.id], modelo.id);
}

/** Foto del inventario completo, para comparar hasta el ultimo renglon. */
function fotoExistencias() {
  return db
    .prepare("SELECT id, existencia FROM modelos ORDER BY id")
    .all()
    .map((m) => m.id + ":" + m.existencia)
    .join(",");
}
function enTienda(id) {
  return db.prepare("SELECT en_tienda FROM modelos WHERE id = ?").get(id).en_tienda;
}
function existenciaDe(id) {
  return db.prepare("SELECT existencia FROM modelos WHERE id = ?").get(id).existencia;
}
function contadorFolio() {
  const fila = db.prepare("SELECT valor FROM caja_config WHERE clave = 'folio_C1'").get();
  return parseInt((fila && fila.valor) || "0", 10) || 0;
}

console.log("\nPruebas de la caja - Venus Boutique");
console.log("  base real (solo se copia): " + BASE_REAL);
console.log("  copia de prueba:           " + BASE_COPIA);
console.log("  catalogo de verdad:        " + db.prepare("SELECT COUNT(*) n FROM modelos").get().n + " modelos");
console.log("  cobra:                     " + vendedora.nombre);

/** Lo que uno esperaria ver en el corte, llevado a mano conforme se cobra. */
const libreta = new Map();
function anotar(id, total, piezas, forma) {
  libreta.set(id, { total, piezas, forma });
}
function cuentasDeLaLibreta() {
  let total = 0;
  let piezas = 0;
  const porForma = {};
  for (const v of libreta.values()) {
    total += v.total;
    piezas += v.piezas;
    porForma[v.forma] = (porForma[v.forma] || 0) + v.total;
  }
  const ventas = libreta.size;
  return { ventas, total, piezas, porForma, promedio: ventas > 0 ? Math.round(total / ventas) : 0 };
}

function venta(datos) {
  return {
    id: datos.id,
    vendedora_id: vendedora.id,
    lineas: datos.lineas,
    descuento_tipo: datos.descuento_tipo || "",
    descuento_valor: datos.descuento_valor || 0,
    forma_pago: datos.forma_pago || "efectivo",
    recibido: datos.recibido || 0,
    nota: datos.nota || "",
    fecha_local: datos.fecha_local || HOY + " 12:00:00",
  };
}
function linea(modelo, piezas, precio) {
  return { modelo_id: modelo.id, codigo: modelo.codigo, descripcion: modelo.descripcion, piezas, precio };
}

// =======================================================================
seccion("1. Una venta de 3 prendas en efectivo");
// =======================================================================
const existenciasAlEmpezar = fotoExistencias();

const venta1 = venta({
  id: "prueba-venta-1",
  lineas: [linea(A, 1, 65000), linea(B, 1, 45000), linea(C, 1, 39900)],
  forma_pago: "efectivo",
  recibido: 200000,
  fecha_local: HOY + " 10:15:00",
});
const r1 = registrarVenta(venta1);

comprobar("la venta se guardo", r1.ok === true, r1.ok ? "" : "la caja dijo: " + r1.error);
if (!r1.ok) {
  console.error("\nSin la primera venta no tiene caso seguir.\n");
  process.exit(1);
}
anotar(venta1.id, r1.datos.total, 3, "efectivo");

iguales("el folio del primer ticket es C1-000001", r1.datos.folio, "C1-000001");
iguales("el total es la suma de las tres prendas (650 + 450 + 399)", r1.datos.total, 149900);
iguales("con $2,000 recibidos el cambio es $501.00", r1.datos.cambio, 50100);

const guardada1 = obtenerVenta(venta1.id);
iguales("el ticket guardado tiene sus 3 renglones", guardada1.lineas.length, 3);
iguales("el ticket guardado dice 3 prendas", guardada1.venta.piezas, 3);
iguales("el total guardado es el mismo que se cobro", guardada1.venta.total, 149900);
iguales("el pago quedo como efectivo", guardada1.pagos[0].forma, "efectivo");
iguales("el pago guarda lo que se recibio", guardada1.pagos[0].recibido, 200000);
iguales("el pago guarda el cambio que se dio", guardada1.pagos[0].cambio, 50100);
iguales("la venta quedo a nombre de quien cobro", guardada1.venta.vendedora, vendedora.nombre);
comprobar("no hubo avisos de falta de piezas", r1.datos.avisos.length === 0, JSON.stringify(r1.datos.avisos));

// =======================================================================
seccion("2. El inventario: baja la tienda, la bodega no se toca");
// =======================================================================
iguales(A.codigo + ": la tienda bajo 1 pieza", enTienda(A.id), 49);
iguales(B.codigo + ": la tienda bajo 1 pieza", enTienda(B.id), 49);
iguales(C.codigo + ": la tienda bajo 1 pieza", enTienda(C.id), 49);

comprobar(
  "la existencia de bodega no cambio en NINGUNO de los modelos del catalogo",
  existenciasAlEmpezar === fotoExistencias(),
  "alguna existencia de bodega se movio al cobrar"
);
iguales(A.codigo + ": su existencia de bodega sigue en " + EXISTENCIA[A.id], existenciaDe(A.id), EXISTENCIA[A.id]);

// Varias piezas del mismo modelo: la resta tiene que ser exacta, no de una.
const venta2 = venta({
  id: "prueba-venta-2",
  lineas: [linea(D, 3, 25000)],
  forma_pago: "efectivo",
  recibido: 100000,
  fecha_local: HOY + " 10:40:00",
});
const r2 = registrarVenta(venta2);
comprobar("se cobran 3 piezas del mismo modelo", r2.ok === true, r2.ok ? "" : r2.error);
if (r2.ok) anotar(venta2.id, r2.datos.total, 3, "efectivo");
iguales(D.codigo + ": la tienda bajo exactamente 3 piezas", enTienda(D.id), 47);
iguales(D.codigo + ": la existencia de bodega siguio sin moverse", existenciaDe(D.id), EXISTENCIA[D.id]);

// =======================================================================
seccion("3. El rastro que ve la bodega");
// =======================================================================
const movimientos1 = db.prepare("SELECT * FROM movimientos WHERE nota = ? ORDER BY id").all("Venta " + r1.datos.folio);

iguales("quedo un movimiento por cada renglon de la venta", movimientos1.length, 3);
comprobar(
  "todos los movimientos son de tipo 'venta'",
  movimientos1.every((m) => m.tipo === "venta"),
  JSON.stringify(movimientos1.map((m) => m.tipo))
);
comprobar(
  "cada movimiento trae en 'persona' a quien cobro",
  movimientos1.every((m) => m.persona === vendedora.nombre),
  JSON.stringify(movimientos1.map((m) => m.persona))
);
comprobar(
  "cada movimiento trae el folio del ticket en la nota",
  movimientos1.every((m) => m.nota.indexOf(r1.datos.folio) >= 0),
  JSON.stringify(movimientos1.map((m) => m.nota))
);
comprobar(
  "el antes y el despues de bodega van iguales (la bodega no perdio piezas)",
  movimientos1.every((m) => m.existencia_antes === m.existencia_despues),
  JSON.stringify(movimientos1.map((m) => [m.existencia_antes, m.existencia_despues]))
);
comprobar(
  "el movimiento reporta la existencia real de bodega, no un cero",
  movimientos1.every((m) => m.existencia_antes === EXISTENCIA[m.modelo_id]),
  JSON.stringify(movimientos1.map((m) => [m.modelo_id, m.existencia_antes]))
);
comprobar(
  "la cantidad del movimiento es la que se vendio",
  movimientos1.every((m) => m.cantidad === 1),
  JSON.stringify(movimientos1.map((m) => m.cantidad))
);

// =======================================================================
seccion("4. Idempotencia: la misma venta mandada dos veces");
// =======================================================================
const venta3 = venta({
  id: "prueba-venta-sin-internet",
  lineas: [linea(A, 2, 65000)],
  forma_pago: "efectivo",
  recibido: 150000,
  fecha_local: HOY + " 11:05:00",
});
const tiendaAntes = enTienda(A.id);
const primerEnvio = registrarVenta(venta3);
const segundoEnvio = registrarVenta(venta3);

comprobar("el primer envio se guarda", primerEnvio.ok === true, primerEnvio.ok ? "" : primerEnvio.error);
if (primerEnvio.ok) anotar(venta3.id, primerEnvio.datos.total, 2, "efectivo");
comprobar(
  "el reintento no truena, avisa que ya estaba",
  segundoEnvio.ok === true,
  segundoEnvio.ok ? "" : segundoEnvio.error
);
iguales("el reintento devuelve el mismo folio", segundoEnvio.datos.folio, primerEnvio.datos.folio);
iguales("hay UNA sola venta con ese id", db.prepare("SELECT COUNT(*) n FROM caja_ventas WHERE id = ?").get(venta3.id).n, 1);
iguales(
  "hay UN solo renglon guardado",
  db.prepare("SELECT COUNT(*) n FROM caja_venta_lineas WHERE venta_id = ?").get(venta3.id).n,
  1
);
iguales("hay UN solo pago guardado", db.prepare("SELECT COUNT(*) n FROM caja_pagos WHERE venta_id = ?").get(venta3.id).n, 1);
iguales("el inventario se desconto UNA sola vez", enTienda(A.id), tiendaAntes - 2);
iguales(
  "no se duplico el rastro en la bodega",
  db.prepare("SELECT COUNT(*) n FROM movimientos WHERE nota = ?").get("Venta " + primerEnvio.datos.folio).n,
  1
);
iguales("no quedaron ventas de mas en la base", db.prepare("SELECT COUNT(*) n FROM caja_ventas").get().n, 3);

// =======================================================================
seccion("5. Descuento del 10 por ciento: no se pierde ni un centavo");
// =======================================================================
// Precios feos a proposito, para que el 10 por ciento no reparta parejo.
const venta4 = venta({
  id: "prueba-venta-descuento",
  lineas: [linea(A, 1, 19999), linea(B, 2, 25000), linea(C, 1, 33333)],
  descuento_tipo: "porcentaje",
  descuento_valor: 10,
  forma_pago: "efectivo",
  recibido: 100000,
  fecha_local: HOY + " 11:30:00",
});
const r4 = registrarVenta(venta4);
comprobar("la venta con descuento se guarda", r4.ok === true, r4.ok ? "" : r4.error);
if (r4.ok) anotar(venta4.id, r4.datos.total, 4, "efectivo");

const conDescuento = obtenerVenta(venta4.id);
const subtotalEsperado = 19999 + 25000 * 2 + 33333;
const descuentoEsperado = Math.round((subtotalEsperado * 10) / 100);
iguales("el subtotal es la suma de los renglones", conDescuento.venta.subtotal, subtotalEsperado);
iguales("el descuento es el 10 por ciento del subtotal", conDescuento.venta.descuento, descuentoEsperado);
iguales("el total es subtotal menos descuento", conDescuento.venta.total, subtotalEsperado - descuentoEsperado);

const sumaImportes = conDescuento.lineas.reduce((a, l) => a + l.importe, 0);
iguales("la suma de los importes de los renglones es EXACTAMENTE el total", sumaImportes, conDescuento.venta.total);
comprobar(
  "ningun renglon quedo con importe negativo al repartir",
  conDescuento.lineas.every((l) => l.importe >= 0),
  JSON.stringify(conDescuento.lineas.map((l) => l.importe))
);

// =======================================================================
seccion("6. Cancelar: la venta queda marcada y las piezas regresan");
// =======================================================================
const venta5 = venta({
  id: "prueba-venta-cancelada",
  lineas: [linea(B, 2, 45000)],
  forma_pago: "tarjeta",
  fecha_local: HOY + " 12:10:00",
});
const r5 = registrarVenta(venta5);
comprobar("se cobra la venta que luego se va a cancelar", r5.ok === true, r5.ok ? "" : r5.error);

const tiendaAntesDeCancelar = enTienda(B.id);
const corteAntesDeCancelar = corteDelDia(HOY);
const cancelacion = cancelarVenta(venta5.id, "La clienta se arrepintio", vendedora.nombre);
comprobar("la cancelacion se acepta", cancelacion.ok === true, cancelacion.ok ? "" : cancelacion.error);

const cancelada = obtenerVenta(venta5.id);
comprobar("la venta NO se borro: sigue ahi", cancelada !== null);
iguales("quedo marcada como cancelada", cancelada.venta.estado, "cancelada");
iguales("guarda el motivo de la cancelacion", cancelada.venta.motivo_cancelacion, "La clienta se arrepintio");
iguales("las 2 piezas regresaron a la tienda", enTienda(B.id), tiendaAntesDeCancelar + 2);
iguales("la existencia de bodega tampoco se movio al cancelar", existenciaDe(B.id), EXISTENCIA[B.id]);
iguales(
  "quedo el rastro de la cancelacion para la bodega",
  db
    .prepare("SELECT COUNT(*) n FROM movimientos WHERE tipo = 'cancelacion' AND nota LIKE ?")
    .get("Cancelacion " + r5.datos.folio + "%").n,
  1
);
const corteDespuesDeCancelar = corteDelDia(HOY);
iguales(
  "el corte del dia ya no la cuenta",
  corteDespuesDeCancelar.ventas,
  corteAntesDeCancelar.ventas - 1
);
iguales(
  "el corte del dia ya no cuenta su dinero",
  corteDespuesDeCancelar.total,
  corteAntesDeCancelar.total - r5.datos.total
);
comprobar("no se puede cancelar dos veces", cancelarVenta(venta5.id, "otra vez", vendedora.nombre).ok === false);
comprobar("no se puede cancelar sin decir por que", cancelarVenta("prueba-venta-1", "   ", vendedora.nombre).ok === false);
comprobar(
  "la venta cancelada sigue apareciendo en el historial del dia",
  ventasDelDia(HOY).some((v) => v.id === venta5.id && v.estado === "cancelada")
);

// =======================================================================
seccion("7. El corte del dia");
// =======================================================================
const venta6 = venta({
  id: "prueba-venta-tarjeta",
  lineas: [linea(C, 1, 89900)],
  forma_pago: "tarjeta",
  fecha_local: HOY + " 13:00:00",
});
const r6 = registrarVenta(venta6);
comprobar("se cobra una con tarjeta", r6.ok === true, r6.ok ? "" : r6.error);
if (r6.ok) anotar(venta6.id, r6.datos.total, 1, "tarjeta");

const venta7 = venta({
  id: "prueba-venta-transferencia",
  lineas: [linea(D, 2, 55000)],
  forma_pago: "transferencia",
  fecha_local: HOY + " 13:20:00",
});
const r7 = registrarVenta(venta7);
comprobar("se cobra una con transferencia", r7.ok === true, r7.ok ? "" : r7.error);
if (r7.ok) anotar(venta7.id, r7.datos.total, 2, "transferencia");

const corte = corteDelDia(HOY);
const cuentas = cuentasDeLaLibreta();

iguales("el corte cuenta las ventas cobradas del dia", corte.ventas, cuentas.ventas);
iguales("el total del corte cuadra con lo que se cobro", corte.total, cuentas.total);
iguales("las piezas del corte cuadran con lo que se vendio", corte.piezas, cuentas.piezas);
iguales("el corte reporta la venta cancelada aparte", corte.canceladas, 1);
iguales("el ticket promedio es el total entre las ventas", corte.ticket_promedio, cuentas.promedio);

for (const forma of ["efectivo", "tarjeta", "transferencia"]) {
  const enCorte = corte.por_forma.find((f) => f.forma === forma);
  iguales("el corte suma bien lo de " + forma, enCorte ? enCorte.monto : 0, cuentas.porForma[forma] || 0);
}
iguales(
  "la venta cancelada NO se cuenta en el dinero del corte",
  corte.por_forma.reduce((a, f) => a + f.monto, 0),
  cuentas.total
);
iguales(
  "el efectivo esperado en el cajon es el fondo mas lo cobrado en efectivo",
  corte.efectivo_esperado,
  corte.fondo + (cuentas.porForma.efectivo || 0) - corte.retiros
);

// =======================================================================
seccion("8. Dos cajas cobrando al mismo tiempo");
// =======================================================================
/**
 * De verdad al mismo tiempo: dos procesos aparte, cada uno con su propia
 * conexion a la base, sincronizados para entrar en el mismo milisegundo.
 * Es la unica forma de provocar el choque de folios que se quiere descartar.
 */
const CODIGO_DEL_HIJO = [
  "import { register } from 'node:module';",
  "register(process.env.PRUEBAS_CARGADOR);",
  "const { registrarVenta } = await import(process.env.PRUEBAS_VENTAS);",
  "const venta = JSON.parse(process.argv[1]);",
  "const arranque = Number(process.argv[2]);",
  "while (Date.now() < arranque) {}",
  "process.stdout.write(JSON.stringify(registrarVenta(venta)));",
].join("\n");

function cobrarEnOtroProceso(datos, arranque) {
  return new Promise((entregar) => {
    const hijo = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        "--input-type=module",
        "-e",
        CODIGO_DEL_HIJO,
        JSON.stringify(datos),
        String(arranque),
      ],
      {
        env: { ...process.env, PRUEBAS_CARGADOR: CARGADOR_TS, PRUEBAS_VENTAS: URL_VENTAS },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let salida = "";
    let ruido = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (ruido += d));
    hijo.on("close", () => {
      try {
        entregar(JSON.parse(salida));
      } catch {
        entregar({ ok: false, error: ruido.trim().split("\n").slice(0, 3).join(" ") || "el proceso no contesto" });
      }
    });
  });
}

const folioAntes = contadorFolio();
const tiendaAntesDelChoque = enTienda(A.id);
const arranque = Date.now() + 1500;
const [choqueUno, choqueDos] = await Promise.all([
  cobrarEnOtroProceso(
    venta({ id: "prueba-choque-1", lineas: [linea(A, 1, 65000)], forma_pago: "tarjeta", fecha_local: HOY + " 14:00:00" }),
    arranque
  ),
  cobrarEnOtroProceso(
    venta({ id: "prueba-choque-2", lineas: [linea(A, 1, 65000)], forma_pago: "tarjeta", fecha_local: HOY + " 14:00:01" }),
    arranque
  ),
]);

comprobar("la primera caja cobro", choqueUno.ok === true, choqueUno.ok ? "" : choqueUno.error);
comprobar("la segunda caja cobro", choqueDos.ok === true, choqueDos.ok ? "" : choqueDos.error);
if (choqueUno.ok && choqueDos.ok) {
  comprobar(
    "las dos ventas simultaneas sacaron folios DISTINTOS",
    choqueUno.datos.folio !== choqueDos.datos.folio,
    "las dos sacaron " + choqueUno.datos.folio
  );
  iguales("el contador de folios avanzo exactamente 2", contadorFolio(), folioAntes + 2);
  iguales(
    "quedaron guardadas las dos ventas, ninguna se perdio",
    db.prepare("SELECT COUNT(*) n FROM caja_ventas WHERE id IN ('prueba-choque-1','prueba-choque-2')").get().n,
    2
  );
  iguales("el inventario bajo 2 piezas, una por cada venta", enTienda(A.id), tiendaAntesDelChoque - 2);
  iguales(
    "no hay dos tickets con el mismo folio en toda la base",
    db.prepare("SELECT COUNT(*) n FROM (SELECT folio FROM caja_ventas GROUP BY folio HAVING COUNT(*) > 1)").get().n,
    0
  );
}

// =======================================================================
seccion("9. La venta de ayer que se sube hoy");
// =======================================================================
/**
 * Cuando se cae el internet, la caja guarda la venta en el navegador con la
 * hora en que se cobro de verdad y la manda despues. Si esa hora se pierde,
 * la venta de ayer cae en el corte de hoy y los dos dias quedan mal. Aqui se
 * prueban las tres formas en que un navegador escribe esa misma hora.
 */
const AYER = db.prepare("SELECT date('now','localtime','-1 day') AS d").get().d;

function diaGuardado(id) {
  const fila = db.prepare("SELECT date(fecha) AS d FROM caja_ventas WHERE id = ?").get(id);
  return fila ? fila.d : null;
}

const conEspacio = venta({
  id: "prueba-ayer-espacio",
  lineas: [linea(A, 1, 10000)],
  forma_pago: "tarjeta",
  fecha_local: AYER + " 17:30:00",
});
comprobar("se sube una venta de ayer escrita con espacio", registrarVenta(conEspacio).ok === true);
iguales("conserva la fecha de ayer", diaGuardado(conEspacio.id), AYER);

const conTe = venta({
  id: "prueba-ayer-te",
  lineas: [linea(A, 1, 10000)],
  forma_pago: "tarjeta",
  fecha_local: AYER + "T17:31:00",
});
comprobar("se sube una venta de ayer escrita con T", registrarVenta(conTe).ok === true);
iguales("conserva la fecha de ayer", diaGuardado(conTe.id), AYER);

// Es lo que sale de toISOString() del navegador, que es como se va a mandar.
const conMilesimas = venta({
  id: "prueba-ayer-milesimas",
  lineas: [linea(A, 1, 10000)],
  forma_pago: "tarjeta",
  fecha_local: AYER + "T17:32:00.000",
});
comprobar("se sube una venta de ayer con la hora del navegador", registrarVenta(conMilesimas).ok === true);
iguales("conserva la fecha de ayer (hora con milesimas)", diaGuardado(conMilesimas.id), AYER);
iguales("las 3 ventas de ayer caen en el corte de ayer", corteDelDia(AYER).ventas, 3);

// =======================================================================
seccion("10. Renglones con piezas raras");
// =======================================================================
// La caja es la puerta de entrada: lo que llega del navegador puede venir
// mal por un error de programa o por alguien picandole al envio a mano.
const tiendaAntesDeRaras = enTienda(C.id);

const conNegativas = venta({
  id: "prueba-piezas-negativas",
  lineas: [linea(B, 1, 100000), linea(C, -3, 1000)],
  forma_pago: "efectivo",
  recibido: 100000,
  fecha_local: HOY + " 15:00:00",
});
const rNegativas = registrarVenta(conNegativas);
comprobar(
  "no se acepta un renglon con piezas negativas",
  rNegativas.ok === false,
  "se guardo la venta y quedo con " + JSON.stringify(rNegativas.datos)
);
comprobar(
  "una venta nunca SUBE las piezas de la tienda",
  enTienda(C.id) <= tiendaAntesDeRaras,
  "la tienda paso de " + tiendaAntesDeRaras + " a " + enTienda(C.id) + " piezas al cobrar"
);

const conDecimales = venta({
  id: "prueba-piezas-decimales",
  lineas: [linea(C, 1.5, 10000)],
  forma_pago: "efectivo",
  recibido: 100000,
  fecha_local: HOY + " 15:10:00",
});
const rDecimales = registrarVenta(conDecimales);
comprobar(
  "no se acepta un renglon con media pieza",
  rDecimales.ok === false,
  "se guardo la venta y quedo con " + JSON.stringify(rDecimales.datos)
);
comprobar(
  "las piezas de la tienda quedan en numero entero",
  Number.isInteger(enTienda(C.id)),
  "la tienda quedo con " + enTienda(C.id) + " piezas"
);

// =======================================================================
seccion("11. Etiquetas con el codigo viejo");
// =======================================================================
// La bodega corrige codigos mal capturados y apunta el viejo en su tabla
// codigos_anteriores. Las etiquetas ya pegadas en la ropa traen el codigo
// de antes, y escanearlas tiene que seguir encontrando la prenda. La tabla
// es de bodega: puede no existir todavia, y la caja debe cargar igual. Se
// prueba primero sin la tabla y luego con ella EN EL MISMO PROCESO, para
// comprobar que el "no existe" no se queda pegado en la memoria de la caja.

db.prepare("DROP TABLE IF EXISTS codigos_anteriores").run();

function modeloDelCatalogo(cat, id) {
  return cat.find((mo) => mo.id === id);
}

const catalogoSinTabla = catalogoParaCaja();
comprobar(
  "sin la tabla de bodega, el catalogo carga completo",
  catalogoSinTabla.length >= 4,
  "cargo " + catalogoSinTabla.length + " modelos"
);

const normA = db.prepare("SELECT codigo_norm FROM modelos WHERE id = ?").get(A.id).codigo_norm;
const conActual = buscar(catalogoSinTabla, normA, 8);
comprobar(
  "la etiqueta con el codigo vigente encuentra su prenda",
  Boolean(conActual[0]) && conActual[0].id === A.id,
  "buscar " + normA + " dio " + JSON.stringify(conActual.map((mo) => mo.codigo))
);

// La tabla tal cual la crea la bodega (sin UNIQUE en codigo_norm: un codigo
// liberado se puede reasignar). Crearla aqui esta bien porque esto es una
// COPIA de prueba; en produccion la crea la bodega y la caja jamas.
db.exec(`CREATE TABLE codigos_anteriores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id     INTEGER NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  codigo        TEXT    NOT NULL,
  codigo_norm   TEXT    NOT NULL,
  codigo_nuevo  TEXT    NOT NULL,
  cambiado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
)`);

const apuntarViejo = db.prepare(
  "INSERT INTO codigos_anteriores (modelo_id, codigo, codigo_norm, codigo_nuevo) VALUES (?, ?, ?, ?)"
);
// El caso normal: a la prenda A le corrigieron el codigo y su etiqueta vieja dice ZZVIEJO1.
apuntarViejo.run(A.id, "ZZ VIEJO 1", "ZZVIEJO1", A.codigo);
// La misma correccion apuntada dos veces (corrigieron ida y vuelta): no debe duplicar el alias.
apuntarViejo.run(A.id, "ZZ VIEJO 1", "ZZVIEJO1", A.codigo);
// Un codigo que en su momento fue de DOS prendas distintas: reciclado, nadie lo debe encontrar.
apuntarViejo.run(A.id, "ZZ REP 7", "ZZREP7", A.codigo);
apuntarViejo.run(B.id, "ZZ REP 7", "ZZREP7", B.codigo);
// Un codigo liberado por B que hoy es el codigo vigente de C: manda el dueno actual.
const normC = db.prepare("SELECT codigo_norm FROM modelos WHERE id = ?").get(C.id).codigo_norm;
apuntarViejo.run(B.id, normC, normC, B.codigo);
// Un codigo viejo de A que ya esta capturado como alias manual de D: el alias manual manda.
db.prepare("INSERT INTO caja_codigos_barras (codigo_barras, modelo_id) VALUES ('ZZALIAS9', ?)").run(D.id);
apuntarViejo.run(A.id, "ZZ ALIAS 9", "ZZALIAS9", A.codigo);

const catalogoConTabla = catalogoParaCaja();
const modeloA = modeloDelCatalogo(catalogoConTabla, A.id);
comprobar(
  "la tabla nueva se nota sin reiniciar la caja",
  modeloA.barras.includes("ZZVIEJO1"),
  "las barras de A quedaron " + JSON.stringify(modeloA.barras)
);
iguales(
  "la correccion apuntada dos veces entra como un solo alias",
  modeloA.barras.filter((b) => b === "ZZVIEJO1").length,
  1
);

const conViejo = buscar(catalogoConTabla, "ZZVIEJO1", 8);
comprobar(
  "escanear la etiqueta vieja encuentra la prenda",
  conViejo.length === 1 && conViejo[0].id === A.id,
  "buscar ZZVIEJO1 dio " + JSON.stringify(conViejo.map((mo) => mo.codigo))
);
comprobar("y entra directo, sin pedir que se elija", hayEmpate(catalogoConTabla, "ZZVIEJO1") === false);

iguales("un codigo que fue de dos prendas no encuentra ninguna", buscar(catalogoConTabla, "ZZREP7", 8).length, 0);

const conReasignado = buscar(catalogoConTabla, normC, 8);
comprobar(
  "un codigo reasignado abre a su dueno actual, no al anterior",
  Boolean(conReasignado[0]) && conReasignado[0].id === C.id,
  "buscar " + normC + " dio " + JSON.stringify(conReasignado.map((mo) => mo.codigo))
);
comprobar(
  "y no queda colgado como alias del dueno anterior",
  !modeloDelCatalogo(catalogoConTabla, B.id).barras.includes(normC),
  "las barras de B quedaron " + JSON.stringify(modeloDelCatalogo(catalogoConTabla, B.id).barras)
);

comprobar(
  "un codigo viejo que ya es alias manual de otra prenda no compite",
  !modeloA.barras.includes("ZZALIAS9") && modeloDelCatalogo(catalogoConTabla, D.id).barras.includes("ZZALIAS9"),
  "A quedo con " + JSON.stringify(modeloA.barras) + " y D con " + JSON.stringify(modeloDelCatalogo(catalogoConTabla, D.id).barras)
);

// =======================================================================
seccion("12. Lo que bodega cambia llega al siguiente catalogo");
// =======================================================================
// La pantalla de cobrar baja el catalogo cada minuto por /api/catalogo.
// Aqui se comprueba la parte del servidor: que una nueva lectura ya traiga
// el precio y la descripcion que bodega acaba de cambiar, sin reiniciar.
db.prepare(
  `INSERT INTO caja_precios (modelo_id, precio) VALUES (?, ?)
   ON CONFLICT(modelo_id) DO UPDATE SET precio = excluded.precio,
                                        actualizado_en = datetime('now','localtime')`
).run(D.id, 77700);
db.prepare("UPDATE modelos SET descripcion = 'VESTIDO CORREGIDO EN BODEGA' WHERE id = ?").run(D.id);

const relectura = catalogoParaCaja();
const modeloD = modeloDelCatalogo(relectura, D.id);
iguales("el precio que bodega guardo sale en la relectura", modeloD.precio, 77700);
iguales("la descripcion corregida sale en la relectura", modeloD.descripcion, "VESTIDO CORREGIDO EN BODEGA");

// =======================================================================
seccion("13. Precio cambiado en el mostrador");
// =======================================================================
comprobar(
  "una base de antes recibe la columna del precio registrado",
  db.prepare("PRAGMA table_info(caja_venta_lineas)").all().some((c) => c.name === "precio_lista")
);

const precioDeA = db.prepare("SELECT precio FROM caja_precios WHERE modelo_id = ?").get(A.id)?.precio ?? null;
const regateada = venta({
  id: "prueba-regateo",
  lineas: [
    { ...linea(A, 1, 55000), precio_lista: 65000 },
    { ...linea(B, 1, 45000), precio_lista: 45000 },
    { ...linea(C, 1, 39900), precio_lista: "raro" },
  ],
  forma_pago: "tarjeta",
});
const rRegateo = registrarVenta(regateada);
comprobar("la venta con un precio cambiado se cobra", rRegateo.ok === true, rRegateo.ok ? "" : rRegateo.error);
iguales("se cobra el precio cambiado, no el registrado", rRegateo.ok && rRegateo.datos.total, 55000 + 45000 + 39900);
iguales(
  "cada renglon guarda el precio registrado que tenia en pantalla",
  db
    .prepare("SELECT precio, precio_lista FROM caja_venta_lineas WHERE venta_id = ? ORDER BY id")
    .all("prueba-regateo")
    .map((r) => [r.precio, r.precio_lista]),
  [
    [55000, 65000],
    [45000, 45000],
    [39900, null],
  ]
);
iguales(
  "cambiar el precio solo en la venta no toca el precio de la prenda",
  db.prepare("SELECT precio FROM caja_precios WHERE modelo_id = ?").get(A.id)?.precio ?? null,
  precioDeA
);

const ventaVieja = venta({ id: "prueba-sin-precio-lista", lineas: [linea(B, 1, 45000)], forma_pago: "tarjeta" });
const rVieja = registrarVenta(ventaVieja);
comprobar("una venta en espera de antes, sin precio registrado, se cobra igual", rVieja.ok === true);

const { armarTicketHtml } = await import(pathToFileURL(path.join(RAIZ, "src", "lib", "ticket.ts")).href);
const html = armarTicketHtml(obtenerVenta("prueba-regateo"));
comprobar(
  "el ticket dice Powered by Konekt antes que el nombre de la tienda",
  html.includes("Powered by") && html.indexOf("Konekt") < html.indexOf("ticket-negocio")
);

// --- Recoger -----------------------------------------------------------
db.close();
try {
  fs.rmSync(CARPETA, { recursive: true, force: true });
} catch {
  // si Windows todavia tiene tomado el archivo, el temporal se limpia solo despues
}

const total = pasadas + fallidas;
console.log("\n" + pasadas + " de " + total + " pruebas pasaron");
if (fallidas > 0) console.log(fallidas + " fallaron. Arriba dice cual y con que numeros.");
console.log("");
process.exit(fallidas > 0 ? 1 : 0);
