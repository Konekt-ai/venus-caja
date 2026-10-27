import { pesos } from "./dinero";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO } from "./tipos";

/**
 * El ticket de la clienta, en un solo lugar.
 *
 * Este archivo es la UNICA version del ticket que existe, a proposito. Se usa
 * en los dos caminos:
 *
 *   - Al cobrar, la pantalla lo arma aqui mismo en el navegador y lo manda a
 *     la impresora en un marco oculto, sin preguntarle nada al servidor. Asi
 *     el papel sale igual de rapido con internet que sin el, que es cuando
 *     mas falta hace que la venta no se detenga.
 *   - Al reimprimir desde Ventas del dia, la pagina del servidor arma el
 *     mismo texto con esta misma funcion.
 *
 * Por eso el ticket se arma como cadena y no como componente de React: es lo
 * unico que pueden compartir los dos caminos. Un ticket reimpreso sale
 * identico al original, sin que nadie tenga que acordarse de cambiar dos
 * archivos.
 */

/** Lo que necesita saber el ticket. Es la forma que devuelve obtenerVenta(). */
export type TicketVenta = {
  venta: {
    folio: string;
    fecha: string;
    vendedora: string;
    subtotal: number;
    descuento: number;
    total: number;
    piezas: number;
    estado: string;
    motivo_cancelacion: string;
    nota: string;
  };
  lineas: { codigo: string; descripcion: string; piezas: number; precio: number; importe: number }[];
  pagos: { forma: string; monto: number; recibido: number; cambio: number }[];
};

function escapar(texto: string | number): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "2026-08-19 14:05:22" -> "19/08/2026" y "02:05 p.m." */
function partirFecha(texto: string): { dia: string; hora: string } {
  const partes = (texto || "").trim().split(" ");
  const fecha = partes[0] ?? "";
  const reloj = partes[1] ?? "";
  const f = fecha.split("-");
  const anio = f[0] ?? "";
  const mes = f[1] ?? "";
  const dia = f[2] ?? "";
  const r = reloj.split(":");
  const horas = r[0] ?? "";
  const minutos = r[1] ?? "";

  if (!anio || !mes || !dia) return { dia: texto, hora: "" };

  const n = Number(horas);
  if (!Number.isFinite(n) || !minutos) return { dia: `${dia}/${mes}/${anio}`, hora: "" };

  const doce = n % 12 === 0 ? 12 : n % 12;
  return {
    dia: `${dia}/${mes}/${anio}`,
    hora: `${String(doce).padStart(2, "0")}:${minutos} ${n < 12 ? "a.m." : "p.m."}`,
  };
}

/** La forma de pago viene de la base como texto: si es de las conocidas se muestra bonita. */
function nombreDePago(forma: string): string {
  const conocida = FORMAS_PAGO.find((f) => f === forma);
  return conocida ? NOMBRE_FORMA_PAGO[conocida] : forma;
}

/**
 * El aspecto del ticket. Va aqui adentro y no en un archivo .css aparte
 * porque al imprimir sin internet el marco oculto no puede ir a buscar una
 * hoja de estilos: si no la alcanza, el ticket sale sin formato.
 */
