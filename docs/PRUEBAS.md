# Pruebas de la caja

Se corren con `npm test` desde la carpeta de la caja, en la computadora de la bodega. No
hacen falta ni internet ni el servidor prendido: la prueba busca la base de datos de verdad
del sistema de bodega (`../venus-gestion/data/venus.db`), la COPIA a una carpeta temporal de
Windows y trabaja nada mas sobre la copia, que borra al terminar. La base real nunca se abre
para escribir, asi que se pueden correr las pruebas a media jornada sin miedo. Si la bodega
esta instalada en otro lado, se le dice cual base copiar: `VENUS_DB_REAL=C:/Venus/venus-gestion/data/venus.db npm test`.
Sobre la copia se siembra lo minimo para poder cobrar (una vendedora y piezas en la tienda)
y de ahi en adelante todo pasa por las mismas funciones que usa la pantalla de cobrar,
`registrarVenta` y `cancelarVenta`, con el catalogo real de 129 modelos. Cada renglon sale
con `ok` o con `FALLA`; al final dice cuantas pasaron y, si fallo alguna, el programa termina
con error para que se note en la consola.

Lo que se prueba, en orden: **1** una venta de tres prendas en efectivo, que saque el folio
`C1-000001`, que el total sume y que el cambio sea el correcto; **2** lo mas importante de
todo, que al cobrar baje `en_tienda` exactamente las piezas vendidas y que la existencia de
BODEGA no se mueva en ningun modelo del catalogo (se compara el inventario completo, renglon
por renglon, antes y despues); **3** que quede un movimiento tipo `venta` por cada renglon,
con la vendedora en `persona`, el folio en la nota y el antes y el despues de bodega iguales,
que es como la bodega se entera de lo que se vendio sin que le muevan sus numeros; **4** que
mandar dos veces la misma venta (mismo id) la guarde una sola vez y no descuente el
inventario doble, que es lo que protege a las ventas cobradas sin internet cuando se
reintenta el envio; **5** que con 10 por ciento de descuento la suma de los importes de los
renglones de exactamente el total, sin perder un centavo al repartir; **6** que cancelar deje
la venta marcada y no la borre, regrese las piezas a la tienda y la saque del corte; **7** que
el corte del dia cuadre por forma de pago, numero de ventas y ticket promedio contra una
libreta que las pruebas llevan aparte conforme cobran; **8** que dos ventas de verdad
simultaneas (dos procesos distintos, sincronizados al mismo milisegundo) no saquen el mismo
folio; **9** que una venta cobrada ayer sin internet y subida hoy conserve la fecha de ayer;
y **10** que un renglon con piezas negativas o con media pieza no pase.

## Lo que hoy sale en rojo

Las pruebas 9 y 10 fallan a proposito: encontraron tres cosas que estan mal en
`src/lib/ventas.ts` y que no se corrigieron aqui, porque ese archivo es de otra persona.

- **La hora del navegador se tira a la basura.** `fechaValida()` solo acepta
  `2026-08-18 17:30:00` o `2026-08-18T17:30:00`. Si viene con milesimas
  (`2026-08-18T17:30:00.000`, que es lo que da `toISOString()`), la funcion regresa `null`,
  la venta se guarda con la fecha del servidor y cae en el corte de HOY. Una venta de ayer
  aparece cobrada hoy y los dos cortes quedan mal, sin ningun aviso.
- **Piezas negativas SUBEN el inventario.** Un renglon con `piezas: -3` se acepta: la tienda
  paso de 47 a 50 piezas al cobrar y la venta quedo con `piezas: -2`. Es una devolucion por
  la puerta de atras, sin cancelacion y sin rastro.
- **Media pieza tambien pasa.** Un renglon con `piezas: 1.5` deja la tienda con 48.5 piezas
  y el corte con piezas fraccionarias.

Las tres se arreglan en el mismo lugar: validando el renglon antes de cobrar (piezas entero
y mayor que cero) y aceptando la fecha con milesimas. Cuando se corrijan, `npm test` debe
terminar en verde y sin tocar este archivo.
