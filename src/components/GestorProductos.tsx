"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import {
  crearModelo,
  editarModelo,
  guardarPrecio,
  importarCatalogo,
  ponerPrecioVarios,
  type ResumenImportacion,
} from "@/acciones/productos";
import { buscar } from "@/lib/busqueda";
import { aCentavos, pesosSimple } from "@/lib/dinero";
import type { ModeloCaja } from "@/lib/tipos";
import { Aviso, Boton, Cifra, Insignia, Tarjeta, Vacio } from "./ui";
import {
  IconoBuscar,
  IconoCerrar,
  IconoDescargar,
  IconoMas,
  IconoPalomita,
  IconoPrenda,
} from "./iconos";

/**
 * El catalogo con sus precios.
 *
 * Todo el catalogo viaja al navegador (unos 130 modelos, es poquito) y aqui
 * se filtra y se busca sin ir al servidor, igual que en la pantalla de
 * cobrar. Lo unico que va y viene es lo que se guarda.
 *
 * El precio se teclea en el mismo renglon de la lista, sin abrir otra
 * pantalla: con 129 modelos por capturar, cada clic de mas se paga 129
 * veces.
 */

type AvisoEnPantalla = { tipo: "ok" | "error"; texto: string };

/** Lo que se ve en el campo del precio, ya sea lo tecleado o lo que hay guardado. */
function comoSeVe(modelo: ModeloCaja, borrador: string | undefined): string {
  if (borrador !== undefined) return borrador;
  return modelo.precio > 0 ? pesosSimple(modelo.precio) : "";
}

/** Si lo tecleado vale lo mismo que lo guardado, no hay nada que mandar. */
function esElMismoPrecio(texto: string, modelo: ModeloCaja): boolean {
  const limpio = texto.trim();
  if (!limpio) return modelo.precio <= 0;
  const centavos = aCentavos(limpio);
  return centavos !== null && centavos === modelo.precio;
}

