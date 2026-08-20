"use client";

import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  MARGEN_MODULOS,
  codificarCode128,
  codigoBarrasDeModelo,
  revisarCodigoBarras,
} from "@/lib/barras";
import { buscar } from "@/lib/busqueda";
import { formatearCodigo } from "@/lib/codigos";
import type { ModeloCaja } from "@/lib/tipos";
import { Aviso, Boton, Tarjeta, Vacio } from "@/components/ui";
import {
  IconoBuscar,
  IconoCerrar,
  IconoEtiqueta,
  IconoImprimir,
  IconoMas,
  IconoMenos,
} from "@/components/iconos";

/**
 * Hojas de etiquetas para imprimir en la impresora de siempre, en hoja
 * carta comun y corriente. La tienda las corta con tijeras o las imprime
 * en hoja adhesiva; no hace falta una etiquetadora.
 *
 * La medida es 63.5 x 38.1 mm, que es la etiqueta mas facil de conseguir.
 * En carta caben tres columnas por siete filas EXACTAS: 3 x 63.5 = 190.5 mm
 * de ancho (quedan 12.7 mm de margen a cada lado) y 7 x 38.1 = 266.7 mm de
 * alto (6.35 mm arriba y abajo). Son 21 por hoja, no 12: con 12 se
 * desperdiciaria casi media hoja en cada impresion.
 */
const ANCHO_ETIQUETA = 63.5;
const ALTO_ETIQUETA = 38.1;
const COLUMNAS = 3;
const FILAS = 7;
const POR_HOJA = COLUMNAS * FILAS;

/** Milimetros de la barra mas delgada. Menos de 0.25 y el lector barato ya duda. */
const MODULO_MM = 0.4;
/** Lo que queda de ancho util dentro de la etiqueta, ya descontando el margen. */
const ANCHO_BARRAS_MM = 55;
const ALTO_BARRAS_MM = 9;

type Renglon = { modelo: ModeloCaja; cantidad: number };

