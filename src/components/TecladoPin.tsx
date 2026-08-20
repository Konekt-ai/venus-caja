"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { entrar } from "@/acciones/sesion";
import { Boton } from "./ui";
import { IconoCandado, IconoMenos } from "./iconos";

/**
 * La entrada a la caja.
 *
 * Con teclado numerico en pantalla porque en el mostrador puede haber una
 * tablet, y con el teclado de verdad tambien: se puede teclear el PIN y dar
 * Enter sin tocar nada. Nadie escribe su nombre, el PIN dice quien es.
 */
export default function TecladoPin({ negocio }: { negocio: string }) {
  const [pin, setPin] = useState("");
  const [error, accion, enviando] = useActionState(entrar, null);
  const formulario = useRef<HTMLFormElement>(null);

  const teclear = (digito: string) => {
    setPin((antes) => (antes.length >= 8 ? antes : antes + digito));
  };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) teclear(e.key);
      else if (e.key === "Backspace") setPin((a) => a.slice(0, -1));
      else if (e.key === "Enter" && pin.length >= 4) formulario.current?.requestSubmit();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [pin]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-marfil p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="marca text-3xl">{negocio}</p>
          <p className="etiqueta mt-2">Caja</p>
        </div>

        <form ref={formulario} action={accion} className="rounded-sm border border-linea bg-papel p-6">
          <input type="hidden" name="pin" value={pin} />

          <div className="mb-5 flex items-center justify-center gap-3">
            <IconoCandado tamano={18} className="text-humo" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full border ${
                    pin.length > i ? "border-vino bg-vino" : "border-linea-fuerte bg-crema"
                  }`}
                />
              ))}
              {pin.length > 4 ? <span className="text-sm text-humo">+{pin.length - 4}</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => teclear(d)}
                className="min-h-16 rounded-sm border border-linea-fuerte bg-papel text-2xl font-semibold text-tinta hover:border-oro hover:bg-oro-tenue active:scale-[0.98]"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin("")}
              className="min-h-16 rounded-sm border border-linea-fuerte bg-crema text-sm font-semibold text-humo hover:border-oro"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => teclear("0")}
              className="min-h-16 rounded-sm border border-linea-fuerte bg-papel text-2xl font-semibold text-tinta hover:border-oro hover:bg-oro-tenue active:scale-[0.98]"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((a) => a.slice(0, -1))}
              className="flex min-h-16 items-center justify-center rounded-sm border border-linea-fuerte bg-crema text-humo hover:border-oro"
              aria-label="Borrar el ultimo numero"
            >
              <IconoMenos tamano={20} />
            </button>
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-rojo">{error}</p> : null}

          <Boton
            type="submit"
            variante="primario"
            tamano="grande"
            className="mt-5 w-full"
            disabled={pin.length < 4 || enviando}
          >
            {enviando ? "Entrando..." : "Entrar"}
          </Boton>
        </form>
      </div>
    </div>
  );
}
