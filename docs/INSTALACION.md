# Como instalar la caja de Venus

Esta guia esta escrita para que la siga cualquiera, sin saber de computadoras.
Se lee de arriba hacia abajo. Si algo no sale, al final hay una seccion de
"Cuando algo falla".

Hay dos computadoras en esta historia:

- **La de la BODEGA.** Es la que hace todo el trabajo. Ahi vive el programa y
  ahi esta la base de datos. Tiene que quedar prendida.
- **La de la TIENDA.** Solo abre el navegador y entra a la caja por internet.
  No se le instala nada mas que el navegador y la impresora.

---

## 1. Que se necesita

En la computadora de la **bodega**:

- Windows 10 u 11.
- **Node.js**, version 20 o mas nueva. Se baja gratis de <https://nodejs.org>.
  Se elige el boton que dice **LTS** y se instala dandole Siguiente a todo.
- **Git**, de <https://git-scm.com>. Tambien Siguiente a todo. Sirve para
  bajar el programa y para actualizarlo despues.
- El sistema de bodega (venus-gestion) ya instalado y funcionando. La caja
  no tiene base de datos propia: **escribe en la misma base que la bodega**.
  Por eso al cobrar baja el inventario de verdad y en la bodega ven las
  ventas del dia conforme van pasando.
- Que la computadora este conectada a internet y no se apague sola. Conviene
  entrar a Configuracion > Sistema > Iniciar/Apagar y poner que la pantalla
  se apague pero que **el equipo nunca se suspenda**.

En la computadora de la **tienda**:

- Windows 8 esta bien. Es vieja pero para esto alcanza.
- Firefox ESR 115 o Chrome 109 (son las ultimas versiones que corren en
  Windows 8; mas adelante viene como configurarlas).
- La impresora termica de tickets instalada y probada desde Windows.

---

## 2. Instalar en la bodega

**Paso 1.** Abre la carpeta donde quieras dejar el programa. Lo mas comodo es
ponerlo al lado del sistema de bodega, o sea que las dos carpetas queden
hermanas:

```
C:\Venus\venus-gestion     <- el sistema de bodega, ya instalado
C:\Venus\venus-caja        <- la caja, la que vamos a instalar
```

Si quedan asi, el instalador encuentra la base de datos solo y no hay que
escribir ninguna ruta a mano.

**Paso 2.** Dentro de `C:\Venus`, da clic derecho en un espacio vacio y elige
**"Abrir en Terminal"** (o "Abrir ventana de PowerShell aqui"). Pega esto y
dale Enter:

```
git clone https://github.com/Konekt-ai/venus-caja.git
```

Se va a crear la carpeta `venus-caja`. Ya puedes cerrar esa ventana negra.

**Paso 3.** Entra a la carpeta `venus-caja`. Vas a ver un archivo que se
llama **INSTALAR.bat**. Dale **clic derecho** y elige
**"Ejecutar como administrador"**.

> Tiene que ser como administrador. Si le das doble clic normal, el
> instalador te lo va a decir y se va a salir sin hacer nada. Los permisos
> se necesitan para dejar programado que la caja encienda sola.

**Paso 4.** El instalador va solo, pero te va a preguntar dos cosas:

1. **Donde esta la base de datos de la bodega.** Si los dos proyectos
   quedaron hermanos, ya te la propone y solo le das **Enter**. Si no,
   escribe la ruta completa del archivo `venus.db`, por ejemplo
   `C:\Venus\venus-gestion\data\venus.db`. Tambien puedes arrastrar el
   archivo a la ventana y se escribe solo.
2. **La contrasena del duenio.** Es la que abre Reportes, Productos y
   Ajustes. Las vendedoras entran con su PIN, esta es aparte. Si le das
   Enter se queda `1234`, pero **mejor cambiala**.

**Paso 5.** Espera. El paso de "instalando lo que necesita" tarda varios
minutos y parece que no hace nada; si hay letras moviendose, va bien.

