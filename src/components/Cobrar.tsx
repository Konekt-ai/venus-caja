"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { salir } from "@/acciones/sesion";
import {
  ajustarFolioLocal,
  catalogoGuardado,
  cola,
  dejarEnEspera,
  encolar,
  guardarCatalogo,
  guardarVentaEnCurso,
  idUnico,
  retomarDeEspera,
  siguienteFolioLocal,
  vaciarCola,
  ventaEnCurso,
  ventasEnEspera,
  type VentaEnEspera,
} from "@/lib/almacen";
import { buscar, hayEmpate, partirCantidad } from "@/lib/busqueda";
import { aCentavos, pesos } from "@/lib/dinero";
import { imprimirDocumento } from "@/lib/imprimir";
import { documentoTicket } from "@/lib/ticket";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO, type FormaPago, type LineaVenta, type ModeloCaja, type TipoDescuento, type VentaParaGuardar } from "@/lib/tipos";
import { Boton, Insignia } from "./ui";
import {
  IconoAlerta,
  IconoBuscar,
  IconoCerrar,
  IconoEfectivo,
  IconoEspera,
  IconoMenos,
  IconoMas,
  IconoCandado,
  IconoPalomita,
  IconoPersona,
  IconoSinRed,
  IconoTarjeta,
  IconoTransferencia,
} from "./iconos";

/**
 * La pantalla de cobrar.
 *
 * Es donde las vendedoras pasan el dia entero, asi que manda una sola cosa:
 * que una venta comun se cobre en menos de veinte segundos y sin soltar el
 * teclado. El cursor vive en el buscador y siempre regresa ahi; todo lo
 * demas (pago, espera, descuento) se abre y se cierra encima.
 *
 * El catalogo entero viaja al navegador y la busqueda corre aqui: sin
 * espera entre tecla y tecla, y sin depender de que haya internet.
 */

type Props = {
  catalogoInicial: ModeloCaja[];
  vendedora: { id: number; nombre: string };
  caja: string;
  negocio: string;
  ultimoFolio: number;
};

type Aviso = { tipo: "ok" | "error" | "info"; texto: string } | null;

