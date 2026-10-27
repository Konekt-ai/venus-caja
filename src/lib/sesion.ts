import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, guardarAjuste, leerAjuste } from "./db";

/**
 * Quien esta cobrando.
 *
 * La URL de la caja es publica (la tienda entra por internet), asi que hay
 * llave desde el primer dia. Se entra con un PIN corto: el de una vendedora
 * o el PIN compartido de la caja (la cuenta VENTAS), con el que entran
 * todas. Quien VENDIO no sale de aqui: se elige al cobrar, porque en la
 * tienda una atiende a la clienta y otra le cobra.
 */

/**
 * La cuenta compartida con la que entran todas.
 *
 * No es una persona: no vive en 'personal' (asi no aparece en ninguna lista
 * de vendedoras, ni aqui ni en la bodega) y su PIN se guarda en caja_config.
 * Lleva el id -1 porque el 0 ya es del duenio y los positivos son personas.
 */
export const ID_CUENTA_VENTAS = -1;
export const NOMBRE_CUENTA_VENTAS = "VENTAS";

const NOMBRE_COOKIE = "venus_caja";
/** Doce horas: una jornada completa. Que no se cierre a media tarde. */
const DURACION_HORAS = 12;

export type Sesion = {
  id: number;
  nombre: string;
  rol: string;
  vence: number;
};

function llave(): string {
  const configurada = process.env.VENUS_LLAVE_SESION?.trim();
  if (configurada && configurada.length >= 16) return configurada;
  // Sin llave configurada la sesion no se puede firmar de verdad. Se avisa
  // en el registro y se usa una temporal: el sistema sirve, pero al
  // reiniciar el servidor todos tienen que volver a entrar.
  console.warn("Falta VENUS_LLAVE_SESION en .env.local: las sesiones se cerraran al reiniciar.");
  return llaveTemporal;
}
const llaveTemporal = crypto.randomBytes(32).toString("hex");

function firmar(texto: string): string {
  return crypto.createHmac("sha256", llave()).update(texto).digest("base64url");
}

/**
 * El PIN se guarda derivado con PBKDF2 y sal propia, nunca tal cual.
 * Son cuatro digitos: si alguien copia la base, que no se lea de corrido.
 */
export function derivarPin(pin: string, sal: string): string {
  return crypto.pbkdf2Sync(pin, sal, 120000, 32, "sha256").toString("base64");
}

export function guardarPin(personalId: number, pin: string, rol = "vendedora"): void {
  const sal = crypto.randomBytes(16).toString("base64");
  const hash = derivarPin(pin, sal);
  getDb()
    .prepare(
      `INSERT INTO caja_vendedoras (personal_id, pin_hash, pin_sal, rol)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(personal_id) DO UPDATE SET pin_hash = excluded.pin_hash,
                                              pin_sal  = excluded.pin_sal,
                                              rol      = excluded.rol`
    )
    .run(personalId, hash, sal, rol);
}

/** Pone o cambia el PIN de la cuenta VENTAS. */
export function guardarPinVentas(pin: string): void {
  const sal = crypto.randomBytes(16).toString("base64");
  guardarAjuste("pin_ventas_sal", sal);
  guardarAjuste("pin_ventas_hash", derivarPin(pin, sal));
}

/** Quita el PIN de la cuenta VENTAS: con eso ya nadie entra con ella. */
export function quitarPinVentas(): void {
  guardarAjuste("pin_ventas_hash", "");
  guardarAjuste("pin_ventas_sal", "");
}

export function hayPinVentas(): boolean {
  return leerAjuste("pin_ventas_hash") !== "";
}

/** Compara en tiempo constante: el tiempo de respuesta no delata cuantos digitos iban bien. */
function coincide(pin: string, sal: string, hash: string): boolean {
  const intento = derivarPin(pin, sal);
  return intento.length === hash.length && crypto.timingSafeEqual(Buffer.from(intento), Buffer.from(hash));
}

