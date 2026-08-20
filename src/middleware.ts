import { NextResponse, type NextRequest } from "next/server";

/**
 * La red de seguridad de la puerta.
 *
 * Cada pantalla revisa la sesion por su cuenta, que es donde de verdad se
 * decide quien entra. Esto es lo de antes: si algun dia alguien agrega una
 * pantalla nueva y se le olvida revisarla, aqui rebota igual y no se queda
 * abierta al internet sin que nadie lo note. Ya paso una vez.
 *
 * Aqui NO se verifica la firma de la sesion, solo que traiga la galleta:
 * esto corre en el motor ligero de Next, donde no esta la criptografia de
 * Node. La firma se revisa en la pantalla, que es lo que cuenta.
 */

/** Lo unico que se puede abrir sin haber entrado. */
const ABIERTAS = ["/entrar", "/sin-conexion"];

export function middleware(peticion: NextRequest) {
  const ruta = peticion.nextUrl.pathname;

  if (ABIERTAS.includes(ruta)) return NextResponse.next();

  if (peticion.cookies.get("venus_caja")) return NextResponse.next();

  // Las llamadas del programa contestan un error claro; las pantallas mandan
  // a la de entrar. Devolverle una pagina de login a la cola de ventas la
  // dejaria creyendo que la venta se subio.
  if (ruta.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." },
      { status: 401 }
    );
  }

  const destino = peticion.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  return NextResponse.redirect(destino);
}

export const config = {
  /*
   * Se deja fuera todo lo que tiene que servirse sin sesion para que la caja
   * pueda cobrar sin internet: el programa compilado, el trabajador de
   * servicio y los iconos. Si el trabajador de servicio no se pudiera bajar,
   * recargar sin conexion volveria a dejar la pantalla en blanco.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icono.svg).*)"],
};