/** La fecha tal como la va a guardar la base, en hora local de la tienda. */
function fechaLocal(): string {
  const d = new Date();
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}` +
    `T${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`
  );
}

export default function Cobrar({ catalogoInicial, vendedora, caja, negocio, ultimoFolio }: Props) {
  const [catalogo, setCatalogo] = useState<ModeloCaja[]>(catalogoInicial);
  const [texto, setTexto] = useState("");
  const [seleccion, setSeleccion] = useState(0);
  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [descuentoTipo, setDescuentoTipo] = useState<TipoDescuento>("");
  const [descuentoValor, setDescuentoValor] = useState(0);
  const [pagando, setPagando] = useState(false);
  const [pidiendoPrecio, setPidiendoPrecio] = useState<{ modelo: ModeloCaja; cantidad: number } | null>(null);
  // El renglon de la venta al que se le esta cambiando el precio.
  const [cambiandoPrecio, setCambiandoPrecio] = useState<number | null>(null);
  const [pidiendoDescuento, setPidiendoDescuento] = useState(false);
  const [espera, setEspera] = useState<VentaEnEspera[]>([]);
  const [verEspera, setVerEspera] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [menuVendedora, setMenuVendedora] = useState(false);

  const buscador = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // Hasta no haber leido lo que estaba a medias, no se guarda nada encima.
  const yaSeRestauro = useRef(false);

  const enfocarBuscador = useCallback(() => {
    window.setTimeout(() => buscador.current?.focus(), 0);
  }, []);

  // --- Arranque -----------------------------------------------------------
  useEffect(() => {
    if (catalogoInicial.length > 0) {
      guardarCatalogo(catalogoInicial);
    } else {
      // El servidor no contesto: se cobra con la copia de la ultima vez.
      const copia = catalogoGuardado();
      if (copia.length > 0) {
        setCatalogo(copia);
        setAviso({ tipo: "info", texto: "Sin conexion: se esta usando el catalogo de la ultima vez." });
      }
    }
    ajustarFolioLocal(ultimoFolio);
    setEspera(ventasEnEspera());
    setPendientes(cola().length);
    setEnLinea(window.navigator.onLine);

    // La venta que estaba a medias vuelve sola: si cambiaron de vendedora a
    // mitad del cobro, o si alguien recargo sin querer, nadie tiene que
    // volver a pasar las prendas.
    const aMedias = ventaEnCurso();
    if (aMedias && aMedias.lineas.length) {
      setLineas(aMedias.lineas);
      setDescuentoTipo(aMedias.descuento_tipo as TipoDescuento);
      setDescuentoValor(aMedias.descuento_valor);
    }

    yaSeRestauro.current = true;
    enfocarBuscador();
  }, [catalogoInicial, ultimoFolio, enfocarBuscador]);

  // Se guarda en cada cambio, no al salir: si se va la luz no hay oportunidad
  // de guardar nada.
  useEffect(() => {
    if (!yaSeRestauro.current) return;
    guardarVentaEnCurso({ lineas, descuento_tipo: descuentoTipo, descuento_valor: descuentoValor });
  }, [lineas, descuentoTipo, descuentoValor]);

  // --- Subir lo pendiente -------------------------------------------------
  const sincronizar = useCallback(async () => {
    const { subidas, pendientes: quedan, cambiosDeFolio } = await vaciarCola();
    setPendientes(quedan);

    const cambio = cambiosDeFolio[0];
    if (cambio) {
      setAviso({
        tipo: "info",
        texto: `El ticket que se imprimio como ${cambio.enviado} quedo guardado como ${cambio.quedo}.`,
      });
      return;
    }
    if (subidas > 0) {
      setAviso({
        tipo: "ok",
        texto: `Se subieron ${subidas} ${subidas === 1 ? "venta que estaba" : "ventas que estaban"} pendientes.`,
      });
    }
  }, []);

  // --- Bajar lo nuevo del catalogo ----------------------------------------
  // La pantalla se queda abierta el dia entero: un precio corregido en
  // bodega, un codigo arreglado o una prenda nueva llegan por este camino,
  // en el mismo ciclo de cada minuto que sube las ventas.
  const catalogoNuevo = useRef<{ catalogo: ModeloCaja[]; ultimo_folio: number } | null>(null);
  const [descargas, setDescargas] = useState(0);

  const refrescarCatalogo = useCallback(async () => {
    // Sin conexion ni se intenta: se cobra con lo que hay guardado.
    if (!window.navigator.onLine) return;
    try {
      const respuesta = await fetch("/api/catalogo");
      if (!respuesta.ok) return;
      const datos = (await respuesta.json()) as { ok?: boolean; catalogo?: ModeloCaja[]; ultimo_folio?: number };
      if (!datos.ok || !Array.isArray(datos.catalogo) || datos.catalogo.length === 0) return;
      guardarCatalogo(datos.catalogo);
      catalogoNuevo.current = { catalogo: datos.catalogo, ultimo_folio: datos.ultimo_folio ?? 0 };
      setDescargas((n) => n + 1);
    } catch {
      // Se fue la red a mitad de la descarga: al minuto se reintenta.
    }
  }, []);

  // Lo descargado se aplica cuando nada lo esta usando. Cambiar la lista
  // debajo de una venta capturada, de una busqueda a medio teclear o con
  // ventas sin subir (su existencia local ya se desconto y el servidor
  // todavia no lo sabe) cobraria con datos mezclados.
  useEffect(() => {
    const nuevo = catalogoNuevo.current;
    if (!nuevo) return;
    const ocupado =
      lineas.length > 0 ||
      pagando ||
      pidiendoPrecio !== null ||
      cambiandoPrecio !== null ||
      pidiendoDescuento ||
      verEspera ||
      menuVendedora ||
      texto !== "" ||
      pendientes > 0;
    if (ocupado) return;
    catalogoNuevo.current = null;
    setCatalogo(nuevo.catalogo);
    ajustarFolioLocal(nuevo.ultimo_folio);
  }, [descargas, lineas.length, pagando, pidiendoPrecio, cambiandoPrecio, pidiendoDescuento, verEspera, menuVendedora, texto, pendientes]);

  useEffect(() => {
    const volvio = () => {
      setEnLinea(true);
      void sincronizar();
      void refrescarCatalogo();
    };
    const sefue = () => setEnLinea(false);
    window.addEventListener("online", volvio);
    window.addEventListener("offline", sefue);
    // Cada minuto por si el navegador no avisa del regreso de la conexion,
    // que pasa seguido con el WiFi de la tienda.
    const reloj = window.setInterval(() => {
      void sincronizar();
      void refrescarCatalogo();
    }, 60000);
    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", sefue);
      window.clearInterval(reloj);
    };
  }, [sincronizar, refrescarCatalogo]);

  // --- Busqueda -----------------------------------------------------------
  const { cantidad: cantidadTecleada, resto } = useMemo(() => partirCantidad(texto), [texto]);
  const resultados = useMemo(() => buscar(catalogo, resto, 8), [catalogo, resto]);
  const empatan = useMemo(() => hayEmpate(catalogo, resto), [catalogo, resto]);

  useEffect(() => setSeleccion(0), [texto]);

  // --- Cuentas ------------------------------------------------------------
  const subtotal = useMemo(() => lineas.reduce((a, l) => a + l.precio * l.piezas, 0), [lineas]);
  const descuento = useMemo(() => {
    if (descuentoTipo === "porcentaje") return Math.round((subtotal * Math.max(0, Math.min(100, descuentoValor))) / 100);
    if (descuentoTipo === "pesos") return Math.max(0, Math.min(subtotal, descuentoValor));
    return 0;
  }, [descuentoTipo, descuentoValor, subtotal]);
  const total = subtotal - descuento;
  const piezas = useMemo(() => lineas.reduce((a, l) => a + l.piezas, 0), [lineas]);

  // --- Agregar prendas ----------------------------------------------------
  const agregar = useCallback(
    (modelo: ModeloCaja, cantidad: number) => {
      if (modelo.precio <= 0) {
        // Sin precio no se puede cobrar, pero tampoco se detiene la venta:
        // se pide ahi mismo y se guarda para la proxima vez.
        setPidiendoPrecio({ modelo, cantidad });
        setTexto("");
        return;
      }
      setLineas((antes) => {
        const iguales = antes.findIndex((l) => l.modelo_id === modelo.id && l.precio === modelo.precio);
        if (iguales >= 0) {
          const copia = antes.slice();
          const linea = copia[iguales];
          if (linea) copia[iguales] = { ...linea, piezas: linea.piezas + cantidad };
          return copia;
        }
        return antes.concat([
          {
            modelo_id: modelo.id,
            codigo: modelo.codigo,
            descripcion: modelo.descripcion,
            piezas: cantidad,
            precio: modelo.precio,
            precio_lista: modelo.precio,
          },
        ]);
      });
      setTexto("");
      setAviso(null);
      enfocarBuscador();
    },
    [enfocarBuscador]
  );

  const agregarPrimero = useCallback(() => {
    if (!resultados.length) {
      if (resto.trim()) setAviso({ tipo: "error", texto: `No hay ninguna prenda que se parezca a "${resto}".` });
      return;
    }
    // Con dos resultados igual de buenos, Enter no adivina: obliga a elegir.
    // Vale mas un segundo que cobrarle a la clienta la prenda equivocada.
    if (empatan && seleccion === 0) {
      setAviso({ tipo: "info", texto: "Hay mas de una prenda que puede ser. Elige con las flechas." });
      return;
    }
    const modelo = resultados[seleccion] ?? resultados[0];
    if (modelo) agregar(modelo, cantidadTecleada);
  }, [resultados, empatan, seleccion, resto, agregar, cantidadTecleada]);

  const cambiarPiezas = useCallback((indice: number, delta: number) => {
    setLineas((antes) => {
      const copia = antes.slice();
      const linea = copia[indice];
      if (!linea) return antes;
      const nuevas = linea.piezas + delta;
      if (nuevas <= 0) return copia.filter((_, i) => i !== indice);
      copia[indice] = { ...linea, piezas: nuevas };
      return copia;
    });
  }, []);

  const quitar = useCallback((indice: number) => {
    setLineas((antes) => antes.filter((_, i) => i !== indice));
  }, []);

  const limpiar = useCallback(() => {
    setLineas([]);
    setTexto("");
    setDescuentoTipo("");
    setDescuentoValor(0);
    enfocarBuscador();
  }, [enfocarBuscador]);

  // --- Espera -------------------------------------------------------------
  const guardarEspera = useCallback(() => {
    if (!lineas.length) return;
    setEspera(dejarEnEspera(lineas));
    setLineas([]);
    setDescuentoTipo("");
    setDescuentoValor(0);
    setTexto("");
    setAviso({ tipo: "ok", texto: "La venta quedo en espera. Sigue con la otra clienta." });
    enfocarBuscador();
  }, [lineas, enfocarBuscador]);

  const retomar = useCallback(
    (id: string) => {
      const { lineas: recuperadas, resto: quedan } = retomarDeEspera(id);
      setLineas((antes) => antes.concat(recuperadas));
      setEspera(quedan);
      setVerEspera(false);
      enfocarBuscador();
    },
    [enfocarBuscador]
  );

  // --- Cobrar -------------------------------------------------------------
  const abrirCobro = useCallback(() => {
    if (!lineas.length) {
      setAviso({ tipo: "error", texto: "Todavia no hay nada que cobrar." });
      return;
    }
    setPagando(true);
  }, [lineas.length]);

  const cobrar = useCallback(
    (forma: FormaPago, recibido: number) => {
      const folio = siguienteFolioLocal(caja, ultimoFolio);
      const cambio = forma === "efectivo" ? recibido - total : 0;

      const venta: VentaParaGuardar = {
        id: idUnico(),
        folio,
        vendedora_id: vendedora.id,
        lineas,
        descuento_tipo: descuentoTipo,
        descuento_valor: descuentoValor,
        forma_pago: forma,
        recibido: forma === "efectivo" ? recibido : total,
        nota: "",
        fecha_local: fechaLocal(),
      };

      // Primero el papel y el registro local: la clienta se va con su ticket
      // aunque el servidor no conteste. La subida va detras.
      imprimirDocumento(
        documentoTicket({
          venta: {
            folio,
            fecha: fechaLocal().replace("T", " "),
            vendedora: vendedora.nombre,
            subtotal,
            descuento,
            total,
            piezas,
            estado: "cobrada",
            motivo_cancelacion: "",
            nota: "",
          },
          lineas: lineas.map((l) => ({
            codigo: l.codigo,
            descripcion: l.descripcion,
            piezas: l.piezas,
            precio: l.precio,
            importe: l.precio * l.piezas,
          })),
          pagos: [
            {
              forma,
              monto: total,
              recibido: forma === "efectivo" ? recibido : total,
              cambio,
            },
          ],
        })
      );

      encolar(venta);
      setPendientes(cola().length);

      // La existencia de la copia local baja tambien, para que la pantalla
      // siga diciendo la verdad mientras no haya conexion.
      setCatalogo((antes) =>
        antes.map((m) => {
          const vendido = lineas.filter((l) => l.modelo_id === m.id).reduce((a, l) => a + l.piezas, 0);
          return vendido > 0 ? { ...m, en_tienda: m.en_tienda - vendido } : m;
        })
      );

      setPagando(false);
      limpiar();
      setAviso({
        tipo: "ok",
        texto:
          forma === "efectivo" && cambio > 0
            ? `Cobrado. Su cambio: ${pesos(cambio)}`
            : `Cobrado. Ticket ${folio}`,
      });

      void sincronizar();
    },
    [caja, ultimoFolio, total, vendedora, lineas, descuentoTipo, descuentoValor, subtotal, descuento, piezas, limpiar, sincronizar]
  );

  // --- Precio registrado de una prenda ------------------------------------
  // Cambia en la copia de la pantalla al momento y se manda a la base, que es
  // la misma de bodega: alla tambien queda el precio nuevo.
  const guardarPrecioGeneral = useCallback(async (modeloId: number, precio: number) => {
    setCatalogo((antes) => antes.map((m) => (m.id === modeloId ? { ...m, precio } : m)));
    try {
      const respuesta = await fetch("/api/precio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo_id: modeloId, precio }),
      });
      if (!respuesta.ok) throw new Error("no se guardo");
    } catch {
      setAviso({
        tipo: "info",
        texto:
          "El precio se uso en esta venta, pero no se pudo guardar para las siguientes. Vuelve a ponerlo cuando haya conexion.",
      });
    }
  }, []);

  // --- Guardar un precio que faltaba --------------------------------------
  const ponerPrecio = useCallback(
    async (modelo: ModeloCaja, cantidad: number, precio: number) => {
      setPidiendoPrecio(null);
      agregar({ ...modelo, precio }, cantidad);
      await guardarPrecioGeneral(modelo.id, precio);
    },
    [agregar, guardarPrecioGeneral]
  );

  // --- Cambiar el precio de un renglon -------------------------------------
  // "Solo esta venta" no toca el catalogo: la proxima clienta paga el precio
  // de siempre. "Para siempre" cambia el precio registrado, que es el que
  // ven la bodega y el tianguis.
  const cambiarPrecio = useCallback(
    (indice: number, precio: number, paraSiempre: boolean) => {
      const linea = lineas[indice];
      setCambiandoPrecio(null);
      enfocarBuscador();
      if (!linea) return;

      setLineas((antes) =>
        antes.map((l, i) =>
          i === indice ? { ...l, precio, ...(paraSiempre ? { precio_lista: precio } : {}) } : l
        )
      );

      if (paraSiempre) {
        void guardarPrecioGeneral(linea.modelo_id, precio);
        setAviso({ tipo: "ok", texto: `${linea.codigo} queda en ${pesos(precio)} de aqui en adelante.` });
      } else {
        setAviso({ tipo: "ok", texto: `${linea.codigo} va en ${pesos(precio)} solo en esta venta.` });
      }
    },
    [lineas, enfocarBuscador, guardarPrecioGeneral]
  );

  // --- Teclado ------------------------------------------------------------
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      // Con una ventana abierta encima, ella manda.
      const hayVentana =
        pagando ||
        pidiendoPrecio !== null ||
        cambiandoPrecio !== null ||
        pidiendoDescuento ||
        verEspera ||
        menuVendedora;

      if (e.key === "F4") {
        e.preventDefault();
        if (!hayVentana) abrirCobro();
        return;
      }
      if (e.key === "F7") {
        // La ultima prenda es casi siempre la que la clienta esta regateando.
        e.preventDefault();
        if (!hayVentana && lineas.length) setCambiandoPrecio(lineas.length - 1);
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        if (!hayVentana && lineas.length) setPidiendoDescuento(true);
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (!hayVentana) guardarEspera();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (!hayVentana && espera.length) setVerEspera(true);
        return;
      }
      if (e.key === "F10") {
        // El cambio de turno pasa en el mostrador, no en otra pantalla.
        e.preventDefault();
        if (!hayVentana) router.push("/entrar");
        return;
      }
      if (e.key === "Escape") {
        if (hayVentana) {
          setPagando(false);
          setPidiendoPrecio(null);
          setCambiandoPrecio(null);
          setPidiendoDescuento(false);
          setVerEspera(false);
          setMenuVendedora(false);
          enfocarBuscador();
        } else if (texto) {
          setTexto("");
        }
        return;
      }
      if (hayVentana) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSeleccion((s) => Math.min(s + 1, Math.max(0, resultados.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSeleccion((s) => Math.max(0, s - 1));
        return;
      }
      if (e.key === "Delete" && !texto && lineas.length) {
        e.preventDefault();
        quitar(lineas.length - 1);
        return;
      }

      // Cualquier otra tecla escribe en el buscador, aunque el foco se haya
      // ido a un boton: el lector de codigo de barras teclea muy rapido y no
      // puede perder ni un caracter.
      if (document.activeElement !== buscador.current && e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        buscador.current?.focus();
      }
    };

    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [
    pagando,
    pidiendoPrecio,
    cambiandoPrecio,
    pidiendoDescuento,
    verEspera,
    abrirCobro,
    guardarEspera,
    espera.length,
    lineas.length,
    resultados.length,
    texto,
    quitar,
    enfocarBuscador,
    menuVendedora,
    router,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-marfil">
      {/* Barra de arriba: quien cobra y como anda la conexion */}
      <header className="capitone flex items-center justify-between border-b border-linea-fuerte px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="marca text-xl">Venus</span>
          <span className="etiqueta mb-0">Caja {caja}</span>
        </div>
        <div className="flex items-center gap-3">
          {pendientes > 0 ? (
            <Insignia tono="aviso">
              {pendientes} {pendientes === 1 ? "venta por subir" : "ventas por subir"}
            </Insignia>
          ) : null}
          {!enLinea ? (
            <Insignia tono="aviso">
              <IconoSinRed tamano={14} /> Sin conexion
            </Insignia>
          ) : null}
          {/* El nombre es el boton: es donde la vendedora ya esta mirando
              cuando quiere entregar el turno. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuVendedora((abierto) => !abierto)}
              className="flex items-center gap-2 rounded-sm border border-linea-fuerte bg-papel px-3 py-1.5 text-sm font-semibold text-tinta hover:border-oro hover:bg-oro-tenue"
            >
              <IconoPersona tamano={16} />
              {vendedora.nombre}
              <span className="text-[0.65rem] font-normal text-humo">F10</span>
            </button>

            {menuVendedora ? (
              <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-sm border border-linea-fuerte bg-papel p-3">
                <p className="mb-3 text-xs leading-relaxed text-humo">
                  La venta que llevas no se pierde: al volver a entrar sigue aqui.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/entrar")}
                  className="mb-2 flex w-full items-center gap-2 rounded-sm bg-vino px-3 py-2.5 text-sm font-semibold text-marfil hover:bg-vino-oscuro"
                >
                  <IconoPersona tamano={16} />
                  Cambiar de vendedora
                </button>
                <form action={salir}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-sm border border-linea-fuerte px-3 py-2.5 text-sm font-semibold text-tinta hover:border-oro"
                  >
                    <IconoCandado tamano={16} />
                    Cerrar la caja
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* Izquierda: buscar y agregar */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="relative">
            <IconoBuscar
              tamano={22}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo"
            />
            <input
              ref={buscador}
              className="campo campo-buscador"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarPrimero();
                }
              }}
              placeholder="Codigo o descripcion de la prenda"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Buscar prenda"
            />
          </div>

          {cantidadTecleada > 1 ? (
            <p className="text-sm text-humo">
              Se van a agregar <strong className="text-tinta">{cantidadTecleada} piezas</strong>.
            </p>
          ) : null}

          {resultados.length > 0 ? (
            <ul className="overflow-hidden rounded-sm border border-linea bg-papel">
              {resultados.map((modelo, i) => (
                <li key={modelo.id}>
                  <button
                    type="button"
                    onClick={() => agregar(modelo, cantidadTecleada)}
                    onMouseEnter={() => setSeleccion(i)}
                    className={`flex w-full items-center gap-3 border-b border-linea px-4 py-3 text-left last:border-b-0 ${
                      i === seleccion ? "bg-oro-tenue" : "hover:bg-crema"
                    }`}
                  >
                    <span className="codigo w-24 shrink-0 text-base">{modelo.codigo}</span>
                    <span className="flex-1 truncate text-sm text-tinta">{modelo.descripcion}</span>
                    {modelo.en_tienda <= 0 ? (
                      <Insignia tono="aviso">Sin registro en tienda</Insignia>
                    ) : (
                      <span className="text-xs text-humo">{modelo.en_tienda} en tienda</span>
                    )}
                    <span className="cifra w-28 shrink-0 text-right text-base font-semibold">
                      {modelo.precio > 0 ? pesos(modelo.precio) : "Sin precio"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {aviso ? (
            <div
              className={`flex items-center gap-2 rounded-sm border-l-2 px-4 py-3 text-sm font-medium ${
                aviso.tipo === "ok"
                  ? "border-verde bg-verde-palido text-verde"
                  : aviso.tipo === "error"
                    ? "border-rojo bg-rojo-palido text-rojo"
                    : "border-oro bg-oro-tenue text-tinta"
              }`}
            >
              {aviso.tipo === "ok" ? <IconoPalomita tamano={16} /> : <IconoAlerta tamano={16} />}
              {aviso.texto}
            </div>
          ) : null}
        </div>

        {/* Derecha: la venta */}
        <div className="flex w-full flex-col rounded-sm border border-linea bg-papel lg:w-[30rem]">
          <div className="flex items-center justify-between border-b border-linea px-4 py-2.5">
            <span className="etiqueta mb-0">La venta</span>
            {lineas.length ? (
              <button type="button" onClick={limpiar} className="text-xs font-semibold text-humo hover:text-rojo">
                Vaciar
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {lineas.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-humo">
                Teclea el codigo de la prenda o pasa el lector.
              </p>
            ) : (
              <ul>
                {lineas.map((linea, i) => (
                  <li key={`${linea.modelo_id}-${i}`} className="flex items-center gap-2 border-b border-linea px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="codigo text-sm">{linea.codigo}</p>
                      <p className="truncate text-xs text-humo">{linea.descripcion}</p>
                      {/* El precio es el boton: es donde se mira cuando la
                          clienta pregunta "y si me lo deja en...". */}
                      <button
                        type="button"
                        onClick={() => setCambiandoPrecio(i)}
                        className="mt-0.5 text-xs font-semibold text-vino underline decoration-dotted underline-offset-2 hover:text-vino-oscuro"
                        title="Cambiar el precio (F7 cambia el de la ultima prenda)"
                      >
                        {pesos(linea.precio)} c/u
                      </button>
                      {linea.precio_lista !== undefined && linea.precio_lista !== linea.precio ? (
                        <span className="ml-2 text-xs text-humo line-through">{pesos(linea.precio_lista)}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => cambiarPiezas(i, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-sm border border-linea-fuerte text-humo hover:border-oro"
                        aria-label="Una pieza menos"
                      >
                        <IconoMenos tamano={14} />
                      </button>
                      <span className="cifra w-8 text-center text-base font-semibold">{linea.piezas}</span>
                      <button
                        type="button"
                        onClick={() => cambiarPiezas(i, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-sm border border-linea-fuerte text-humo hover:border-oro"
                        aria-label="Una pieza mas"
                      >
                        <IconoMas tamano={14} />
                      </button>
                    </div>
                    <span className="cifra w-24 text-right text-sm font-semibold">
                      {pesos(linea.precio * linea.piezas)}
                    </span>
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      className="flex h-8 w-8 items-center justify-center text-humo hover:text-rojo"
                      aria-label={`Quitar ${linea.codigo}`}
                    >
                      <IconoCerrar tamano={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-linea-fuerte px-4 py-3">
            {descuento > 0 ? (
              <div className="mb-1 flex items-center justify-between text-sm text-humo">
                <span>
                  Descuento{descuentoTipo === "porcentaje" ? ` (${descuentoValor}%)` : ""}
                </span>
                <span className="cifra">-{pesos(descuento)}</span>
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <span className="etiqueta mb-0">
                Total {piezas > 0 ? `- ${piezas} ${piezas === 1 ? "pieza" : "piezas"}` : ""}
              </span>
              <span className="titulo cifra text-cifra">{pesos(total)}</span>
            </div>

            <Boton
              variante="primario"
              tamano="grande"
              className="mt-3 w-full"
              onClick={abrirCobro}
              disabled={!lineas.length}
            >
              Cobrar (F4)
            </Boton>

            <div className="mt-2 flex gap-2">
              <Boton className="flex-1" onClick={() => setPidiendoDescuento(true)} disabled={!lineas.length}>
                Descuento (F6)
              </Boton>
              <Boton className="flex-1" onClick={guardarEspera} disabled={!lineas.length}>
                <IconoEspera tamano={16} /> Espera (F8)
              </Boton>
              {espera.length > 0 ? (
                <Boton className="flex-1" onClick={() => setVerEspera(true)}>
                  Retomar {espera.length} (F9)
                </Boton>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {pagando ? (
        <VentanaPago
          total={total}
          onCerrar={() => {
            setPagando(false);
            enfocarBuscador();
          }}
          onCobrar={cobrar}
        />
      ) : null}

      {pidiendoPrecio ? (
        <VentanaPrecio
          modelo={pidiendoPrecio.modelo}
          onCerrar={() => {
            setPidiendoPrecio(null);
            enfocarBuscador();
          }}
          onGuardar={(precio) => void ponerPrecio(pidiendoPrecio.modelo, pidiendoPrecio.cantidad, precio)}
        />
      ) : null}

      {cambiandoPrecio !== null && lineas[cambiandoPrecio] ? (
        <VentanaCambiarPrecio
          linea={lineas[cambiandoPrecio]}
          registrado={catalogo.find((m) => m.id === lineas[cambiandoPrecio]?.modelo_id)?.precio ?? 0}
          onCerrar={() => {
            setCambiandoPrecio(null);
            enfocarBuscador();
          }}
          onCambiar={(precio, paraSiempre) => cambiarPrecio(cambiandoPrecio, precio, paraSiempre)}
        />
      ) : null}

      {pidiendoDescuento ? (
        <VentanaDescuento
          subtotal={subtotal}
          onCerrar={() => {
            setPidiendoDescuento(false);
            enfocarBuscador();
          }}
          onAplicar={(tipo, valor) => {
            setDescuentoTipo(tipo);
            setDescuentoValor(valor);
            setPidiendoDescuento(false);
            enfocarBuscador();
          }}
        />
      ) : null}

      {verEspera ? (
        <VentanaEspera
          ventas={espera}
          onCerrar={() => {
            setVerEspera(false);
            enfocarBuscador();
          }}
          onRetomar={retomar}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Ventana({ titulo, children, onCerrar }: { titulo: string; children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4">
      <div className="w-full max-w-lg rounded-sm border border-linea-fuerte bg-papel">
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <h2 className="titulo text-xl">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="text-humo hover:text-tinta" aria-label="Cerrar">
            <IconoCerrar tamano={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const ICONO_FORMA = {
  efectivo: IconoEfectivo,
  tarjeta: IconoTarjeta,
  transferencia: IconoTransferencia,
};

/**
 * El cobro. Se abre con el efectivo ya elegido y el cursor en "con cuanto
 * paga", que es lo que pasa en nueve de cada diez ventas: se teclea la
 * cantidad, Enter, y listo.
 */
function VentanaPago({
  total,
  onCerrar,
  onCobrar,
}: {
  total: number;
  onCerrar: () => void;
  onCobrar: (forma: FormaPago, recibido: number) => void;
}) {
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [recibido, setRecibido] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => campo.current?.focus(), 20);
  }, []);

  const enCentavos = forma === "efectivo" ? (aCentavos(recibido) ?? 0) : total;
  const cambio = enCentavos - total;
  const alcanza = forma !== "efectivo" || enCentavos >= total;

  // Los billetes con los que de verdad paga la gente, mas el importe exacto.
  const sugerencias = useMemo(() => {
    const lista = [total];
    for (const billete of [20000, 50000, 100000]) if (billete > total) lista.push(billete);
    const siguienteCiento = Math.ceil(total / 10000) * 10000;
    if (siguienteCiento > total && !lista.includes(siguienteCiento)) lista.splice(1, 0, siguienteCiento);
    return lista.slice(0, 4);
  }, [total]);

  const confirmar = () => {
    if (!alcanza) return;
    onCobrar(forma, forma === "efectivo" ? enCentavos : total);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4"
      onKeyDown={(e) => {
        const tecla = e.key.toLowerCase();
        if (tecla === "e") setForma("efectivo");
        if (tecla === "t") setForma("tarjeta");
        if (tecla === "r") setForma("transferencia");
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar();
        }
      }}
    >
      <div className="w-full max-w-xl rounded-sm border border-linea-fuerte bg-papel">
        <div className="border-b border-linea px-6 py-4 text-center">
          <p className="etiqueta">Total a cobrar</p>
          <p className="titulo cifra text-cifra-grande text-vino">{pesos(total)}</p>
        </div>

        <div className="p-6">
          <p className="etiqueta">Como paga</p>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {FORMAS_PAGO.map((f) => {
              const Icono = ICONO_FORMA[f];
              const elegida = forma === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForma(f)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-sm border text-sm font-semibold transition-colors ${
                    elegida
                      ? "border-vino bg-vino-palido text-vino"
                      : "border-linea-fuerte bg-papel text-humo hover:border-oro"
                  }`}
                >
                  <Icono tamano={22} />
                  {NOMBRE_FORMA_PAGO[f]}
                  <span className="text-[0.65rem] font-normal opacity-70">
                    {f === "efectivo" ? "E" : f === "tarjeta" ? "T" : "R"}
                  </span>
                </button>
              );
            })}
          </div>

          {forma === "efectivo" ? (
            <>
              <label className="etiqueta" htmlFor="recibido">
                Con cuanto paga
              </label>
              <input
                id="recibido"
                ref={campo}
                className="campo sin-flechas text-2xl"
                inputMode="decimal"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                placeholder="0.00"
                autoComplete="off"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRecibido((s / 100).toFixed(2))}
                    className="rounded-sm border border-linea-fuerte px-3 py-2 text-sm font-semibold text-tinta hover:border-oro hover:bg-oro-tenue"
                  >
                    {s === total ? "Exacto" : pesos(s)}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-end justify-between border-t border-linea pt-4">
                <span className="etiqueta mb-0">Su cambio</span>
                <span className={`titulo cifra text-cifra ${cambio < 0 ? "text-rojo" : "text-verde"}`}>
                  {recibido ? pesos(Math.max(0, cambio)) : pesos(0)}
                </span>
              </div>
              {!alcanza && recibido ? (
                <p className="mt-2 text-sm font-medium text-rojo">
                  No alcanza: faltan {pesos(total - enCentavos)}.
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-sm border border-linea bg-crema px-4 py-6 text-center text-sm text-humo">
              Cobra {pesos(total)} con la terminal y confirma cuando pase.
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <Boton className="flex-1" onClick={onCerrar}>
              Cancelar (Esc)
            </Boton>
            <Boton variante="primario" tamano="grande" className="flex-[2]" onClick={confirmar} disabled={!alcanza}>
              Confirmar y dar ticket
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** El catalogo de bodega no trae precios: la primera vez se captura aqui. */
function VentanaPrecio({
  modelo,
  onCerrar,
  onGuardar,
}: {
  modelo: ModeloCaja;
  onCerrar: () => void;
  onGuardar: (precio: number) => void;
}) {
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.setTimeout(() => campo.current?.focus(), 20);
  }, []);

  const centavos = aCentavos(valor);

  return (
    <Ventana titulo={`Falta el precio de ${modelo.codigo}`} onCerrar={onCerrar}>
      <p className="mb-4 text-sm text-humo">
        {modelo.descripcion}. Se guarda para las proximas ventas; se puede cambiar en Productos.
      </p>
      <input
        ref={campo}
        className="campo sin-flechas text-2xl"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && centavos && centavos > 0) onGuardar(centavos);
        }}
        placeholder="0.00"
        autoComplete="off"
      />
      <div className="mt-5 flex gap-3">
        <Boton className="flex-1" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton
          variante="primario"
          className="flex-1"
          onClick={() => centavos && centavos > 0 && onGuardar(centavos)}
          disabled={!centavos || centavos <= 0}
        >
          Guardar y agregar
        </Boton>
      </div>
    </Ventana>
  );
}

