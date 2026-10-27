/**
 * Tablas propias de la caja.
 *
 * La caja NO tiene base de datos aparte: escribe en la misma que usa el
 * sistema de bodega (venus.db). Eso es lo que permite que al cobrar se
 * descuente el inventario de la tienda de verdad y que en la bodega vean
 * las ventas del dia conforme van pasando.
 *
 * Por eso todas las tablas de aqui llevan el prefijo "caja_": abriendo la
 * base con cualquier visor se distingue de un vistazo que es de la caja y
 * que es de la bodega. Las tablas de bodega (modelos, movimientos,
 * personal, remisiones...) NO se tocan ni se modifican desde aqui; solo se
 * leen, y en el caso de una venta se actualiza modelos.en_tienda y se deja
 * el rastro en movimientos, que es justo lo que la bodega espera ver.
 *
 * Todo es CREATE ... IF NOT EXISTS porque este archivo corre en cada
 * arranque, igual que el de bodega.
 */
export const ESQUEMA_CAJA = `
-- Quien cobra. El nombre y el puesto viven en la tabla 'personal' de la
-- bodega, que es la misma gente; aqui solo se agrega lo que la bodega no
-- necesita saber: el PIN con el que firma sus ventas.
CREATE TABLE IF NOT EXISTS caja_vendedoras (
  personal_id  INTEGER PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,
  pin_hash     TEXT    NOT NULL DEFAULT '',
  pin_sal      TEXT    NOT NULL DEFAULT '',
  rol          TEXT    NOT NULL DEFAULT 'vendedora',
  activa       INTEGER NOT NULL DEFAULT 1,
  creado_en    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- El catalogo de bodega no trae precios: se capturan aqui. Se guarda en
-- una tabla aparte y no como columna de 'modelos' para no alterar el
-- esquema de la bodega.
CREATE TABLE IF NOT EXISTS caja_precios (
  modelo_id      INTEGER PRIMARY KEY REFERENCES modelos(id) ON DELETE CASCADE,
  precio         INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Los codigos de barras los imprime la propia tienda, asi que un modelo
-- puede tener varios (etiquetas viejas y nuevas conviviendo).
CREATE TABLE IF NOT EXISTS caja_codigos_barras (
  codigo_barras TEXT    PRIMARY KEY,
  modelo_id     INTEGER NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_caja_barras_modelo ON caja_codigos_barras(modelo_id);

-- El corte del dia. Se crea solo al cobrar la primera venta de la jornada.
CREATE TABLE IF NOT EXISTS caja_cortes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  caja             TEXT    NOT NULL DEFAULT 'C1',
  dia              TEXT    NOT NULL,
  fondo            INTEGER NOT NULL DEFAULT 0,
  abierto_por      TEXT    NOT NULL DEFAULT '',
  abierto_en       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  cerrado_por      TEXT    NOT NULL DEFAULT '',
  cerrado_en       TEXT,
  efectivo_contado INTEGER,
  diferencia       INTEGER,
  nota             TEXT    NOT NULL DEFAULT '',
  estado           TEXT    NOT NULL DEFAULT 'abierto',
  UNIQUE(caja, dia)
);

-- Dinero que sale del cajon sin ser una venta (pago a un proveedor, la
-- comida, un retiro a la caja fuerte). Sin esto el corte nunca cuadra.
CREATE TABLE IF NOT EXISTS caja_retiros (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  corte_id INTEGER NOT NULL REFERENCES caja_cortes(id) ON DELETE CASCADE,
  monto    INTEGER NOT NULL,
  motivo   TEXT    NOT NULL DEFAULT '',
  persona  TEXT    NOT NULL DEFAULT '',
  fecha    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- La venta. El id lo genera el navegador antes de mandarla: si la tienda
-- estaba sin internet y el envio se reintenta tres veces, las tres traen
-- el mismo id y la venta se guarda una sola vez.
CREATE TABLE IF NOT EXISTS caja_ventas (
  id                 TEXT    PRIMARY KEY,
  folio              TEXT    NOT NULL UNIQUE,
  caja               TEXT    NOT NULL DEFAULT 'C1',
  fecha              TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  vendedora_id       INTEGER REFERENCES personal(id) ON DELETE SET NULL,
  vendedora          TEXT    NOT NULL DEFAULT '',
  subtotal           INTEGER NOT NULL DEFAULT 0,
  descuento          INTEGER NOT NULL DEFAULT 0,
  descuento_tipo     TEXT    NOT NULL DEFAULT '',
  descuento_valor    INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  piezas             INTEGER NOT NULL DEFAULT 0,
  estado             TEXT    NOT NULL DEFAULT 'cobrada',
  motivo_cancelacion TEXT    NOT NULL DEFAULT '',
  cancelada_por      TEXT    NOT NULL DEFAULT '',
  cancelada_en       TEXT,
  corte_id           INTEGER REFERENCES caja_cortes(id) ON DELETE SET NULL,
  nota               TEXT    NOT NULL DEFAULT '',
  guardada_en        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  -- 'vendedora' es quien hizo la venta (se elige al cobrar); 'cobro' es la
  -- cuenta con la que se entro a la caja, que puede ser VENTAS.
  cobro              TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_caja_ventas_fecha  ON caja_ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_caja_ventas_corte  ON caja_ventas(corte_id);
CREATE INDEX IF NOT EXISTS idx_caja_ventas_vend   ON caja_ventas(vendedora_id, fecha DESC);

-- El precio y la descripcion se copian a la linea a proposito: si manana
-- sube el precio del vestido, el ticket de ayer debe seguir diciendo lo
-- que de verdad se cobro. 'precio_lista' es el precio registrado cuando se
-- cobro: si es distinto de 'precio', la vendedora lo cambio para esa venta.
-- Las bases de antes no la tienen: la agrega columnasNuevas() en db.ts.
CREATE TABLE IF NOT EXISTS caja_venta_lineas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id     TEXT    NOT NULL REFERENCES caja_ventas(id) ON DELETE CASCADE,
  modelo_id    INTEGER REFERENCES modelos(id) ON DELETE SET NULL,
  codigo       TEXT    NOT NULL DEFAULT '',
  descripcion  TEXT    NOT NULL DEFAULT '',
  piezas       INTEGER NOT NULL DEFAULT 1,
  precio       INTEGER NOT NULL DEFAULT 0,
  importe      INTEGER NOT NULL DEFAULT 0,
  sin_respaldo INTEGER NOT NULL DEFAULT 0,
  precio_lista INTEGER
);
CREATE INDEX IF NOT EXISTS idx_caja_lineas_venta  ON caja_venta_lineas(venta_id);
CREATE INDEX IF NOT EXISTS idx_caja_lineas_modelo ON caja_venta_lineas(modelo_id);

-- Una venta puede llevar mas de un pago (mitad tarjeta, mitad efectivo).
-- Hoy la pantalla solo permite uno, pero la tabla ya lo aguanta para que
-- el dia que lo pidan sea agregar botones y no mover la base.
CREATE TABLE IF NOT EXISTS caja_pagos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id TEXT    NOT NULL REFERENCES caja_ventas(id) ON DELETE CASCADE,
  forma    TEXT    NOT NULL DEFAULT 'efectivo',
  monto    INTEGER NOT NULL DEFAULT 0,
  recibido INTEGER NOT NULL DEFAULT 0,
  cambio   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_caja_pagos_venta ON caja_pagos(venta_id);

-- Ajustes de la caja. Tabla propia y no la 'config' de bodega porque
-- aquella la borra el script de mantenimiento de la bodega.
CREATE TABLE IF NOT EXISTS caja_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;
