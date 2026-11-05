"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cierreDelDia, recibir, regresar } from "@/acciones/inventarioTianguis";
import { buscar, hayEmpate, partirCantidad } from "@/lib/busqueda";
import type { PrendaDelTianguis } from "@/lib/movimientosTianguis";
import type { ModeloCaja } from "@/lib/tipos";
import { Aviso, Boton, Tarjeta } from "./ui";
import { IconoBuscar, IconoCerrar, IconoMas, IconoMenos } from "./iconos";

type Pestana = "recibir" | "regresar" | "cierre";

const PESTANAS: { valor: Pestana; nombre: string }[] = [
  { valor: "recibir", nombre: "Recibir" },
  { valor: "regresar", nombre: "Regresar" },
  { valor: "cierre", nombre: "Cierre del dia" },
];

type Mensaje = { tipo: "ok" | "error"; texto: string; detalles?: string[] } | null;

function piezas(n: number) {
  return `${n} ${n === 1 ? "pieza" : "piezas"}`;
}

/**
 * Lo que entra y sale del tianguis: recibir de bodega, regresar a bodega y
 * el cierre del dia. Va en su propia pantalla, aparte de cobrar, para que la
 * de cobrar no se llene de botones que no son de vender.
 */
export default function PanelInventarioTianguis({
  catalogo,
  bodega,
  enTianguis,
}: {
  catalogo: ModeloCaja[];
  bodega: Record<number, number>;
  enTianguis: PrendaDelTianguis[];
}) {
  const [pestana, setPestana] = useState<Pestana>("recibir");
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();

  const avisarResultado = (
    r: { ok: true; mensaje?: string; datos?: { folio: string; piezas: number; avisos: string[] } } | { ok: false; error: string },
    hecho: string
  ) => {
    if (r.ok) {
      setMensaje({
        tipo: "ok",
        texto: `${hecho} Hoja ${r.datos?.folio ?? ""}, ${piezas(r.datos?.piezas ?? 0)}.`,
        detalles: r.datos?.avisos,
      });
      router.refresh();
    } else {
      setMensaje({ tipo: "error", texto: r.error });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => {
              setPestana(p.valor);
              setMensaje(null);
            }}
            aria-current={pestana === p.valor ? "true" : undefined}
            className={`min-h-12 rounded-sm border px-2 text-sm font-semibold ${
              pestana === p.valor ? "border-vino bg-vino-palido text-vino" : "border-linea-fuerte bg-papel text-humo"
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {mensaje ? (
        <Aviso tipo={mensaje.tipo === "ok" ? "ok" : "error"}>
          {mensaje.texto}
          {mensaje.detalles?.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs font-normal">
              {mensaje.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </Aviso>
      ) : null}

      {pestana === "recibir" ? (
        <Recibir
          catalogo={catalogo}
          bodega={bodega}
          pendiente={pendiente}
          onRegistrar={(lineas, nota, listo) =>
            empezar(async () => {
              const r = await recibir(lineas, nota);
              avisarResultado(r, "Listo, se registro lo recibido.");
              if (r.ok) listo();
            })
          }
        />
      ) : null}

      {pestana === "regresar" ? (
        <Regresar
          catalogo={catalogo}
          enTianguis={enTianguis}
          pendiente={pendiente}
          onRegistrar={(lineas, listo) =>
            empezar(async () => {
              const r = await regresar(lineas);
              avisarResultado(r, "Listo, se registro el regreso a bodega.");
              if (r.ok) listo();
            })
          }
        />
      ) : null}

      {pestana === "cierre" ? (
        <Cierre
          enTianguis={enTianguis}
          pendiente={pendiente}
          onCerrar={() =>
            empezar(async () => {
              avisarResultado(await cierreDelDia(), "Listo, todo regreso a bodega.");
            })
          }
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * El buscador de prendas: el lector escribe el codigo y da Enter, igual que
 * al cobrar. En pantalla tactil no saca el teclado del telefono en cada
 * escaneo; para escribir a mano esta el boton Teclado.
 */
function Buscador({ catalogo, onElegir }: { catalogo: ModeloCaja[]; onElegir: (m: ModeloCaja, cantidad: number) => void }) {
  const [texto, setTexto] = useState("");
  const [tactil, setTactil] = useState(false);
  const [teclado, setTeclado] = useState(false);
  const [aviso, setAviso] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTactil(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  const { cantidad, resto } = useMemo(() => partirCantidad(texto), [texto]);
  const resultados = useMemo(() => buscar(catalogo, resto, 6), [catalogo, resto]);

  const elegir = (m: ModeloCaja) => {
    onElegir(m, cantidad);
    setTexto("");
    setAviso("");
    setTeclado(false);
    window.setTimeout(() => campo.current?.focus(), 0);
  };

  return (
    <div>
      <div className="relative">
        <IconoBuscar tamano={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-humo" />
        <input
          ref={campo}
          className="campo"
          style={{ paddingLeft: "2.6rem", paddingRight: tactil ? "6.5rem" : undefined }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (!resultados.length) {
              if (resto.trim()) setAviso(`No hay ninguna prenda que se parezca a "${resto}".`);
              return;
            }
            if (hayEmpate(catalogo, resto)) {
              setAviso("Hay mas de una prenda que puede ser: toca la que es.");
              return;
            }
            elegir(resultados[0]!);
          }}
          inputMode={tactil && !teclado ? "none" : "text"}
          enterKeyHint="search"
          placeholder="Escanea o busca la prenda"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Buscar prenda"
          autoFocus
        />
        {tactil ? (
          <button
            type="button"
            onClick={() => {
              setTeclado((t) => !t);
              campo.current?.blur();
              window.setTimeout(() => campo.current?.focus(), 30);
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border px-3 py-2 text-xs font-semibold ${
              teclado ? "border-vino bg-vino-palido text-vino" : "border-linea-fuerte bg-papel text-humo"
            }`}
          >
            Teclado
          </button>
        ) : null}
      </div>
      {aviso ? <p className="mt-2 text-sm font-medium text-rojo">{aviso}</p> : null}
      {resto.trim() && resultados.length ? (
        <ul className="mt-2 overflow-hidden rounded-sm border border-linea bg-papel">
          {resultados.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => elegir(m)}
                className="flex w-full items-baseline gap-2 border-b border-linea px-3 py-3 text-left last:border-b-0 hover:bg-crema"
              >
                <span className="codigo shrink-0">{m.codigo}</span>
                <span className="truncate text-sm text-tinta">{m.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** El - n + de cada renglon, con botones del tamano del pulgar. */
function Piezas({ valor, maximo, onCambiar }: { valor: number; maximo?: number; onCambiar: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onCambiar(Math.max(0, valor - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-sm border border-linea-fuerte text-humo"
        aria-label="Una pieza menos"
      >
        <IconoMenos tamano={14} />
      </button>
      <span className="cifra w-9 text-center text-base font-semibold">{valor}</span>
      <button
        type="button"
        onClick={() => onCambiar(maximo === undefined ? valor + 1 : Math.min(maximo, valor + 1))}
        className="flex h-10 w-10 items-center justify-center rounded-sm border border-linea-fuerte text-humo"
        aria-label="Una pieza mas"
      >
        <IconoMas tamano={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Recibir({
  catalogo,
  bodega,
  pendiente,
  onRegistrar,
}: {
  catalogo: ModeloCaja[];
  bodega: Record<number, number>;
  pendiente: boolean;
  onRegistrar: (lineas: { modelo_id: number; piezas: number }[], nota: string, listo: () => void) => void;
}) {
  const [lista, setLista] = useState<{ modelo: ModeloCaja; piezas: number }[]>([]);
  const [nota, setNota] = useState("");
  const total = lista.reduce((s, l) => s + l.piezas, 0);

  // Escanear la misma prenda otra vez suma una pieza.
  const agregar = (modelo: ModeloCaja, cantidad: number) =>
    setLista((antes) => {
      const i = antes.findIndex((l) => l.modelo.id === modelo.id);
      if (i < 0) return [{ modelo, piezas: cantidad }, ...antes];
      const copia = antes.slice();
      copia[i] = { modelo, piezas: copia[i]!.piezas + cantidad };
      return copia;
    });

  return (
    <div className="space-y-3">
      <Tarjeta>
        <p className="mb-3 text-sm text-humo">
          Escanea cada prenda que llego de la bodega. Si es la misma, se suma una pieza.
        </p>
        <Buscador catalogo={catalogo} onElegir={agregar} />
      </Tarjeta>

      {lista.length ? (
        <ul className="divide-y divide-linea overflow-hidden rounded-sm border border-linea bg-papel">
          {lista.map((l, i) => (
            <li key={l.modelo.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="codigo text-sm">{l.modelo.codigo}</p>
                <p className="truncate text-xs text-humo">{l.modelo.descripcion}</p>
                <p className="text-xs text-humo">
                  En bodega: {bodega[l.modelo.id] ?? 0} · En tianguis: {l.modelo.piezas}
                </p>
              </div>
              <Piezas
                valor={l.piezas}
                onCambiar={(n) =>
                  setLista((antes) =>
                    n === 0 ? antes.filter((_, k) => k !== i) : antes.map((x, k) => (k === i ? { ...x, piezas: n } : x))
                  )
                }
              />
              <button
                type="button"
                onClick={() => setLista((antes) => antes.filter((_, k) => k !== i))}
                className="flex h-10 w-8 items-center justify-center text-humo"
                aria-label={`Quitar ${l.modelo.codigo}`}
              >
                <IconoCerrar tamano={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lista.length ? (
        <Tarjeta>
          <label className="etiqueta" htmlFor="nota-recibir">
            Nota (opcional)
          </label>
          <input
            id="nota-recibir"
            className="campo"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Quien lo trajo, de que viaje..."
            autoComplete="off"
          />
          <Boton
            variante="primario"
            tamano="grande"
            className="mt-3 w-full"
            disabled={pendiente || total === 0}
            onClick={() =>
              onRegistrar(
                lista.map((l) => ({ modelo_id: l.modelo.id, piezas: l.piezas })),
                nota,
                () => {
                  setLista([]);
                  setNota("");
                }
              )
            }
          >
            Registrar lo recibido ({piezas(total)})
          </Boton>
          <p className="mt-2 text-xs text-humo">
            Baja de la bodega y sube al tianguis, con su hoja y folio. Si la bodega no las tenia registradas, se
            reciben igual y se cuadra en el conteo.
          </p>
        </Tarjeta>
      ) : null}
    </div>
  );
}

function Regresar({
  catalogo,
  enTianguis,
  pendiente,
  onRegistrar,
}: {
  catalogo: ModeloCaja[];
  enTianguis: PrendaDelTianguis[];
  pendiente: boolean;
  onRegistrar: (lineas: { modelo_id: number; piezas: number }[], listo: () => void) => void;
}) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [aviso, setAviso] = useState("");
  const total = Object.values(cantidades).reduce((s, n) => s + n, 0);
  const maximo = (id: number) => enTianguis.find((p) => p.id === id)?.en_tianguis ?? 0;

  if (!enTianguis.length) {
    return (
      <Tarjeta>
        <p className="text-sm text-humo">No hay nada registrado en el tianguis para regresar.</p>
      </Tarjeta>
    );
  }

  return (
    <div className="space-y-3">
      <Tarjeta>
        <p className="mb-3 text-sm text-humo">
          Escanea lo que regresa a la bodega, o ajusta las piezas en la lista.
        </p>
        <Buscador
          catalogo={catalogo.filter((m) => maximo(m.id) > 0)}
          onElegir={(m, cantidad) => {
            const tope = maximo(m.id);
            const actual = cantidades[m.id] ?? 0;
            if (actual >= tope) {
              setAviso(`De ${m.codigo} solo hay ${piezas(tope)} en el tianguis.`);
              return;
            }
            setAviso("");
            setCantidades((c) => ({ ...c, [m.id]: Math.min(tope, actual + cantidad) }));
          }}
        />
        {aviso ? <p className="mt-2 text-sm font-medium text-rojo">{aviso}</p> : null}
      </Tarjeta>

      <ul className="divide-y divide-linea overflow-hidden rounded-sm border border-linea bg-papel">
        {enTianguis.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="codigo text-sm">{p.codigo}</p>
              <p className="truncate text-xs text-humo">{p.descripcion}</p>
              <p className="text-xs text-humo">En tianguis: {p.en_tianguis}</p>
            </div>
            <button
              type="button"
              onClick={() => setCantidades((c) => ({ ...c, [p.id]: p.en_tianguis }))}
              className="rounded-sm border border-linea-fuerte px-2 py-2 text-xs font-semibold text-humo"
            >
              Todo
            </button>
            <Piezas
              valor={cantidades[p.id] ?? 0}
              maximo={p.en_tianguis}
              onCambiar={(n) => setCantidades((c) => ({ ...c, [p.id]: n }))}
            />
          </li>
        ))}
      </ul>

      <Boton
        variante="primario"
        tamano="grande"
        className="w-full"
        disabled={pendiente || total === 0}
        onClick={() =>
          onRegistrar(
            Object.entries(cantidades).map(([id, n]) => ({ modelo_id: Number(id), piezas: n })),
            () => setCantidades({})
          )
        }
      >
        Regresar a bodega ({piezas(total)})
      </Boton>
    </div>
  );
}

function Cierre({
  enTianguis,
  pendiente,
  onCerrar,
}: {
  enTianguis: PrendaDelTianguis[];
  pendiente: boolean;
  onCerrar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const total = enTianguis.reduce((s, p) => s + p.en_tianguis, 0);

  if (!enTianguis.length) {
    return (
      <Tarjeta>
        <p className="text-sm text-humo">No quedo nada en el tianguis: no hay que regresar.</p>
      </Tarjeta>
    );
  }

  return (
    <div className="space-y-3">
      <Tarjeta>
        <p className="text-sm text-tinta">
          Al terminar el dia, todo lo que quedo en el tianguis regresa a la bodega en una sola hoja:{" "}
          <strong>{piezas(total)}</strong> de {enTianguis.length} {enTianguis.length === 1 ? "modelo" : "modelos"}.
        </p>
        <p className="mt-1 text-xs text-humo">
          Si algo se va a quedar en el tianguis o ya se vendio sin registrar, primero ajustalo en Regresar.
        </p>
      </Tarjeta>

      <ul className="divide-y divide-linea overflow-hidden rounded-sm border border-linea bg-papel">
        {enTianguis.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="codigo text-sm">{p.codigo}</p>
              <p className="truncate text-xs text-humo">{p.descripcion}</p>
            </div>
            <span className="cifra shrink-0 text-base font-semibold">{p.en_tianguis}</span>
          </li>
        ))}
      </ul>

      {confirmando ? (
        <div className="grid grid-cols-2 gap-2">
          <Boton tamano="grande" onClick={() => setConfirmando(false)}>
            Mejor no
          </Boton>
          <Boton
            variante="primario"
            tamano="grande"
            disabled={pendiente}
            onClick={() => {
              setConfirmando(false);
              onCerrar();
            }}
          >
            Si, regresar todo
          </Boton>
        </div>
      ) : (
        <Boton variante="primario" tamano="grande" className="w-full" onClick={() => setConfirmando(true)}>
          Regresar todo a bodega ({piezas(total)})
        </Boton>
      )}
    </div>
  );
}