Cuando termine te va a decir:

- Que dejo programado el **encendido automatico**: cada vez que prendan la
  computadora de la bodega, la caja se levanta sola. Nadie tiene que abrir
  nada.
- Que dejo programado el **respaldo diario** a las 22:30. Todas las noches
  guarda una copia de la base en la carpeta `respaldos\`. Se guardan los
  ultimos 30 dias y los mas viejos se borran solos.
- Las **direcciones** para entrar.

**Paso 6.** Para encender la caja en ese momento sin reiniciar, cierra el
instalador y dale doble clic a **INICIAR.bat**. Se abre el navegador en
`http://localhost:3001`. Esa ventana negra **no se cierra**: mientras este
abierta, la caja esta prendida.

Hasta aqui la caja ya funciona en la bodega y en cualquier computadora de la
misma red. Falta que entre la tienda, que esta en otro lado.

---

## 3. Que la tienda entre por internet (Cloudflare Tunnel)

La tienda no esta en la misma red que la bodega, asi que no puede entrar por
la direccion `192.168.x.x`. La solucion es un **tunel**: un programita en la
computadora de la bodega que se conecta a Cloudflare y publica la caja en una
direccion de internet.

Es **gratis**, y lo mejor: **no hay que abrir puertos en el modem** ni pedirle
nada al proveedor de internet. El tunel sale de adentro hacia afuera, como
cuando abres una pagina.

Lo unico que se necesita es un **dominio** (algo como `venusboutique.com`)
metido en Cloudflare. Si no hay, se compra uno; los hay de menos de 200 pesos
al ano.

### Paso a paso

**1.** Haz una cuenta gratis en <https://dash.cloudflare.com> y agrega ahi tu
dominio. Cloudflare te dice que cambies los "nameservers" donde compraste el
dominio; hazlo y espera a que diga **Active** (tarda de minutos a unas horas).

**2.** En el menu de la izquierda entra a **Zero Trust** > **Networks** >
**Tunnels** y dale a **Create a tunnel**. Elige **Cloudflared**, ponle de
nombre `venus-caja` y guarda.

**3.** Cloudflare te muestra una pantalla con el comando para instalarlo.
Elige **Windows** y **64-bit**. Te va a dar dos cosas:

- Un enlace para bajar `cloudflared.exe`. Bajalo y guardalo, por ejemplo, en
  `C:\Venus\cloudflared.exe`.
- Un comando largo que termina con un token (una tira larguisima de letras).

**4.** En la computadora de la bodega, abre una Terminal **como
administrador** y corre ese comando, apuntando al archivo que bajaste. Se ve
mas o menos asi (el token es el tuyo, no copies este):

```
C:\Venus\cloudflared.exe service install eyJhIjoiMWEyYjNjNGQ1ZTZmN2c...
```

Eso deja el tunel instalado **como servicio de Windows**: arranca solo cuando
prende la computadora, igual que la caja, y no hay que abrir ninguna ventana.

**5.** Vuelve a la pagina de Cloudflare. Ahora te pide la ruta publica. Llena:

| Campo | Que se pone |
|---|---|
| Subdomain | `caja` |
| Domain | tu dominio, por ejemplo `venusboutique.com` |
| Type | `HTTP` |
| URL | `localhost:3001` |

Guarda. En un minuto la caja ya se abre desde cualquier lado en
**`https://caja.venusboutique.com`**.

> Fijate que sea `localhost:3001` y no otro puerto: 3001 es el de la caja.
> El 3000 es el sistema de bodega, y ese **no** conviene publicarlo.

**6.** Comprueba desde tu celular con los datos moviles apagados del WiFi de
la bodega. Si abre, quedo.

### Un candado extra (opcional pero recomendable)

La caja ya pide PIN, pero si quieres que ni siquiera la pantalla de entrada
se vea desde internet, en Zero Trust > **Access** > **Applications** puedes
agregar la direccion y dejar que solo entren ciertos correos. Es gratis
hasta 50 personas.

