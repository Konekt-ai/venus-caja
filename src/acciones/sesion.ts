"use server";

import { redirect } from "next/navigation";
import { abrirSesion, cerrarSesion, hayAlgunPin, pinDelDuenio, verificarPin } from "@/lib/sesion";

/**
 * Entrar con el PIN.
 *
 * Nadie teclea su nombre: el PIN dice quien es. Si la instalacion esta
 * recien hecha y todavia nadie tiene PIN, entra el duenio con el que quedo
 * en la configuracion y desde ahi le pone el suyo a cada vendedora.
 */
export async function entrar(_anterior: string | null, datos: FormData): Promise<string | null> {
  const pin = String(datos.get("pin") ?? "").trim();

  if (!hayAlgunPin()) {
    if (pin === pinDelDuenio()) {
      await abrirSesion({
        id: 0,
        nombre: "Duenio",
        rol: "duenio",
        vence: Date.now() + 12 * 3600 * 1000,
      });
      redirect("/vendedoras");
    }
    return "Todavia no hay vendedoras con PIN. Entra con el PIN del duenio para darlas de alta.";
  }

  if (pin === pinDelDuenio()) {
    await abrirSesion({ id: 0, nombre: "Duenio", rol: "duenio", vence: Date.now() + 12 * 3600 * 1000 });
    redirect("/");
  }

  const intento = verificarPin(pin);
  if (!intento.ok) return intento.error;

  await abrirSesion(intento.sesion);
  redirect("/");
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/entrar");
}
