# Venus — Caja

La caja de la tienda. Sirve para **cobrar rapido**: se teclea el codigo de la
prenda o se pasa el lector, se cobra, sale el ticket y la pantalla queda lista
para la siguiente clienta.

Es el hermano del [sistema de bodega](https://github.com/Konekt-ai/venus-gestion),
y no es un sistema aparte: **los dos usan la misma base de datos**. Por eso, al
cobrar una prenda, en la bodega ven la venta en el momento y las piezas se
descuentan de lo que hay en la tienda.

---

## Como se enciende

En la computadora de la bodega, doble clic en **`INICIAR.bat`**.

Mientras esa ventana negra este abierta, la caja esta encendida. Para apagarla,
se cierra la ventana.

- En la computadora de la bodega: <http://localhost:3001>
- En la computadora de la tienda: la direccion de internet que quedo
  configurada (ver `docs/INSTALACION.md`)

La primera vez hay que instalarlo: clic derecho en **`INSTALAR.bat`** >
Ejecutar como administrador, una sola vez, y el mismo archivo va explicando
lo que hace. Para que la tienda entre por internet hace falta el tunel
(`docs/INSTALACION.md`, seccion 3): hoy es Tailscale Funnel, un solo comando;
si algun dia hay dominio propio, esta **`INSTALAR-TUNEL.bat`** para el de
Cloudflare.

---

## Como se cobra

El cursor siempre esta en el buscador. Una venta comun no necesita el mouse:

| Se teclea | Que pasa |
| --- | --- |
| `vd194` y Enter | agrega el vestido y limpia el campo |
| `84` y Enter | agrega el modelo `084` |
| `2*cd281` y Enter | agrega 2 piezas del conjunto |
| `F4` | abre el cobro, con efectivo ya elegido |
| `500` y Enter | calcula el cambio, guarda, imprime y limpia la pantalla |

El lector de codigo de barras entra por el mismo camino: teclea el codigo y
manda Enter.

### Las teclas

| Tecla | Para que |
| --- | --- |
| `Enter` | agrega la prenda que esta arriba en la lista |
| `Flechas` | elegir otra de la lista |
| `F4` | cobrar |
| `F6` | descuento a toda la venta (en por ciento o en pesos) |
| `F7` | cambiar el precio de la ultima prenda |
| `F8` | dejar la venta en espera y atender a otra clienta |
| `F9` | retomar una venta que quedo en espera |
| `F10` | cambiar de vendedora (entrega de turno) |
| `Supr` | quitar la ultima prenda |
| `Esc` | cerrar lo que este abierto |

Al cobrar en efectivo, `E` elige efectivo, `T` tarjeta y `R` transferencia.

### Cambiar el precio en el mostrador

En la venta, debajo de cada prenda esta su precio por pieza: al tocarlo (o con
`F7` para la ultima) se escribe el precio nuevo y se elige:

- **Solo en esta venta** (Enter): se cobra ese precio en este ticket y la
  prenda sigue con su precio de siempre. En la bodega, en **Ventas**, esa
  prenda aparece con el precio registrado al lado, para saber que se rebajo.
- **Cambiar el precio de la prenda**: el precio nuevo se queda para todas las
  ventas que siguen, y tambien lo ven la bodega y el tianguis.

El descuento de `F6` es otra cosa: va sobre **toda** la venta. Para rebajar
una sola prenda se le cambia el precio solo en esta venta.

### Entrar, cambiar de turno y salir

Lo normal es entrar con el **PIN de VENTAS**, que es uno solo para todas (el
duenio lo pone en **Vendedoras**). VENTAS no es una persona: no aparece en la
lista de vendedoras ni en la bodega. Tambien se puede dar un PIN propio a una
vendedora. La sesion dura doce horas: una jornada completa, para que no se
cierre a media tarde.

### Quien hizo la venta

Al cobrar (`F4`), arriba de la ventana se elige **quien hizo la venta**, porque
muchas veces una atiende a la clienta y otra le cobra. Con el teclado: la
primera letra del nombre y Enter, y el cursor pasa a "con cuanto paga". Sin
elegirla no deja cobrar. Si se entro con el PIN propio de una vendedora, ya
viene elegida ella, pero se puede cambiar.

La venta queda a nombre de quien la hizo (en el ticket, en los reportes y en
la bodega). En **Ventas del dia** se ve ademas con que cuenta se cobro.

Para que alguien aparezca en la lista basta con darla de alta en
**Vendedoras** (o en Personal, en la bodega); no necesita PIN.

Para entregar el turno se aprieta `F10` o se toca el nombre de arriba a la
derecha, y la otra entra con su PIN. **La venta que este a medias no
se pierde**: se queda guardada en la computadora y reaparece en cuanto la
siguiente entra. Lo mismo pasa si alguien recarga la pagina sin querer o si se
va la luz un momento.

En ese mismo lugar esta **Cerrar la caja**, que es lo que se usa al terminar el
dia. Desde las otras pantallas se sale con el boton de la barra de arriba.

### La busqueda perdona

Los codigos se escriben como cada quien se acuerda, y los encuentra igual:

| Si se escribe | Encuentra |
| --- | --- |
| `84` | `084` |
| `vd194`, `VD-194`, `vd 194` | `VD 194` |
| `194` | `VD 194` |
| `olanes`, `midi` | por descripcion |

Si dos prendas le quedan igual de bien a lo que se tecleo, Enter **no adivina**:
pide elegir. Vale mas un segundo que cobrarle a la clienta la prenda
equivocada.

---

## Que pasa si se cae el internet

**Se sigue cobrando.** Es la regla mas importante del sistema: si no se puede
cobrar, se pierde la venta.

El catalogo completo vive en la computadora de la tienda, asi que la busqueda
sigue funcionando. La venta se guarda ahi mismo, el ticket se imprime igual, y
en cuanto vuelve la conexion las ventas se suben solas. Arriba a la derecha
aparece cuantas van pendientes.

Lo que no se puede sin internet: ver reportes y que en la bodega vean las ventas
del momento. Se ven en cuanto vuelve.

---

## El inventario

La caja **si descuenta** el inventario, pero solo el de la tienda:

- `existencia` son las piezas que estan en la **bodega**, en su rack.
- `en_tienda` son las que ya se mandaron a la **tienda**.

Cuando se cobra una prenda, baja `en_tienda`. La existencia de la bodega no se
toca, porque esa pieza salio del rack cuando se hizo el envio. En el historial
de la bodega aparece un movimiento de tipo `venta` con el nombre de la vendedora
y el folio del ticket.

**Mientras la bodega no registre los envios a la tienda**, casi todos los
modelos tienen cero piezas en tienda. La caja **no detiene la venta** por eso:
cobra, deja la linea marcada y lo reporta en el corte. Cuando el inventario ya
sea confiable, se enciende el candado en **Ajustes** y entonces si avisa que no
alcanza.

---

## Las pantallas

- **Cobrar** — la principal, donde se pasa el dia.
- **Ventas del dia** — lo cobrado, el corte de caja, reimprimir un ticket y
  cancelar uno equivocado (no se borra: queda marcado con su motivo).
- **Productos** — el catalogo con sus precios. El catalogo de la bodega no trae
  precios: se capturan aqui, y tambien se pueden poner varios de golpe.
- **Reportes** — ventas por dia, semana y mes; lo mas vendido por piezas y por
  dinero; como va cada vendedora; y las ventas por forma de pago. Todo se puede
  bajar a Excel.
- **Vendedoras** — quien puede quedar como quien hizo la venta, el PIN de
  VENTAS y los PIN propios.
- **Etiquetas** — imprimir los codigos de barras de la propia tienda.
- **Ajustes** — respaldo, el candado del inventario y la actualizacion.

---

## El corte de caja

El corte dice cuanto **deberia** haber en el cajon:

```
  fondo con el que abrio
+ efectivo cobrado
- retiros del dia
= lo que debe haber
```

Lo de tarjeta y transferencia se reporta aparte, porque ese dinero nunca paso
por el cajon. Al cerrar se cuenta el efectivo y la diferencia queda anotada: no
se corrige ni se esconde, que es justo lo que sirve para revisarla despues.

---

## Para quien da soporte

- **Actualizar desde casa:** ver `docs/INSTALACION.md`. Tambien se puede hacer
  ahi mismo con doble clic en `ACTUALIZAR.bat`, que saca respaldo antes y se
  regresa solo si algo sale mal.
- **Respaldo:** en Ajustes, un boton. Se baja un archivo con todo: el inventario
  de la bodega y las ventas. Ademas hay uno automatico diario.
- **La base de datos** no vive en este proyecto: vive en el de la bodega, y la
  ruta se configura en `.env.local` (`VENUS_DB`). Si esa ruta esta mal, la caja
  lo dice al abrirse.
- **La computadora de la tienda es Windows 8.** Ahi el navegador mas nuevo que
  existe es Chrome 109 o Firefox ESR 115. Por eso el proyecto esta fijado en
  Next.js 15 y Tailwind 3: las versiones siguientes no corren en ese navegador.
  No actualizar esas dos sin leer `docs/INSTALACION.md`.
- **La tienda entra por un tunel.** Hoy es Tailscale Funnel en la computadora
  de la bodega: `tailscale funnel status` dice la direccion y si esta vivo.
  La alternativa con dominio propio es Cloudflare Tunnel (`INSTALAR-TUNEL.bat`
  lo deja como servicio de Windows llamado `Cloudflared`); los dos vienen en
  `docs/INSTALACION.md`, seccion 3.

---

## Pruebas

```
npm test
```

Cobra ventas de verdad contra una copia de la base y comprueba lo que importa:
que el total cuadre, que `en_tienda` baje exactamente lo vendido, que la
existencia de la bodega no se mueva, que una venta reintentada no se guarde dos
veces y que los reportes sumen lo mismo que se cobro.

---

Hecho por [Konekt](https://konekt.ai) para Venus Boutique.