---

## 4. Configurar la computadora de la tienda

El chiste aqui es que la vendedora le de a **Cobrar** y el ticket salga solo,
sin que aparezca la ventana de "imprimir" pidiendo confirmacion. Con clientas
esperando, esa ventana estorba.

Primero, en Windows: entra a **Dispositivos e impresoras**, dale clic derecho
a la impresora termica y elige **"Establecer como impresora predeterminada"**.
Imprime una pagina de prueba y asegurate de que salga bien antes de seguir.

### Si usan Firefox ESR 115

**1.** Abre la caja e imprime **un** ticket a mano. En la ventana de imprimir,
antes de aceptar, deja todo asi:

- Impresora: la termica.
- Margenes: **Ninguno** (o el mas chico que deje).
- Quita la palomita de **"Imprimir encabezados y pies de pagina"**.
- Escala: 100%.

Imprime y revisa que el ticket salga derecho y completo. Esto es importante:
Firefox se acuerda de esta configuracion y la va a usar de aqui en adelante.

**2.** Ahora, para que ya no vuelva a preguntar: en la barra de direcciones
escribe `about:config` y dale Enter. Va a salir un aviso de "Acepto el
riesgo"; aceptalo.

**3.** En el buscador de arriba escribe `print.always_print_silent`. Si no
aparece, elige **Booleano** y dale al boton de **+** para crearla. Dejala en
**true**.

**4.** Busca ahora `print_printer`. Es de texto. Escribe ahi el nombre de la
impresora **exactamente** como aparece en Dispositivos e impresoras, con
mayusculas, espacios y todo igual.

**5.** Cierra Firefox y vuelve a abrirlo. Haz una venta de prueba: el ticket
debe salir solo, sin ventanas.

**6.** Para que la caja abra sola al prender: pon Firefox como pagina de
inicio en `https://caja.tudominio.com` y mete un acceso directo de Firefox en
la carpeta de Inicio (tecla Windows + R, escribe `shell:startup`, Enter, y
pega ahi el acceso directo).

### Si usan Chrome 109

**1.** Haz un acceso directo de Chrome en el escritorio. Clic derecho >
**Propiedades**.

**2.** En el campo **Destino**, al final de lo que ya dice, agrega un espacio
y esto:

```
--kiosk-printing https://caja.tudominio.com
```

Debe quedar parecido a:

```
"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing https://caja.tudominio.com
```

**3.** Acepta. Abre la caja **siempre desde ese acceso directo**, no desde el
Chrome de la barra de tareas: si lo abren de otro lado, la ventana de
imprimir vuelve a salir.

**4.** Chrome imprime en la **impresora predeterminada de Windows** sin
preguntar. Por eso importa que la termica sea la predeterminada.

**5.** Copia ese acceso directo a la carpeta de Inicio (Windows + R,
`shell:startup`) para que abra solo al prender la computadora.

---

## 5. Como actualizar desde casa

Esta es la parte comoda: se puede mejorar el sistema sin ir a la tienda y sin
que nadie de alla toque nada.

**Desde tu casa**, cuando ya tengas los cambios listos, los subes:

```
git push
```

**Para que la tienda agarre los cambios**, hay dos caminos:

1. **Desde la misma caja.** Entra a la caja con la contrasena del duenio,
   ve a **Ajustes** y dale al boton de **Actualizar**. Eso corre
   `ACTUALIZAR.bat --silencioso` alla, sin preguntar nada.
2. **Entrando a la computadora de la bodega** con AnyDesk o Escritorio
   Remoto, y dandole doble clic a **ACTUALIZAR.bat**.

En cualquiera de los dos casos pasa lo mismo, en este orden:

1. **Saca un respaldo de la base antes de tocar nada.** Si el respaldo falla,
   se detiene todo ahi mismo y no se actualiza; mas vale no actualizar que
   quedarse sin red de seguridad.
