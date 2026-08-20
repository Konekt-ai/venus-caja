import { NextResponse } from "next/server";
import { pesosSimple } from "@/lib/dinero";
import {
  fechaValida,
  loVendidoPorModelo,
  masVendidos,
  porFormaPago,
  porVendedora,
  rangoDePeriodo,
  ventasPorDia,
  ventasPorMes,
  ventasPorSemana,
} from "@/lib/reportes";
import { esDuenio, sesionActual } from "@/lib/sesion";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Cualquier reporte, bajado como CSV para abrirlo en Excel.
 *
 * El duenio no quiere una pantalla bonita nada mas: quiere el archivo, para
 * sumarlo a mano, mandarlo por WhatsApp o guardarlo del mes. Por eso todo
 * lo que se ve en /reportes tiene aqui su boton de bajar.
 */

/**
 * Un campo del CSV.
 *
 * Excel solo respeta las comillas cuando el campo las necesita, asi que se
 * ponen nada mas si adentro hay coma, comillas o salto de linea. Las
 * comillas de adentro se duplican, que es como manda el formato.
 */
function campo(texto: string): string {
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * El codigo del modelo, para que Excel NO se lo coma.
 *
 * El problema: si en el archivo va "084" pelado, Excel decide que es un
 * numero, lo abre como 84 y se pierde el cero de adelante. Y "084" es justo
 * el codigo que la bodega tiene que reconocer en el rack; con 84 no
 * encuentra nada.
 *
 * La solucion es escribir el campo como una formula de texto: ="084".
 * Excel la evalua y el resultado es la cadena 084, con su cero, alineada a
 * la izquierda como el texto que es. Google Sheets y LibreOffice hacen lo
 * mismo. No se le pone a todos los codigos, solo a los que empiezan con
 * algo que no sea letra ("084", "0-84"), porque un "VD 194" Excel ya lo
 * respeta solo y con la formula el archivo se veria mas dificil de leer.
 */
function campoCodigo(codigo: string): string {
  if (/^[A-Za-z]/.test(codigo)) return campo(codigo);
  return `"=""${codigo.replace(/"/g, '""')}"""`;
}

/**
 * La marca de UTF-8 que va al principio del archivo (U+FEFF).
 *
 * Se escribe con fromCharCode y no como caracter suelto porque en el codigo
 * seria invisible, y el dia que alguien lo borre sin darse cuenta los
 * acentos del catalogo se ven rotos en Excel y nadie sabria por que.
 */
const MARCA_UTF8 = String.fromCharCode(0xfeff);

/** Dinero para Excel: 650.00, con punto decimal y sin separador de miles ni signo de pesos. */
function montoCsv(centavos: number): string {
  return pesosSimple(centavos);
}

type Reporte = { archivo: string; encabezados: string[]; filas: string[][] };

function armarReporte(tipo: string, desde: string, hasta: string): Reporte | null {
  if (tipo === "por-dia" || tipo === "por-semana" || tipo === "por-mes") {
    const filas =
      tipo === "por-dia"
        ? ventasPorDia(desde, hasta)
        : tipo === "por-semana"
          ? ventasPorSemana(desde, hasta)
          : ventasPorMes(desde, hasta);
    return {
      archivo: tipo === "por-dia" ? "ventas-por-dia" : tipo === "por-semana" ? "ventas-por-semana" : "ventas-por-mes",
      encabezados: ["Periodo", "Ventas", "Piezas", "Total"],
      filas: filas.map((f) => [f.etiqueta, String(f.ventas), String(f.piezas), montoCsv(f.total)]),
    };
  }

  if (tipo === "mas-vendidos" || tipo === "mas-vendidos-dinero") {
    const filas = masVendidos(desde, hasta, tipo === "mas-vendidos-dinero" ? "dinero" : "piezas");
    return {
      archivo: tipo === "mas-vendidos-dinero" ? "mas-vendidos-por-dinero" : "mas-vendidos",
      encabezados: ["Codigo", "Descripcion", "Piezas", "Monto"],
      filas: filas.map((f) => [f.codigo, f.descripcion, String(f.piezas), montoCsv(f.monto)]),
    };
  }

  if (tipo === "por-vendedora") {
    return {
      archivo: "por-vendedora",
      encabezados: ["Vendedora", "Ventas", "Piezas", "Monto", "Ticket promedio"],
      filas: porVendedora(desde, hasta).map((f) => [
        f.vendedora,
        String(f.ventas),
        String(f.piezas),
        montoCsv(f.monto),
        montoCsv(f.ticket_promedio),
      ]),
    };
  }

  if (tipo === "por-forma-pago") {
    return {
      archivo: "por-forma-de-pago",
      encabezados: ["Forma de pago", "Ventas", "Monto"],
      filas: porFormaPago(desde, hasta).map((f) => [
        NOMBRE_FORMA_PAGO[f.forma as FormaPago] ?? f.forma,
        String(f.ventas),
        montoCsv(f.monto),
      ]),
    };
  }

  if (tipo === "vendido-por-modelo") {
    return {
      archivo: "vendido-por-modelo",
      encabezados: ["Codigo", "Piezas"],
      filas: loVendidoPorModelo(desde, hasta).map((f) => [f.codigo, String(f.piezas)]),
    };
  }

  return null;
}

/** Los reportes cuya primera columna es un codigo de modelo y necesita el truco del cero. */
const CON_CODIGO = ["mas-vendidos", "mas-vendidos-dinero", "vendido-por-modelo"];

export async function GET(peticion: Request) {
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "La sesion se cerro. Vuelve a entrar con tu PIN." }, { status: 401 });
  }
  if (!esDuenio(sesion)) {
    return NextResponse.json({ ok: false, error: "Los reportes solo los ve el duenio." }, { status: 403 });
  }

  const url = new URL(peticion.url);
  const tipo = (url.searchParams.get("tipo") ?? "").trim();

  // Si las fechas vienen mal o no vienen, se saca el mes en curso en vez de
  // devolver un error: el duenio pidio un archivo, que se lleve uno util.
  const mes = rangoDePeriodo("mes");
  const desde = fechaValida(url.searchParams.get("desde") ?? undefined) ?? mes.desde;
  const hastaCrudo = fechaValida(url.searchParams.get("hasta") ?? undefined) ?? mes.hasta;
  // Al reves no sirve de nada: se voltea sola y el archivo sale igual.
  const [inicio, fin] = desde <= hastaCrudo ? [desde, hastaCrudo] : [hastaCrudo, desde];

  const reporte = armarReporte(tipo, inicio, fin);
  if (!reporte) {
    return NextResponse.json({ ok: false, error: `No hay un reporte que se llame "${tipo}".` }, { status: 400 });
  }

  const conCodigo = CON_CODIGO.indexOf(tipo) >= 0;
  const lineas = [reporte.encabezados.map(campo).join(",")];
  for (const fila of reporte.filas) {
    lineas.push(fila.map((valor, columna) => (conCodigo && columna === 0 ? campoCodigo(valor) : campo(valor))).join(","));
  }

  // Saltos \r\n y el BOM de UTF-8 al principio: sin el BOM, Excel de Windows
  // abre el archivo en su codificacion vieja y los acentos del catalogo salen rotos.
  const csv = MARCA_UTF8 + lineas.join("\r\n") + "\r\n";

  // Un dia solo lleva una fecha en el nombre; un rango lleva las dos. Asi el
  // duenio distingue los archivos en la carpeta de Descargas sin abrirlos.
  const nombre =
    inicio === fin ? `venus-${reporte.archivo}-${inicio}.csv` : `venus-${reporte.archivo}-${inicio}-a-${fin}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