/**
 * Cambiar el precio de una prenda que ya esta en la venta.
 *
 * Enter es "solo esta venta" a proposito: es lo que pasa casi siempre (la
 * clienta regatea) y equivocarse ahi solo afecta un ticket. Cambiar el
 * precio de la prenda para siempre lleva su propio boton, que hay que
 * apretar a conciencia.
 */
function VentanaCambiarPrecio({
  linea,
  registrado,
  onCerrar,
  onCambiar,
}: {
  linea: LineaVenta;
  registrado: number;
  onCerrar: () => void;
  onCambiar: (precio: number, paraSiempre: boolean) => void;
}) {
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.setTimeout(() => campo.current?.focus(), 20);
  }, []);

  const precio = aCentavos(valor) ?? 0;
  const valido = precio > 0;

  return (
    <Ventana titulo={`Precio de ${linea.codigo}`} onCerrar={onCerrar}>
      <p className="mb-1 text-sm text-humo">{linea.descripcion}</p>
      <p className="mb-4 text-sm text-humo">
        Precio registrado: <strong className="text-tinta">{registrado > 0 ? pesos(registrado) : "sin precio"}</strong>
        {linea.precio !== registrado ? (
          <>
            {" "}
            · En esta venta: <strong className="text-tinta">{pesos(linea.precio)}</strong>
          </>
        ) : null}
      </p>
      <label className="etiqueta" htmlFor="precio-nuevo">
        Precio nuevo por pieza
      </label>
      <input
        id="precio-nuevo"
        ref={campo}
        className="campo sin-flechas text-2xl"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valido) onCambiar(precio, false);
        }}
        placeholder={(linea.precio / 100).toFixed(2)}
        autoComplete="off"
      />
      {valido && linea.piezas > 1 ? (
        <p className="mt-2 text-sm text-humo">
          {linea.piezas} piezas: <strong className="text-tinta">{pesos(precio * linea.piezas)}</strong>
        </p>
      ) : null}

      <div className="mt-5 grid gap-2">
        <Boton variante="primario" onClick={() => valido && onCambiar(precio, false)} disabled={!valido}>
          Solo en esta venta (Enter)
        </Boton>
        <Boton onClick={() => valido && onCambiar(precio, true)} disabled={!valido}>
          Cambiar el precio de la prenda
        </Boton>
        <p className="text-xs leading-relaxed text-humo">
          Cambiar el precio de la prenda lo deja para todas las ventas que siguen, y tambien en la bodega y el
          tianguis.
        </p>
        {registrado > 0 && linea.precio !== registrado ? (
          <button
            type="button"
            onClick={() => onCambiar(registrado, false)}
            className="text-left text-sm font-semibold text-humo underline underline-offset-2 hover:text-tinta"
          >
            Regresar al precio registrado ({pesos(registrado)})
          </button>
        ) : null}
      </div>
    </Ventana>
  );
}