2. Anota en que version esta, por si hay que regresarse.
3. Baja la version nueva, instala y compila.
4. **Si algo de eso falla, se regresa sola a la version de antes**, la vuelve
   a compilar y avisa que se quedo como estaba. La tienda nunca se queda sin
   poder cobrar.
5. Reinicia la caja y comprueba que haya vuelto a encender.

El reinicio apaga **unicamente** la caja. El sistema de bodega, que corre en
la misma computadora, ni se entera y sigue trabajando.

La actualizacion tarda entre uno y tres minutos, y en el momento del reinicio
la caja se cae unos segundos. Conviene hacerlo con la tienda cerrada o en una
hora muerta.

---

## 6. Los respaldos

- Se guardan solos todas las noches a las **22:30**, en la carpeta
  `respaldos\` de `venus-caja`.
- Se llaman `venus-respaldo-2026-08-19-2230.db`: ano, mes, dia y hora.
- Se guardan los **ultimos 30 dias**. Los mas viejos se borran solos para no
  llenar el disco.
- Tambien se saca uno cada vez que se actualiza el sistema.

Para sacar uno a mano cuando quieras, abre una Terminal en la carpeta
`venus-caja` y escribe:

```
npm run respaldo
```

**Cada tanto, copia la carpeta `respaldos\` a una memoria USB o a la nube.**
Un respaldo que vive en la misma computadora que la base no sirve de nada si
se descompone el disco.

### Como regresar un respaldo

Solo si de plano se echo a perder la base. Con calma:

1. Cierra la caja (cierra la ventana negra) **y** el sistema de bodega.
2. Ve a la carpeta `data` del sistema de bodega. Ahi esta `venus.db`.
   Cambiale el nombre a `venus-echada-a-perder.db`. **No lo borres.**
3. Si hay archivos `venus.db-wal` y `venus.db-shm`, borralos.
4. Copia el respaldo que quieras de `respaldos\`, pegalo en esa carpeta
   `data` y ponle de nombre `venus.db`.
5. Vuelve a encender el sistema de bodega y luego la caja.

Ojo: se pierde todo lo que haya pasado entre la hora del respaldo y ahorita.

---

## 7. Cuando algo falla

**La tienda dice que no abre la pagina.**
Casi siempre es que apagaron la computadora de la bodega. Que alguien vaya a
ver si esta prendida. Si esta prendida, revisa que exista la ventana negra de
la caja; si no esta, dale doble clic a INICIAR.bat.

**Abre la pagina pero dice que no encuentra la base de datos.**
Se movio la carpeta del sistema de bodega. Abre el archivo `.env.local` de
`venus-caja` con el Bloc de notas y corrige la linea `VENUS_DB` para que
apunte al `venus.db` de verdad. Acuerdate de que ahi las diagonales van
**normales** (`C:/Venus/...`), no al reves.

**No sale el ticket.**
Revisa en la computadora de la tienda que la impresora termica siga siendo la
predeterminada de Windows. Si cambiaron de navegador o abrieron Chrome desde
otro acceso directo, vuelve a la seccion 4.

**Hay que ver que paso.**
Todo lo que hace la caja queda anotado en la carpeta `logs\`, un archivo por
dia (`caja-2026-08-19.log`). Se abren con el Bloc de notas. Se guardan 30 dias.

**Se quedo actualizando y no volvio.**
Espera tres minutos. Si sigue, entra a la computadora de la bodega y dale
doble clic a INICIAR.bat. Si eso no basta, corre ACTUALIZAR.bat a mano y lee
lo que dice al final: ahi te avisa si se tuvo que regresar a la version
anterior.

**Se cayo la caja sola a media venta.**
Se vuelve a levantar sola en unos segundos; la vendedora solo tiene que
esperar y darle F5. Si pasa seguido, mandame el archivo del dia de la carpeta
`logs\`.