export const CSS_TICKET = `/* ============================================================
   VENUS BOUTIQUE - CAJA
   Hoja de estilos del ticket.

   POR QUE 80mm
   El rollo de 80mm es el estandar del punto de venta en Mexico: es el que
   venden en cualquier papeleria, el mas barato por metro y el que traen de
   fabrica casi todas las termicas de mostrador. De esos 80mm de papel, la
   cabeza imprime unos 72mm; los otros 8 son el margen que el propio rodillo
   no alcanza. Por eso el ticket mide 80mm de ancho con 4mm de relleno a cada
   lado: el texto vive dentro de los 72mm que si salen.

   SI LA TIENDA COMPRA UNA DE 58mm
   Se cambian cuatro cosas y nada mas:
     1. @page  ->  size: 58mm auto;
     2. .ticket -> width: 58mm; padding: 3mm;  (quedan 52mm utiles)
     3. .ticket -> font-size: 10.5px;  si no, las lineas de importes se
        parten en dos renglones y el ticket se ve roto.
     4. .ticket-negocio -> font-size: 1.15rem;  el nombre ya no cabe a 1.5.
   Lo demas (columnas, reglas, totales) se acomoda solo porque todo va en
   porcentaje o en flex, no en anchos fijos.

   COLOR
   La termica no tiene grises ni colores: quema el papel o no lo quema. Un
   #666 sale casi invisible y un borde claro no sale. Aqui todo es #000 puro
   sobre blanco, y las bandas negras llevan print-color-adjust para que el
   navegador no las "ahorre" al imprimir.
   ============================================================ */

@page {
  /* El rollo no tiene hoja: avanza lo que mida el ticket, de ahi el auto.
     El margen se pone en cero porque el margen util ya lo da el padding del
     .ticket; si se deja al navegador, Chrome mete su medio centimetro y el
     ticket sale angosto y recorrido a la derecha. */
  size: 80mm auto;
  margin: 0;
}

/* ---------- El ticket ---------- */

.ticket {
  box-sizing: border-box;
  width: 80mm;
  margin: 0 auto;
  padding: 4mm;
  background: #fff;
  color: #000;
  font-family: Consolas, "Lucida Console", "DejaVu Sans Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.ticket p {
  margin: 0;
}

/* Los renglones de dos columnas son la espina del ticket: concepto a la
   izquierda, dinero a la derecha, siempre en la misma linea. */
.ticket-renglon {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 3mm;
}

.ticket-importe {
  flex: none;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ticket-regla {
  border-top: 1px dashed #000;
  margin: 2.5mm 0;
}

.ticket-regla-fuerte {
  border-top: 1px solid #000;
  margin: 2.5mm 0;
}

/* ---------- Encabezado ---------- */

.ticket-encabezado {
  text-align: center;
  margin-bottom: 3mm;
}

/* La firma de quien hizo el sistema: arriba de todo y chica, para que no
   le quite lugar al nombre de la tienda. Negro puro como todo lo demas: un
   gris no sale en la termica. */
.ticket-firma {
  margin-bottom: 2mm;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-align: center;
}

.ticket-firma strong {
  font-weight: 700;
}

.ticket-negocio {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  line-height: 1.1;
}

.ticket-marca {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
}

.ticket-subtitulo {
  margin-top: 1.5mm;
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

/* ---------- Datos de la venta ---------- */

.ticket-dato {
  display: flex;
  gap: 2mm;
}

.ticket-dato-nombre {
  flex: none;
  width: 19mm;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  padding-top: 0.5mm;
}

.ticket-dato-valor {
  flex: 1 1 auto;
  font-weight: 700;
  word-break: break-word;
}

/* ---------- Prendas ---------- */

.ticket-columnas {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Una prenda nunca se parte entre dos hojas: en carta se veria el precio
   solo, al principio de la pagina siguiente. */
.ticket-prenda {
  margin-bottom: 2mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.ticket-prenda-nombre {
  display: block;
}

.ticket-codigo {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.ticket-cuenta {
  padding-left: 3mm;
  font-variant-numeric: tabular-nums;
}

/* ---------- Totales ---------- */

.ticket-totales .ticket-renglon {
  margin-bottom: 0.8mm;
}

.ticket-total {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
  margin: 1.5mm 0;
}

.ticket-piezas {
  text-align: right;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ticket-pago-forma {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ticket-nota {
  margin-top: 2mm;
  font-size: 0.78rem;
  word-break: break-word;
}

/* ---------- Cancelada ---------- */

/* Banda negra maciza: es la unica forma de que a un metro de distancia se
   sepa que ese papel no vale, sin leerlo. */
.ticket-banda {
  background: #000;
  color: #fff;
  text-align: center;
  padding: 2mm 1mm;
  margin: 2mm 0 3mm;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.ticket-banda-palabra {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  line-height: 1.2;
}

.ticket-banda-nota {
  font-size: 0.72rem;
  letter-spacing: 0.06em;
}

/* ---------- Pie ---------- */

.ticket-pie {
  text-align: center;
  margin-top: 3mm;
}

.ticket-gracias {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 1rem;
}

.ticket-pie-chico {
  margin-top: 1.5mm;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* ---------- En pantalla ---------- */

@media screen {
  .ticket {
    padding: 7mm 4mm;
    border: 1px solid #e6dcc7;
    box-shadow: 0 1px 3px rgba(26, 22, 19, 0.08);
  }
}

/* ---------- Al imprimir ---------- */

@media print {
  /* Repetido a proposito: el ticket tambien se imprime dentro de un iframe
     escondido, y ahi mas vale no depender de que globals.css haya cargado. */
  .no-imprimir {
    display: none !important;
  }

  html,
  body {
    background: #fff !important;
    margin: 0;
    padding: 0;
  }

  .ticket {
    border: 0;
    box-shadow: none;
    padding: 4mm;
  }

  /* Hoja carta (impresora normal). La clase la pone el boton "Imprimir en
     hoja" antes de llamar a print, junto con una regla @page nueva: el
     tamano de pagina no se puede condicionar con una clase, solo se puede
     pisar con otra @page que gane por orden. Aqui el ticket deja de pegarse
     al borde, se centra en la hoja y se enmarca para saber por donde
     cortarlo. */
  html.en-hoja .ticket {
    width: 78mm;
    margin: 0 auto;
    padding: 6mm 5mm;
    border: 1px solid #000;
  }
}
`;