export default function GestorProductos({ catalogo }: { catalogo: ModeloCaja[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [linea, setLinea] = useState("");
  const [soloSinPrecio, setSoloSinPrecio] = useState(false);

  const [borradores, setBorradores] = useState<Record<number, string>>({});
  /**
   * Los que se acaban de capturar se quedan a la vista aunque el filtro sea
   * "solo los que no tienen precio". Si desaparecieran al guardarlos, el
   * renglon se borraria de abajo del cursor y no habria como comprobar lo
   * que se acaba de teclear.
   */
  const [capturados, setCapturados] = useState<number[]>([]);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [precioVarios, setPrecioVarios] = useState("");
  const [recienGuardado, setRecienGuardado] = useState<number | null>(null);

  const [alta, setAlta] = useState(false);
  const [nuevo, setNuevo] = useState({ codigo: "", descripcion: "", categoria: "", precio: "" });

  const [editando, setEditando] = useState<number | null>(null);
  const [edicion, setEdicion] = useState({ descripcion: "", categoria: "" });

  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<{ nombre: string; texto: string } | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);

  const [aviso, setAviso] = useState<AvisoEnPantalla | null>(null);
  const [pendiente, empezar] = useTransition();

  // Para brincar de un precio al siguiente con Enter, que es como se
  // capturan 46 vestidos sin soltar el teclado.
  const camposPrecio = useRef<Array<HTMLInputElement | null>>([]);

  const lineas = useMemo(() => {
    const juntas = new Set<string>();
    for (const modelo of catalogo) juntas.add(modelo.prefijo);
    return Array.from(juntas).sort();
  }, [catalogo]);

  const categorias = useMemo(() => {
    const juntas = new Set<string>();
    for (const modelo of catalogo) if (modelo.categoria) juntas.add(modelo.categoria);
    return Array.from(juntas).sort();
  }, [catalogo]);

  const sinPrecio = useMemo(() => catalogo.filter((m) => m.precio <= 0).length, [catalogo]);

  const visibles = useMemo(() => {
    // buscar() es la misma de la pantalla de cobrar: si "84" encuentra el
    // modelo "084" alla, aqui tiene que encontrarlo igual.
    const base = busqueda.trim() ? buscar(catalogo, busqueda, catalogo.length) : catalogo;
    const recien = new Set(capturados);
    const prefijoBuscado = linea === "(sin)" ? "" : linea;
    return base.filter((modelo) => {
      if (linea && modelo.prefijo !== prefijoBuscado) return false;
      if (soloSinPrecio && modelo.precio > 0 && !recien.has(modelo.id)) return false;
      return true;
    });
  }, [catalogo, busqueda, linea, soloSinPrecio, capturados]);

  const palomeados = useMemo(() => new Set(seleccion), [seleccion]);
  const todosPalomeados = visibles.length > 0 && visibles.every((m) => palomeados.has(m.id));

  /** Al mover un filtro se quita la seleccion: nadie le pone precio a lo que ya no ve. */
  const cambiarFiltro = (aplicar: () => void) => {
    aplicar();
    setSeleccion([]);
    setCapturados([]);
  };

  const palomear = (id: number) => {
    setSeleccion((antes) => (antes.includes(id) ? antes.filter((n) => n !== id) : antes.concat(id)));
  };

  const palomearVisibles = () => {
    setSeleccion(todosPalomeados ? [] : visibles.map((m) => m.id));
  };

  const guardarUno = (modelo: ModeloCaja) => {
    const texto = comoSeVe(modelo, borradores[modelo.id]);
    if (esElMismoPrecio(texto, modelo)) return;

    empezar(async () => {
      const resultado = await guardarPrecio(modelo.id, texto);
      if (resultado.ok) {
        // Se deja escrito lo que quedo guardado para que el renglon no
        // parpadee mientras la pagina se refresca.
        const centavos = resultado.datos?.precio ?? 0;
        setBorradores((antes) => ({ ...antes, [modelo.id]: centavos > 0 ? pesosSimple(centavos) : "" }));
        setRecienGuardado(modelo.id);
        setCapturados((antes) => (antes.includes(modelo.id) ? antes : antes.concat(modelo.id)));
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Precio guardado." });
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const alTeclearPrecio = (e: React.KeyboardEvent<HTMLInputElement>, modelo: ModeloCaja, indice: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Se brinca al renglon de abajo y el salto mismo dispara el onBlur, que
    // es el que guarda. Asi no se manda dos veces el mismo precio y la
    // captura no espera a que conteste el servidor.
    const siguiente = camposPrecio.current[indice + 1];
    if (siguiente) {
      siguiente.focus();
      siguiente.select();
    } else {
      guardarUno(modelo);
    }
  };

  const aplicarPrecioVarios = () => {
    empezar(async () => {
      const resultado = await ponerPrecioVarios(seleccion, precioVarios);
      if (resultado.ok) {
        const centavos = resultado.datos?.precio ?? 0;
        setBorradores((antes) => {
          const copia = { ...antes };
          for (const id of seleccion) copia[id] = pesosSimple(centavos);
          return copia;
        });
        setCapturados((antes) => Array.from(new Set(antes.concat(seleccion))));
        setSeleccion([]);
        setPrecioVarios("");
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Listo." });
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const darDeAlta = () => {
    empezar(async () => {
      const resultado = await crearModelo(nuevo);
      if (resultado.ok) {
        setNuevo({ codigo: "", descripcion: "", categoria: "", precio: "" });
        setAlta(false);
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Modelo dado de alta." });
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const guardarEdicion = (modeloId: number) => {
    empezar(async () => {
      const resultado = await editarModelo(modeloId, edicion.descripcion, edicion.categoria);
      if (resultado.ok) {
        setEditando(null);
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Listo." });
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const elegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = e.target.files && e.target.files[0];
    setResumen(null);
    if (!elegido) {
      setArchivo(null);
      return;
    }
    elegido
      .text()
      .then((texto) => setArchivo({ nombre: elegido.name, texto }))
      .catch(() => setAviso({ tipo: "error", texto: "No se pudo leer el archivo. Intenta de nuevo." }));
  };

  const revisarArchivo = () => {
    if (!archivo) return;
    empezar(async () => {
      const resultado = await importarCatalogo(archivo.texto, true);
      if (resultado.ok) {
        setResumen(resultado.datos ?? null);
        setAviso(null);
      } else {
        setResumen(null);
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  const aplicarArchivo = () => {
    if (!archivo) return;
    empezar(async () => {
      const resultado = await importarCatalogo(archivo.texto, false);
      if (resultado.ok) {
        setArchivo(null);
        setResumen(null);
        setImportando(false);
        setBorradores({});
        setAviso({ tipo: "ok", texto: resultado.mensaje ?? "Catalogo importado." });
      } else {
        setAviso({ tipo: "error", texto: resultado.error });
      }
    });
  };

  return (
    <div className="space-y-5">
      {aviso ? <Aviso tipo={aviso.tipo === "ok" ? "ok" : "error"}>{aviso.texto}</Aviso> : null}

      {/* Tres en un renglon tambien en telefono: con dos y una quedaba
          una tarjeta viuda ocupando media pantalla. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Cifra valor={catalogo.length} texto="Modelos en el catalogo" />
        <Cifra valor={catalogo.length - sinPrecio} texto="Ya tienen precio" tono="ok" />
        <Cifra valor={sinPrecio} texto="Les falta precio" tono={sinPrecio > 0 ? "aviso" : "neutro"} />
      </div>

      <Tarjeta>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem] flex-1">
            <label className="etiqueta" htmlFor="buscar-modelo">
              Buscar
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo">
                <IconoBuscar tamano={18} />
              </span>
              <input
                id="buscar-modelo"
                className="campo pl-10"
                value={busqueda}
                onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
                placeholder="Codigo o descripcion: 194, vd, vestido midi"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <label className="etiqueta" htmlFor="linea-modelo">
              Linea
            </label>
            <select
              id="linea-modelo"
              className="campo w-full sm:w-44"
              value={linea}
              onChange={(e) => cambiarFiltro(() => setLinea(e.target.value))}
            >
              {/* Los modelos sin letras tienen prefijo vacio, igual que
                  "Todas": con el mismo value el filtro nunca distinguia.
                  El (sin) es el comodin que la vuelve elegible. */}
              <option value="">Todas las lineas</option>
              {lineas.map((prefijo) => (
                <option key={prefijo || "solo-numero"} value={prefijo || "(sin)"}>
                  {prefijo || "Sin letras"}
                </option>
              ))}
            </select>
          </div>

          <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-sm border border-linea-fuerte bg-crema px-3 sm:w-auto">
            <input
              type="checkbox"
              className="h-4 w-4 accent-vino"
              checked={soloSinPrecio}
              onChange={(e) => cambiarFiltro(() => setSoloSinPrecio(e.target.checked))}
            />
            <span className="text-sm font-medium text-tinta">Solo los que no tienen precio</span>
          </label>

          {/* En telefono los dos botones llenan su renglon a medias; en
              pantalla ancha se van a la derecha como siempre. */}
          <div className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:justify-end">
            <Boton
              variante="primario"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setAlta(!alta);
                setImportando(false);
              }}
            >
              <IconoMas tamano={17} />
              Modelo nuevo
            </Boton>
            <Boton
              className="flex-1 sm:flex-none"
              onClick={() => {
                setImportando(!importando);
                setAlta(false);
              }}
            >
              <IconoDescargar tamano={17} />
              Importar catalogo
            </Boton>
          </div>
        </div>
      </Tarjeta>

      {alta ? (
        <Tarjeta>
          <div className="mb-3 flex items-center justify-between">
            <p className="titulo text-lg">Modelo nuevo</p>
            <button
              type="button"
              className="text-humo hover:text-vino"
              onClick={() => setAlta(false)}
              aria-label="Cerrar"
            >
              <IconoCerrar tamano={18} />
            </button>
          </div>
          <p className="mb-4 text-sm text-humo">
            Para las prendas que llegan al mostrador antes de que las capturen en la bodega. Nace con
            cero piezas: las piezas entran con el envio de la bodega.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="etiqueta" htmlFor="nuevo-codigo">
                Codigo
              </label>
              <input
                id="nuevo-codigo"
                className="campo codigo w-40"
                value={nuevo.codigo}
                onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                placeholder="VD 194"
                autoComplete="off"
              />
            </div>
            <div className="min-w-[16rem] flex-1">
              <label className="etiqueta" htmlFor="nueva-descripcion">
                Prenda
              </label>
              <input
                id="nueva-descripcion"
                className="campo"
                value={nuevo.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                placeholder="VESTIDO MIDI OLANES"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="nueva-categoria">
                Categoria
              </label>
              <input
                id="nueva-categoria"
                className="campo w-44"
                list="categorias-del-catalogo"
                value={nuevo.categoria}
                onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
                placeholder="VESTIDO"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="nuevo-precio">
                Precio
              </label>
              <input
                id="nuevo-precio"
                className="campo cifra w-32 text-right"
                inputMode="decimal"
                value={nuevo.precio}
                onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })}
                placeholder="650.00"
                autoComplete="off"
              />
            </div>
            <Boton variante="primario" onClick={darDeAlta} disabled={pendiente}>
              Dar de alta
            </Boton>
          </div>
        </Tarjeta>
      ) : null}

      {importando ? (
        <Tarjeta>
          <div className="mb-3 flex items-center justify-between">
            <p className="titulo text-lg">Importar el catalogo</p>
            <button
              type="button"
              className="text-humo hover:text-vino"
              onClick={() => setImportando(false)}
              aria-label="Cerrar"
            >
              <IconoCerrar tamano={18} />
            </button>
          </div>
          <p className="mb-4 text-sm text-humo">
            El archivo CSV que exporta el sistema de bodega, con las columnas codigo, descripcion,
            categoria, tallas, colores y tela. Los que ya existen se actualizan por su codigo, no se
            duplican. Los precios no se tocan.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              className="campo w-auto text-sm"
              onChange={elegirArchivo}
            />
            {archivo ? (
              <Boton onClick={revisarArchivo} disabled={pendiente}>
                Revisar antes de aplicar
              </Boton>
            ) : null}
          </div>

          {resumen ? (
            <div className="mt-4 rounded-sm border border-linea bg-crema p-4">
              <p className="text-sm font-semibold text-tinta">
                Se van a dar de alta {resumen.creados}{" "}
                {resumen.creados === 1 ? "modelo nuevo" : "modelos nuevos"} y a actualizar{" "}
                {resumen.actualizados}.
              </p>
              {resumen.omitidos.length > 0 ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-ambar">
                    {resumen.omitidos.length}{" "}
                    {resumen.omitidos.length === 1 ? "renglon se salta" : "renglones se saltan"}:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-humo">
                    {resumen.omitidos.slice(0, 8).map((o) => (
                      <li key={o.fila}>
                        Renglon {o.fila}: {o.motivo}
                      </li>
                    ))}
                    {resumen.omitidos.length > 8 ? (
                      <li>y {resumen.omitidos.length - 8} mas.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Boton variante="primario" onClick={aplicarArchivo} disabled={pendiente}>
                  Aplicar los cambios
                </Boton>
                <Boton onClick={() => setResumen(null)} disabled={pendiente}>
                  Mejor no
                </Boton>
              </div>
            </div>
          ) : null}
        </Tarjeta>
      ) : null}

      {/* La barra de seleccion se despega del fondo con un borde mas fuerte y
          no con sombra: la identidad de la tienda es de bordes finos. */}
      {seleccion.length > 0 ? (
        <div className="sticky top-2 z-10 rounded-sm border-2 border-oro bg-oro-tenue p-3">
          <div className="flex flex-wrap items-end gap-3">
            <p className="flex min-h-11 items-center text-sm font-semibold text-tinta">
              {seleccion.length} {seleccion.length === 1 ? "modelo elegido" : "modelos elegidos"}
            </p>
            <div>
              <label className="etiqueta" htmlFor="precio-varios">
                El mismo precio para todos
              </label>
              <input
                id="precio-varios"
                className="campo cifra w-36 text-right"
                inputMode="decimal"
                value={precioVarios}
                onChange={(e) => setPrecioVarios(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aplicarPrecioVarios();
                  }
                }}
                placeholder="650.00"
                autoComplete="off"
              />
            </div>
            <Boton variante="primario" onClick={aplicarPrecioVarios} disabled={pendiente}>
              Ponerles el precio
            </Boton>
            <Boton onClick={() => setSeleccion([])} disabled={pendiente}>
              Quitar la seleccion
            </Boton>
          </div>
        </div>
      ) : null}

      {visibles.length === 0 ? (
        <Vacio
          icono={<IconoPrenda tamano={22} />}
          titulo="No hay modelos que se vean asi"
          descripcion="Prueba con otro codigo, con otra linea, o quita el filtro de los que no tienen precio."
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-linea bg-papel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea-fuerte text-left">
                <th className="w-10 px-2 py-2.5 sm:px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-vino"
                    checked={todosPalomeados}
                    onChange={palomearVisibles}
                    aria-label="Elegir todos los de la lista"
                  />
                </th>
                <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo sm:px-3">
                  Codigo
                </th>
                <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo sm:px-3">
                  Prenda
                </th>
                {/* En telefono estas dos columnas son las que sobran: la
                    categoria y las piezas son de referencia, y sin ellas el
                    codigo, la prenda y el precio caben sin deslizar. */}
                <th className="hidden px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-humo md:table-cell">
                  Categoria
                </th>
                <th className="hidden px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-humo sm:table-cell">
                  En tienda
                </th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-humo sm:px-3">
                  Precio
                </th>
                {/* En telefono parado no cabe; girandolo aparece. Poner
                    precios, que es lo que se hace desde el celular, no la
                    necesita. */}
                <th className="hidden px-2 py-2.5 sm:table-cell sm:px-3" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((modelo, indice) => (
                <Fragment key={modelo.id}>
                  <tr className="border-b border-linea last:border-b-0">
                    <td className="px-2 py-2 sm:px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-vino"
                        checked={palomeados.has(modelo.id)}
                        onChange={() => palomear(modelo.id)}
                        aria-label={`Elegir ${modelo.codigo}`}
                      />
                    </td>
                    <td className="codigo whitespace-nowrap px-2 py-2 sm:px-3">{modelo.codigo}</td>
                    <td className="px-2 py-2 sm:px-3">{modelo.descripcion || "Sin descripcion"}</td>
                    <td className="hidden px-3 py-2 text-humo md:table-cell">{modelo.categoria || "-"}</td>
                    <td
                      className={`cifra hidden px-3 py-2 text-right sm:table-cell ${modelo.en_tienda > 0 ? "" : "text-humo"}`}
                    >
                      {modelo.en_tienda}
                    </td>
                    <td className="px-2 py-2 sm:px-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* En telefono la insignia sobra: el campo vacio ya
                            dice "sin precio" y el ancho esta contado. */}
                        {modelo.precio <= 0 && !comoSeVe(modelo, borradores[modelo.id]).trim() ? (
                          <span className="hidden sm:inline-flex">
                            <Insignia tono="aviso">Falta</Insignia>
                          </span>
                        ) : null}
                        {recienGuardado === modelo.id ? (
                          <span className="text-verde">
                            <IconoPalomita tamano={16} />
                          </span>
                        ) : null}
                        <input
                          ref={(el) => {
                            camposPrecio.current[indice] = el;
                          }}
                          className="campo cifra w-20 py-1.5 text-right sm:w-28"
                          inputMode="decimal"
                          value={comoSeVe(modelo, borradores[modelo.id])}
                          onChange={(e) =>
                            setBorradores((antes) => ({ ...antes, [modelo.id]: e.target.value }))
                          }
                          onKeyDown={(e) => alTeclearPrecio(e, modelo, indice)}
                          onBlur={() => guardarUno(modelo)}
                          onFocus={(e) => e.target.select()}
                          placeholder="sin precio"
                          aria-label={`Precio de ${modelo.codigo}`}
                          autoComplete="off"
                        />
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 text-right sm:table-cell sm:px-3">
                      <Boton
                        className="px-2 text-xs sm:px-3"
                        onClick={() => {
                          const abierto = editando === modelo.id;
                          setEditando(abierto ? null : modelo.id);
                          setEdicion({ descripcion: modelo.descripcion, categoria: modelo.categoria });
                        }}
                      >
                        Corregir
                      </Boton>
                    </td>
                  </tr>

                  {editando === modelo.id ? (
                    <tr className="border-b border-linea bg-crema">
                      <td />
                      <td colSpan={6} className="px-3 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[16rem] flex-1">
                            <label className="etiqueta" htmlFor={`descripcion-${modelo.id}`}>
                              Como se llama la prenda
                            </label>
                            <input
                              id={`descripcion-${modelo.id}`}
                              className="campo"
                              value={edicion.descripcion}
                              onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })}
                              autoComplete="off"
                            />
                          </div>
                          <div>
                            <label className="etiqueta" htmlFor={`categoria-${modelo.id}`}>
                              Categoria
                            </label>
                            <input
                              id={`categoria-${modelo.id}`}
                              className="campo w-44"
                              list="categorias-del-catalogo"
                              value={edicion.categoria}
                              onChange={(e) => setEdicion({ ...edicion, categoria: e.target.value })}
                              autoComplete="off"
                            />
                          </div>
                          <Boton
                            variante="primario"
                            onClick={() => guardarEdicion(modelo.id)}
                            disabled={pendiente}
                          >
                            Guardar
                          </Boton>
                          <Boton onClick={() => setEditando(null)}>Cancelar</Boton>
                        </div>
                        <p className="mt-2 text-xs text-humo">
                          Las piezas no se cambian aqui: entran con los envios de la bodega y bajan al
                          cobrar.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <datalist id="categorias-del-catalogo">
        {categorias.map((categoria) => (
          <option key={categoria} value={categoria} />
        ))}
      </datalist>

      <p className="text-xs text-humo">
        El precio se teclea en la lista y se guarda con Enter, que ademas brinca al renglon de abajo.
        Dejarlo en blanco le quita el precio al modelo.
      </p>
    </div>
  );
}