/** true si ese PIN es el de la cuenta VENTAS. */
export function esPinVentas(pin: string): boolean {
  const hash = leerAjuste("pin_ventas_hash");
  return hash !== "" && coincide(pin, leerAjuste("pin_ventas_sal"), hash);
}

export type Entrada = { ok: true; sesion: Sesion } | { ok: false; error: string };

/** Busca a quien le toca ese PIN. Nadie teclea su nombre: solo el PIN. */
export function verificarPin(pin: string): Entrada {
  const limpio = (pin ?? "").trim();
  if (!/^\d{4,8}$/.test(limpio)) return { ok: false, error: "El PIN son de 4 a 8 numeros." };

  const filas = getDb()
    .prepare(
      `SELECT v.personal_id, v.pin_hash, v.pin_sal, v.rol, p.nombre
         FROM caja_vendedoras v
         JOIN personal p ON p.id = v.personal_id
        WHERE v.activa = 1 AND v.pin_hash <> ''`
    )
    .all() as { personal_id: number; pin_hash: string; pin_sal: string; rol: string; nombre: string }[];

  for (const fila of filas) {
    if (coincide(limpio, fila.pin_sal, fila.pin_hash)) {
      return {
        ok: true,
        sesion: {
          id: fila.personal_id,
          nombre: fila.nombre,
          rol: fila.rol,
          vence: Date.now() + DURACION_HORAS * 3600 * 1000,
        },
      };
    }
  }

  if (esPinVentas(limpio)) {
    return {
      ok: true,
      sesion: {
        id: ID_CUENTA_VENTAS,
        nombre: NOMBRE_CUENTA_VENTAS,
        rol: "vendedora",
        vence: Date.now() + DURACION_HORAS * 3600 * 1000,
      },
    };
  }

  return { ok: false, error: "Ese PIN no es de nadie. Vuelve a intentar." };
}

function empaquetar(sesion: Sesion): string {
  const cuerpo = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function desempaquetar(galleta: string): Sesion | null {
  const [cuerpo, firma] = galleta.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = firmar(cuerpo);
  if (firma.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const sesion = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as Sesion;
    // El duenio entra con el id 0, que no esta en la tabla de personal. Aqui
    // hay que preguntar si el id es un numero, no si "tiene valor": un cero
    // se lee como vacio y dejaba al duenio sin poder abrir sus pantallas.
    if (typeof sesion?.id !== "number" || !sesion.nombre || sesion.vence < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

export async function abrirSesion(sesion: Sesion): Promise<void> {
  const galletas = await cookies();
  galletas.set(NOMBRE_COOKIE, empaquetar(sesion), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_HORAS * 3600,
    // En la tienda se entra por HTTPS (tunel) pero en la bodega por
    // http://localhost, donde una cookie "secure" no viajaria.
    secure: process.env.NODE_ENV === "production" && process.env.VENUS_SIN_HTTPS !== "1",
  });
}

export async function cerrarSesion(): Promise<void> {
  const galletas = await cookies();
  galletas.delete(NOMBRE_COOKIE);
}

export async function sesionActual(): Promise<Sesion | null> {
  const galletas = await cookies();
  const galleta = galletas.get(NOMBRE_COOKIE)?.value;
  if (!galleta) return null;
  return desempaquetar(galleta);
}

/** El duenio ve reportes, precios y ajustes; las vendedoras cobran. */
export function esDuenio(sesion: Sesion | null): boolean {
  return sesion?.rol === "duenio";
}

/**
 * Deja lista la primera cuenta cuando la instalacion esta recien hecha: si
 * nadie tiene PIN todavia, el duenio entra con el que quedo en .env.local y
 * desde ahi le pone PIN a cada vendedora.
 */
export function pinDelDuenio(): string {
  return (process.env.VENUS_PIN_DUENIO || "1234").trim();
}

export function hayAlgunPin(): boolean {
  if (hayPinVentas()) return true;
  const fila = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM caja_vendedoras WHERE pin_hash <> '' AND activa = 1`)
    .get() as { n: number };
  return fila.n > 0;
}