/** En la tienda se regatea: el descuento va por venta, en pesos o en por ciento. */
function VentanaDescuento({
  subtotal,
  onCerrar,
  onAplicar,
}: {
  subtotal: number;
  onCerrar: () => void;
  onAplicar: (tipo: TipoDescuento, valor: number) => void;
}) {
  const [tipo, setTipo] = useState<TipoDescuento>("porcentaje");
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.setTimeout(() => campo.current?.focus(), 20);
  }, []);

  const numero = tipo === "porcentaje" ? Number(valor.replace(/[^\d.]/g, "")) || 0 : (aCentavos(valor) ?? 0);
  const rebaja = tipo === "porcentaje" ? Math.round((subtotal * Math.min(100, numero)) / 100) : Math.min(subtotal, numero);

  return (
    <Ventana titulo="Descuento" onCerrar={onCerrar}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["porcentaje", "pesos"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`min-h-12 rounded-sm border text-sm font-semibold ${
              tipo === t ? "border-vino bg-vino-palido text-vino" : "border-linea-fuerte bg-papel text-humo"
            }`}
          >
            {t === "porcentaje" ? "Por ciento" : "En pesos"}
          </button>
        ))}
      </div>
      <input
        ref={campo}
        className="campo sin-flechas text-2xl"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAplicar(tipo, tipo === "porcentaje" ? numero : (aCentavos(valor) ?? 0));
        }}
        placeholder={tipo === "porcentaje" ? "10" : "0.00"}
        autoComplete="off"
      />
      <p className="mt-3 text-sm text-humo">
        Se rebajan <strong className="text-tinta">{pesos(rebaja)}</strong> de {pesos(subtotal)}. Queda en{" "}
        <strong className="text-tinta">{pesos(subtotal - rebaja)}</strong>.
      </p>
      <div className="mt-5 flex gap-3">
        <Boton className="flex-1" onClick={() => onAplicar("", 0)}>
          Quitar descuento
        </Boton>
        <Boton
          variante="primario"
          className="flex-1"
          onClick={() => onAplicar(tipo, tipo === "porcentaje" ? numero : (aCentavos(valor) ?? 0))}
        >
          Aplicar
        </Boton>
      </div>
    </Ventana>
  );
}

/** Las ventas que se dejaron a medias mientras se atiende a otra clienta. */
function VentanaEspera({
  ventas,
  onCerrar,
  onRetomar,
}: {
  ventas: VentaEnEspera[];
  onCerrar: () => void;
  onRetomar: (id: string) => void;
}) {
  return (
    <Ventana titulo="Ventas en espera" onCerrar={onCerrar}>
      {ventas.length === 0 ? (
        <p className="text-sm text-humo">No hay ninguna venta en espera.</p>
      ) : (
        <ul className="divide-y divide-linea">
          {ventas.map((v) => {
            const total = v.lineas.reduce((a, l) => a + l.precio * l.piezas, 0);
            const piezas = v.lineas.reduce((a, l) => a + l.piezas, 0);
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onRetomar(v.id)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-crema"
                >
                  <div className="min-w-0">
                    <p className="codigo text-sm">{v.etiqueta}</p>
                    <p className="text-xs text-humo">
                      {piezas} {piezas === 1 ? "pieza" : "piezas"} - {new Date(v.guardada).toLocaleTimeString("es-MX")}
                    </p>
                  </div>
                  <span className="cifra text-base font-semibold">{pesos(total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Ventana>
  );
}