export function armarTicketHtml(datos: TicketVenta): string {
  const v = datos.venta;
  const cancelada = v.estado === "cancelada";
  const { dia, hora } = partirFecha(v.fecha);

  const banda = cancelada
    ? `<div class="ticket-banda">
        <p class="ticket-banda-palabra">CANCELADA</p>
        <p class="ticket-banda-nota">Esta venta no se cobro</p>
        ${v.motivo_cancelacion ? `<p class="ticket-banda-nota">Motivo: ${escapar(v.motivo_cancelacion)}</p>` : ""}
      </div>`
    : "";

  const prendas = datos.lineas
    .map(
      (linea) => `<div class="ticket-prenda">
      <span class="ticket-prenda-nombre"><span class="ticket-codigo">${escapar(linea.codigo)}</span>${
        linea.descripcion ? `  ${escapar(linea.descripcion)}` : ""
      }</span>
      <div class="ticket-renglon">
        <span class="ticket-cuenta">${linea.piezas} x ${escapar(pesos(linea.precio))}</span>
        <span class="ticket-importe">${escapar(pesos(linea.importe))}</span>
      </div>
    </div>`
    )
    .join("");

  const descuento =
    v.descuento > 0
      ? `<div class="ticket-renglon"><span>Descuento</span><span class="ticket-importe">-${escapar(
          pesos(v.descuento)
        )}</span></div>`
      : "";

  const pagos = datos.pagos
    .map((pago) => {
      // Solo el efectivo pasa por el cajon: es el unico que tiene con cuanto
      // pago la clienta y cuanto se le regreso.
      const detalle =
        pago.forma === "efectivo" && pago.recibido > 0
          ? `<div class="ticket-renglon"><span class="ticket-cuenta">Recibido</span><span class="ticket-importe">${escapar(
              pesos(pago.recibido)
            )}</span></div>
             <div class="ticket-renglon"><span class="ticket-cuenta">Cambio</span><span class="ticket-importe">${escapar(
               pesos(pago.cambio)
             )}</span></div>`
          : "";
      return `<div>
        <div class="ticket-renglon">
          <span class="ticket-pago-forma">${escapar(nombreDePago(pago.forma))}</span>
          <span class="ticket-importe">${escapar(pesos(pago.monto))}</span>
        </div>
        ${detalle}
      </div>`;
    })
    .join("");

  return `<article class="ticket">
  <p class="ticket-firma">Powered by <strong>Konekt</strong></p>
  <header class="ticket-encabezado">
    <p class="ticket-negocio">Venus</p>
    <p class="ticket-marca">Boutique</p>
    <p class="ticket-subtitulo">Ticket de venta</p>
  </header>
  ${banda}
  <div class="ticket-regla-fuerte"></div>
  <div class="ticket-dato">
    <span class="ticket-dato-nombre">Folio</span>
    <span class="ticket-dato-valor ticket-codigo">${escapar(v.folio)}</span>
  </div>
  <div class="ticket-dato">
    <span class="ticket-dato-nombre">Fecha</span>
    <span class="ticket-dato-valor">${escapar(dia)}${hora ? `  ${escapar(hora)}` : ""}</span>
  </div>
  <div class="ticket-dato">
    <span class="ticket-dato-nombre">Atendio</span>
    <span class="ticket-dato-valor">${escapar(v.vendedora || "Sin registrar")}</span>
  </div>
  <div class="ticket-regla"></div>
  <div class="ticket-renglon ticket-columnas"><span>Prenda</span><span>Importe</span></div>
  <div class="ticket-regla"></div>
  ${prendas}
  <div class="ticket-regla-fuerte"></div>
  <div class="ticket-totales">
    <div class="ticket-renglon"><span>Subtotal</span><span class="ticket-importe">${escapar(
      pesos(v.subtotal)
    )}</span></div>
    ${descuento}
    <div class="ticket-renglon ticket-total"><span>TOTAL</span><span class="ticket-importe">${escapar(
      pesos(v.total)
    )}</span></div>
    <p class="ticket-piezas">${v.piezas} ${v.piezas === 1 ? "pieza" : "piezas"}</p>
  </div>
  <div class="ticket-regla"></div>
  ${pagos}
  ${v.nota ? `<p class="ticket-nota">Nota: ${escapar(v.nota)}</p>` : ""}
  <div class="ticket-regla"></div>
  <footer class="ticket-pie">
    ${cancelada ? `<p class="ticket-banda-palabra">CANCELADA</p>` : ""}
    <p class="ticket-gracias">Gracias por su compra</p>
    <p class="ticket-pie-chico">Venus Boutique</p>
  </footer>
</article>`;
}

/** El documento completo, listo para meterse en un marco oculto e imprimirse. */
export function documentoTicket(datos: TicketVenta): string {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8" />
<title>Ticket ${escapar(datos.venta.folio)}</title>
<style>${CSS_TICKET}</style>
</head><body>${armarTicketHtml(datos)}</body></html>`;
}