/** Las barras, dibujadas como rectangulos: es lo que sale nitido en papel. */
function Barras({ texto }: { texto: string }): ReactElement {
  const problema = revisarCodigoBarras(texto);
  if (problema) return <span className="etiqueta-desc">{problema}</span>;

  const codigo = codificarCode128(texto);
  const total = codigo.modulos + MARGEN_MODULOS * 2;
  // Si el codigo es largo se aprieta para no salirse de la etiqueta; si es
  // corto se queda a 0.4 mm por modulo en vez de estirarse de mas.
  const ancho = Math.min(ANCHO_BARRAS_MM, total * MODULO_MM);

  const barras: ReactElement[] = [];
  let x = MARGEN_MODULOS;
  for (let i = 0; i < codigo.anchos.length; i++) {
    const grosor = codigo.anchos[i] ?? 0;
    // Los pares son barra; los impares son el blanco de en medio.
    if (i % 2 === 0) {
      barras.push(<rect key={i} x={x} y={0} width={grosor} height={100} fill="#000000" />);
    }
    x += grosor;
  }

  return (
    <svg
      width={`${ancho.toFixed(2)}mm`}
      height={`${ALTO_BARRAS_MM}mm`}
      viewBox={`0 0 ${total} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {barras}
    </svg>
  );
}

/**
 * Una etiqueta. Lleva el codigo en grande arriba y las barras abajo.
 *
 * No lleva precio a proposito: el precio cambia con las promociones y una
 * etiqueta vieja pegada a la prenda contradiciendo a la caja solo sirve
 * para discutir en el mostrador.
 */
function Etiqueta({ modelo }: { modelo: ModeloCaja }): ReactElement {
  return (
    <div className="etiqueta-papel">
      <span className="codigo etiqueta-codigo">{formatearCodigo(modelo.codigo)}</span>
      <span className="etiqueta-desc">{modelo.descripcion}</span>
      <Barras texto={codigoBarrasDeModelo(modelo.codigo)} />
    </div>
  );
}

export default function HojaEtiquetas({ catalogo }: { catalogo: ModeloCaja[] }): ReactElement {
  const [texto, setTexto] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [guias, setGuias] = useState(true);
  const [saltar, setSaltar] = useState(0);

  const resultados = useMemo(() => buscar(catalogo, texto, 8), [catalogo, texto]);

  function agregar(modelo: ModeloCaja) {
    setTexto("");
    setRenglones((antes) => {
      const ya = antes.some((r) => r.modelo.id === modelo.id);
      if (ya) return antes.map((r) => (r.modelo.id === modelo.id ? { ...r, cantidad: r.cantidad + 1 } : r));
      // Se propone una etiqueta por pieza en tienda: es lo que casi siempre se quiere.
      return [...antes, { modelo, cantidad: Math.max(1, Math.min(99, modelo.en_tienda)) }];
    });
  }

  function cambiar(id: number, cantidad: number) {
    const limpia = Math.max(1, Math.min(999, Math.round(cantidad)));
    setRenglones((antes) => antes.map((r) => (r.modelo.id === id ? { ...r, cantidad: limpia } : r)));
  }

  function quitar(id: number) {
    setRenglones((antes) => antes.filter((r) => r.modelo.id !== id));
  }

  function todoLoDeTienda() {
    const nuevos: Renglon[] = [];
    for (const modelo of catalogo) {
      if (modelo.en_tienda > 0) nuevos.push({ modelo, cantidad: Math.min(999, modelo.en_tienda) });
    }
    setRenglones(nuevos);
  }

  // La lista larga: cada modelo repetido tantas veces como etiquetas pidio,
  // y adelante los huecos de las etiquetas ya despegadas de la hoja.
  const etiquetas: (ModeloCaja | null)[] = [];
  for (let i = 0; i < saltar; i++) etiquetas.push(null);
  for (const renglon of renglones) {
    for (let i = 0; i < renglon.cantidad; i++) etiquetas.push(renglon.modelo);
  }

  const hojas: (ModeloCaja | null)[][] = [];
  for (let i = 0; i < etiquetas.length; i += POR_HOJA) hojas.push(etiquetas.slice(i, i + POR_HOJA));

  let total = 0;
  for (const renglon of renglones) total += renglon.cantidad;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS }} />

      <div className="no-imprimir grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Tarjeta>
          <label className="etiqueta" htmlFor="buscar-etiqueta">
            Buscar el modelo
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo">
              <IconoBuscar tamano={22} />
            </span>
            <input
              id="buscar-etiqueta"
              className="campo campo-buscador"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                const primero = resultados[0];
                if (e.key === "Enter" && primero) {
                  e.preventDefault();
                  agregar(primero);
                }
              }}
              placeholder="Codigo o descripcion"
              autoComplete="off"
              autoFocus
            />
          </div>

          {texto && resultados.length === 0 ? (
            <p className="mt-3 text-sm text-humo">No hay ningun modelo que se llame asi.</p>
          ) : null}

          {resultados.length > 0 ? (
            <ul className="mt-3 divide-y divide-linea">
              {resultados.map((modelo) => (
                <li key={modelo.id}>
                  <button
                    type="button"
                    onClick={() => agregar(modelo)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-oro-tenue"
                  >
                    <span className="codigo w-24 shrink-0">{formatearCodigo(modelo.codigo)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{modelo.descripcion}</span>
                    <span className="shrink-0 text-xs text-humo">{modelo.en_tienda} en tienda</span>
                    <span className="shrink-0 text-oro">
                      <IconoMas tamano={18} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Boton type="button" onClick={todoLoDeTienda}>
              Una por cada pieza en tienda
            </Boton>
            {renglones.length > 0 ? (
              <Boton type="button" onClick={() => setRenglones([])}>
                Quitar todo
              </Boton>
            ) : null}
          </div>
        </Tarjeta>

        <Tarjeta>
          {renglones.length === 0 ? (
            <Vacio
              icono={<IconoEtiqueta tamano={24} />}
              titulo="Todavia no hay etiquetas"
              descripcion="Busca un modelo arriba y agregalo. Caben 21 etiquetas por hoja."
            />
          ) : (
            <>
              <p className="etiqueta">Lo que se va a imprimir</p>
              <ul className="divide-y divide-linea">
                {renglones.map((renglon) => (
                  <li key={renglon.modelo.id} className="flex items-center gap-2 py-2">
                    <span className="codigo w-24 shrink-0">{formatearCodigo(renglon.modelo.codigo)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{renglon.modelo.descripcion}</span>
                    <button
                      type="button"
                      aria-label="Una menos"
                      onClick={() => cambiar(renglon.modelo.id, renglon.cantidad - 1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-linea-fuerte bg-papel hover:border-oro"
                    >
                      <IconoMenos tamano={16} />
                    </button>
                    <input
                      className="campo sin-flechas w-16 shrink-0 text-center"
                      type="number"
                      min={1}
                      max={999}
                      value={renglon.cantidad}
                      onChange={(e) => cambiar(renglon.modelo.id, Number(e.target.value))}
                      aria-label={`Etiquetas de ${renglon.modelo.codigo}`}
                    />
                    <button
                      type="button"
                      aria-label="Una mas"
                      onClick={() => cambiar(renglon.modelo.id, renglon.cantidad + 1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-linea-fuerte bg-papel hover:border-oro"
                    >
                      <IconoMas tamano={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Quitar"
                      onClick={() => quitar(renglon.modelo.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-humo hover:text-rojo"
                    >
                      <IconoCerrar tamano={16} />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-linea pt-4">
                <div>
                  <label className="etiqueta" htmlFor="saltar">
                    Etiquetas ya usadas de la hoja
                  </label>
                  <input
                    id="saltar"
                    className="campo sin-flechas w-24"
                    type="number"
                    min={0}
                    max={POR_HOJA - 1}
                    value={saltar}
                    onChange={(e) =>
                      setSaltar(Math.max(0, Math.min(POR_HOJA - 1, Math.round(Number(e.target.value)))))
                    }
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={guias} onChange={(e) => setGuias(e.target.checked)} />
                  Marcar por donde cortar
                </label>
                <div className="ml-auto flex items-center gap-4">
                  <p className="text-sm text-humo">
                    <span className="cifra font-semibold text-tinta">{total}</span> etiquetas en{" "}
                    <span className="cifra font-semibold text-tinta">{hojas.length}</span>{" "}
                    {hojas.length === 1 ? "hoja" : "hojas"}
                  </p>
                  <Boton
                    type="button"
                    variante="primario"
                    tamano="grande"
                    onClick={() => window.print()}
                    disabled={total === 0}
                  >
                    <IconoImprimir tamano={20} />
                    Imprimir
                  </Boton>
                </div>
              </div>

              {saltar > 0 ? (
                <div className="mt-3">
                  <Aviso tipo="info">
                    La primera hoja empieza en la etiqueta {saltar + 1}. Pon la hoja a la que ya le
                    quitaste {saltar} en la impresora.
                  </Aviso>
                </div>
              ) : null}
            </>
          )}
        </Tarjeta>
      </div>

      {hojas.length > 0 ? (
        <>
          <p className="no-imprimir etiqueta mt-6">Asi va a salir</p>
          <div className="etiquetas-vista">
            {hojas.map((hoja, h) => (
              <div
                key={h}
                className={`hoja etiquetas-hoja ${guias ? "con-guias" : ""} ${
                  h < hojas.length - 1 ? "salto-pagina" : ""
                }`}
              >
                {hoja.map((modelo, i) =>
                  modelo ? (
                    <Etiqueta key={`${h}-${i}`} modelo={modelo} />
                  ) : (
                    <div key={`${h}-${i}`} className="etiqueta-papel" />
                  )
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Todo en milimetros, que es como se mide una etiqueta de verdad.
 *
 * En impresion se esconde lo demas por visibilidad y no por display:none,
 * porque asi no importa como este armado el encabezado de la aplicacion:
 * lo unico que llega al papel son las hojas de etiquetas.
 */
const ESTILOS = `
.etiquetas-vista {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10mm;
  margin-top: 0.75rem;
  overflow-x: auto;
}
.etiquetas-hoja {
  display: grid;
  grid-template-columns: repeat(${COLUMNAS}, ${ANCHO_ETIQUETA}mm);
  grid-auto-rows: ${ALTO_ETIQUETA}mm;
  width: ${COLUMNAS * ANCHO_ETIQUETA}mm;
  background: #fff;
  border: 1px solid #e6dcc7;
}
.etiqueta-papel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1mm;
  padding: 2mm;
  overflow: hidden;
  text-align: center;
  color: #000;
}
.etiqueta-codigo {
  font-size: 13pt;
  line-height: 1.05;
}
.etiqueta-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  max-width: ${ANCHO_ETIQUETA - 5}mm;
  font-size: 7pt;
  line-height: 1.2;
  color: #3a3a3a;
}
/* La guia de corte va en outline y no en borde: el outline no ocupa lugar,
   asi que la etiqueta conserva sus 63.5 x 38.1 mm exactos. */
.con-guias .etiqueta-papel {
  outline: 1px dashed #b9ab90;
  outline-offset: -1px;
}
@page {
  size: letter;
  margin: 6.35mm 12.7mm;
}
@media print {
  body * {
    visibility: hidden;
  }
  .etiquetas-vista,
  .etiquetas-vista * {
    visibility: visible;
  }
  .etiquetas-vista {
    gap: 0;
    margin: 0;
    overflow: visible;
  }
  .etiquetas-hoja {
    border: none;
  }
  .etiqueta-desc {
    color: #000;
  }
}
`;
