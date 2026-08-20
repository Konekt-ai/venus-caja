import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, guardarAjuste } from "@/lib/db";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Actualizar la caja desde la pantalla, sin ir a la tienda.
 *
 * Lo unico que hace esta ruta es lanzar ACTUALIZAR.bat, el mismo archivo al
 * que se le da doble clic en la computadora de la bodega. El .bat respalda,
 * baja la version nueva, compila, y si algo falla se regresa solito a la
 * version de antes.
 *
 * POR QUE ESTO NO ES UN AGUJERO:
 *  1. Solo pasa el duenio, con su PIN. Las vendedoras no pueden ni abrir la
 *     pantalla de Ajustes.
 *  2. Ademas tiene que estar prendida a proposito en .env.local con
 *     VENUS_PERMITE_ACTUALIZAR=1. Viene apagada de fabrica, asi que una
 *     instalacion que nadie configuro no puede correr nada aunque se filtre
 *     un PIN.
 *  3. No recibe NADA del navegador: ni comando, ni ruta, ni parametro. El
 *     unico programa que se corre esta escrito aqui, con nombre fijo, y es
 *     un archivo del propio proyecto que ya vive en esa computadora: quien
 *     este enfrente de ella puede correrlo con doble clic sin pedir permiso
 *     a nadie. Esta ruta no da un poder nuevo, nada mas evita el viaje.
 */
export async function POST() {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." }, { status: 401 });
  }
  if (!esDuenio(sesion)) {
    return NextResponse.json({ ok: false, error: "Solo el duenio puede actualizar el sistema." }, { status: 403 });
  }

  if (process.env.VENUS_PERMITE_ACTUALIZAR?.trim() !== "1") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "La actualizacion remota esta apagada en esta computadora. " +
          "Para actualizar, entra a la computadora de la bodega y dale doble clic a ACTUALIZAR.bat.",
      },
      { status: 403 }
    );
  }

  const raiz = process.cwd();
  const receta = path.join(raiz, "ACTUALIZAR.bat");
  if (!fs.existsSync(receta)) {
    return NextResponse.json(
      { ok: false, error: `No se encontro el archivo ACTUALIZAR.bat en ${raiz}. Hay que actualizar a mano.` },
      { status: 500 }
    );
  }

  // Se anota ANTES de lanzar: el .bat apaga este servidor a medio camino y
  // despues ya no habria quien lo escriba. Sirve para saber desde cuando
  // lleva actualizandose, por si se quedo trabado y la caja no volvio sola.
  try {
    const db = getDb();
    const cuando = (db.prepare("SELECT datetime('now','localtime') AS d").get() as { d: string }).d;
    guardarAjuste("ultima_actualizacion", cuando);
  } catch {
    // Si la base no abre, igual se actualiza: no se detiene todo por no
    // poder anotar la hora.
  }

  try {
    // Desprendido a proposito: el .bat apaga este mismo servidor a medio
    // camino (paso 6 de 6). Si el proceso colgara de aqui, se moriria justo
    // cuando le toca volver a levantar la caja y quedaria a medias.
    //
    // Node ya no deja lanzar un .bat directo, hay que pasar por cmd. Se usa
    // /d /s /c con la linea entre comillas dobles y windowsVerbatimArguments
    // para que la ruta aguante espacios y parentesis (C:\Users\DiegoB)\...).
    const hijo = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `""${receta}" --silencioso"`], {
      cwd: raiz,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    hijo.unref();

    // Se contesta de inmediato, sin esperar a que termine: el .bat tarda de
    // uno a tres minutos y para entonces este servidor ya no existe.
    return NextResponse.json({
      ok: true,
      mensaje:
        "Empezo la actualizacion. Tarda un par de minutos y la caja se reinicia sola. " +
        "No cierren nada ni apaguen la computadora.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error
            ? `No se pudo empezar la actualizacion: ${e.message}`
            : "No se pudo empezar la actualizacion.",
      },
      { status: 500 }
    );
  }
}
