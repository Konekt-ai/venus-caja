# Pruebas de la caja

Se corren con `npm test` desde la carpeta de la caja, en la computadora de la bodega. No
hacen falta ni internet ni el servidor prendido: la prueba busca la base de datos de verdad
del sistema de bodega (`../venus-gestion/data/venus.db`), la COPIA a una carpeta temporal de
Windows y trabaja nada mas sobre la copia, que borra al terminar. La base real nunca se abre
para escribir, asi que se pueden correr las pruebas a media jornada sin miedo. Si la bodega
esta instalada en otro lado, se le dice cual base copiar: `VENUS_DB_REAL=C:/Venus/venus-gestion/data/venus.db npm test`.
Sobre la copia se siembra lo minimo para poder cobrar (una vendedora y piezas en la tienda)
y de ahi en adelante todo pasa por las mismas funciones que usa la pantalla de cobrar,
`registrarVenta` y `cancelarVenta`, con el catalogo real completo. Cada renglon sale
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
**10** que un renglon con piezas negativas o con media pieza no pase; **11** que una etiqueta
con un codigo que bodega ya corrigio siga encontrando la prenda (la tabla `codigos_anteriores`
es de bodega y puede no existir: se prueba con y sin ella, que un codigo que fue de dos
prendas no encuentre ninguna, y que un codigo reasignado abra a su dueno actual); y **12**
que un precio o una descripcion que bodega acaba de cambiar salgan en la siguiente lectura
del catalogo, que es lo que la pantalla de cobrar baja cada minuto por `/api/catalogo`.

## Lo que salia en rojo

Las pruebas 9 y 10 nacieron fallando a proposito: documentaban tres errores de
`src/lib/ventas.ts` (la fecha con milesimas se tiraba, las piezas negativas subian el
inventario y la media pieza pasaba). Los tres ya se corrigieron y hoy `npm test` termina
en verde completo.
