import { redirect } from "next/navigation";
import Navegacion from "@/components/Navegacion";
import PanelAjustes from "@/components/PanelAjustes";
import type { DatosAjustes } from "@/components/PanelAjustes";
import { TituloPagina } from "@/components/ui";
import { RUTA_BASE_DATOS, leerAjuste, nombreCaja } from "@/lib/db";
import { pesosSimple } from "@/lib/dinero";
import { esDuenio, sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar");
  // Aqui se prende y se apaga como cobra la tienda, se baja la base entera y
  // se actualiza el programa. Nada de eso es de una vendedora.
  if (!esDuenio(sesion)) redirect("/");

  const datos: DatosAjustes = {
    bloqueo: false,
    fondo: "0.00",
    caja: nombreCaja(),
    rutaBase: RUTA_BASE_DATOS,
    permiteActualizar: process.env.VENUS_PERMITE_ACTUALIZAR?.trim() === "1",
    baseAbierta: true,
  };

  try {
    datos.bloqueo = leerAjuste("bloquear_sin_existencia", "0") === "1";
    datos.fondo = pesosSimple(parseInt(leerAjuste("fondo_inicial", "0"), 10) || 0);
  } catch (e) {
    // Si la base no abre, esta pantalla es justo la que hay que poder ver:
    // es la que dice a que archivo se esta intentando pegar la caja.
    console.error(e);
    datos.baseAbierta = false;
  }

  return (
    <>
      <Navegacion nombre={sesion.nombre} duenio={esDuenio(sesion)} />
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <TituloPagina
          titulo="Ajustes"
          descripcion="Como se comporta la caja, el respaldo de la base y la actualizacion del sistema."
        />
        <PanelAjustes datos={datos} />
      </main>
    </>
  );
}
