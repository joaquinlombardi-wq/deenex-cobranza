# Deenex · Sistema de cobranza

Calcula a principio de cada mes cuánto tiene que pagar cada pagador (marca o franquiciado) según el acuerdo cargado para cada cliente, y lleva la cuenta corriente de cada uno: qué se le cobró, qué pagó y qué debe.

Stack: MongoDB + Express + React (Vite) + Node.

## Correr

```bash
npm install
npm test             # motor de cálculo contra los casos reales de octubre 2026
npm run dev:server   # API en :4000. Sin MONGODB_URI arranca en modo demo (en memoria, con clientes de ejemplo)
npm run dev:client   # pantallas en http://localhost:5173
```

Con base real: `MONGODB_URI=mongodb://127.0.0.1:27017/deenex-cobranza APP_CLAVE=una-clave npm run dev:server` (con base real no arranca sin clave). `npm run build && npm start` sirve la app armada y la API juntas en :4000, como en Render.

## Llevarla a producción

Lo que hace falta para correrla en otra infraestructura (Render más abajo es solo la opción gratis):

- Node 22 o más nuevo y una base MongoDB. `npm ci && npm run build && npm start` sirve la app y la API juntas en `PORT` (4000 si no está).
- Variables: `MONGODB_URI` (si la dirección no trae nombre de base, guarda en `cobranza`), `APP_CLAVE` (con base real es obligatoria) y `APP_USUARIO` (`deenex` si no está). El acceso es HTTP Basic con esos dos, salvo `/api/salud`, que queda abierto para el control de salud.
- Salida a internet hacia dolarhoy.com, www.indec.gob.ar y api.argentinadatos.com: el server trae el dólar MEP y el IPC la primera vez que se usa cada día y cuando se toca el botón.
- Datos: todo vive en la colección `documentos`, con la ruta como `_id` (ver la tabla de Documentos). Lo que Joaco cargó en la versión de claude.ai se pasa con Respaldo: Bajar respaldo ahí y Cargar estos datos en la nueva, con la base vacía. El archivo es `{ formato: 'deenex-cobranza/respaldo', version: 1, creadoEn, documentos: [{ path, data }] }`.
- Para integrarla a otro sistema: el motor (`server/src/engine/`) no conoce Mongo ni Express, y `server/test/octubre-2026.test.js` es la referencia contra lo facturado de verdad. Las ventas de la plataforma entran por `POST /api/ventas` (ver Ventas desde la plataforma).
- Qué cobra y por qué, con las decisiones de negocio: [`docs/estructura-producto.md`](docs/estructura-producto.md).

## Estructura

- `server/src/engine/` · motor puro (sin base de datos): `liquidar.js` (`liquidarCliente(cliente, { periodo, mep, ipc, ventas })`), `cuentaCorriente.js` (`estadoDeCuenta({ cargos, pagos, hoy })`), `facturacion.js` (`resumenFacturacion`: MRR y extra jobs mes a mes) y `cotizaciones.js` (series de MEP e IPC).
- `client/src/backend/repositorio.js` · la lógica de datos, igual para el artifact y para el servidor: recibe un store de documentos (`get`, `set`, `delete`, `list`).
- `server/src/app.js` · el servidor: la API, la app armada (`client/dist`), usuario y clave (`clave.js`) y el dólar e IPC del día (`cotizaciones/diaria.js`).
- `server/src/store/documentos.js` · ese store sobre MongoDB (colección `documentos`) o en memoria (modo demo). `server/src/routes/api.js` lo expone en `/api/docs/:coleccion/:id`.
- `server/src/cotizaciones/` y `server/scripts/cotizaciones.mjs` · traen el historial de dólar MEP e IPC.
- `server/src/facturacion/importarDetalle.js` · lee la hoja DETALLE del Excel de facturación pegada y reconoce a qué cliente es cada factura.
- `server/src/facturacion/planillaContador.js` y `libroContador.js` · arman el Excel para el contador a partir de un cierre. `server/src/engine/productosDux.js` tiene los productos cargados en Dux.
- `client/` · React con menú lateral que se oculta: Cierre del mes (con el Excel para el contador), Historial (los cierres pasados, por mes o por cliente), Clientes (estado de cuenta, pagos, saldo anterior y Locales y ventas mes a mes), Ventas (análisis de la facturación), Dólar e IPC y Alta de cliente.
- `server/test/` · tests. `octubre-2026.test.js` reproduce la facturación real emitida ($ 14.472.791,22).

## Reglas de cálculo

- Fee por local y fee fijo: mes en curso. Comisión: mes vencido, sobre ventas del mes anterior **con IVA y sin envío**.
- USD × dólar MEP venta del día (dolarhoy). ARS con ajuste: × (1 + último IPC publicado, el de M-2), acumulado mes a mes.
- IVA 21% por renglón, salvo conceptos marcados sin IVA. Cada renglón se redondea al centavo.
- Es solo financiero: cada cliente tiene cuántos locales propios y cuántos franquiciados, no una lista de locales. Todos los propios pagan lo mismo; los franquiciados pagan lo mismo o tienen su propio precio y comisión (`feePorLocal.precioFranquiciado`, `comisionFranquiciado`). Ver `server/src/engine/clientes.js`.
- Fee mensual fijo: no depende de los locales ni de los franquiciados y lo paga la marca.
- Si paga cada franquiciado: una liquidación por franquiciado con sus locales y una a la marca con los propios y los extras.
- Híbrido: `suma` (por defecto), `mayor` (fee o comisión, lo que sea mayor) o `tope` (comisión con máximo).
- No hay prorrateo: un local que abre a mitad de mes se cobra como un extra de ese mes.
- La cantidad de locales puede cambiar con el tiempo: `cambiosLocales` guarda, desde un mes (`desde`), cuántos propios y franquiciados hay (y cuántos tiene cada franquiciado que paga). Rige el último cambio con `desde` ≤ al mes; antes del primero, la cantidad del alta. El fee usa los locales del mes que se cobra; la comisión, los del mes de las ventas (M-1). Ver `localesEn` en `server/src/engine/clientes.js`.
- Un cliente cuyo primer acuerdo rige más adelante no da error: el cierre lo muestra como "todavía no arrancó" (`arranca: 'AAAA-MM'`) y solo le cobra los extras de ese mes, si tiene.

## Cierre del mes

- Abre en el mes que toca cobrar (`mesACerrar` en `server/src/engine/periodos.js`): si hay un cierre generado y sin pasar del mes actual o del siguiente, ese; si no, el mes actual hasta el día 10 y el siguiente desde el 11.
- Las ventas para la comisión no se cargan acá: se cargan en cada cliente, en Clientes → Locales y ventas. Si faltan, el cierre lo avisa con un link que lleva a cargarlas y vuelve al cierre.
- Historial muestra cada cierre igual que en Cierre del mes, desplegable por mes y por cliente. Los meses de antes del sistema salen de lo importado del Excel.

## Locales y ventas de cada cliente

- La pestaña Locales y ventas de cada cliente tiene un renglón por mes con los locales (propios, franquiciados o de cada franquiciado que paga) y las ventas con IVA y sin envío de los canales que cobran comisión ese mes.
- Pide solo los canales del acuerdo vigente en ese mes: si cobra solo delivery, solo se carga delivery; si cobra los dos, los dos (`casillerosDeVentas` en `server/src/engine/ventas.js`). Los meses que todavía no empezaron solo piden locales.
- Cambiar los locales de un mes guarda un cambio en `cambiosLocales` desde ese mes.

## Excel para el contador

- Desde Cierre del mes o desde Historial se baja `Facturacion_<Mes>_<AAAA>.xlsx` con lo que hay que facturar el día 1, con el formato de la planilla de facturación: hoja DETALLE y hoja PRODUCTOS DUX.
- Una factura por pagador (la marca o cada franquiciado que paga), un renglón por concepto con su código y producto Dux. Dos clientes del sistema son dos facturas aunque compartan CUIT (QUEM y QUEM Central).
- Las columnas de montos son fórmulas como las del motor (bruto en dólares × MEP de la celda I2, redondeado al centavo; IVA del renglón; neto), así que dan lo mismo que el sistema y se pueden retocar en el Excel.
- El detalle de cada renglón lo arma el sistema; el contador lo puede cambiar. La columna CUIT sale del cliente (o del franquiciado): si no está cargado, va vacía. Lo que el cierre marca para revisar va en OBSERVACIONES.

## Cuentas corrientes

- Al confirmar un cierre ("Pasar a cuentas corrientes") se guarda un cargo por pagador y mes, que vence el `diaVencimiento` del cliente (10 si no tiene otro).
- Los pagos se imputan al cargo más viejo primero. Cada cargo queda pagado, con pago parcial, pendiente o vencido; si sobra plata queda saldo a favor.
- Si se vuelve a generar un cierre ya confirmado y cambió algún monto, las cuentas no cambian hasta tocar "Actualizar cuentas". Un cierre generado y sin pasar no cuenta en los saldos: Clientes avisa cuáles faltan.
- Saldo anterior: lo que un pagador ya debía antes de usar el sistema se carga a mano desde su cuenta ("Cargar saldo anterior"). Es un cargo más (`tipo: 'saldoAnterior'`, vence en la fecha que se le pone), así que los pagos lo cancelan primero. Pasar o actualizar un cierre nunca lo borra y no cuenta como facturación del mes.

## Dólar MEP e IPC

- Fuentes: el MEP venta de [dolarhoy](https://dolarhoy.com/cotizacion-dolar-mep), que es el que se usa para facturar (se lee la página, que solo muestra el valor del momento); el IPC mensual del [INDEC](https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv) (nivel general nacional, con un decimal, como lo publica); y el historial de [ArgentinaDatos](https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa): dólar bolsa venta, y el [IPC](https://api.argentinadatos.com/v1/finanzas/indices/inflacion) desde marzo de 1943.
- Qué MEP usa el cierre para cada día: el tomado de dolarhoy; si no hay, el cargado a mano; si tampoco, el historial de ArgentinaDatos (`combinarMep`). En el IPC manda el INDEC y lo cargado a mano completa los meses que faltan. El cierre guarda el dólar que usó, así que un cambio posterior en la serie no toca lo ya cobrado.
- `node server/scripts/cotizaciones.mjs --salida <carpeta> [--actuales <carpeta>] [--pedido boton|automatico]` trae todo y deja un JSON por documento que cambió (`mep-dolarhoy`, `mep-<AAAA>`, `ipc`) más `estado`. Corre con Node solo, sin dependencias; detrás de un proxy se relanza con `NODE_USE_ENV_PROXY=1` (hace falta Node 22.21 o más nuevo). Si una fuente falla, sigue con las otras y lo anota en `estado`. Una lectura de dolarhoy que se aleja más de 25% del último MEP conocido no se guarda. Con el servidor andando, `POST /api/cotizaciones/actualizar` hace lo mismo y lo guarda en la base.
- Botón "Actualizar dólar e IPC" (en Cierre del mes y en Dólar e IPC): en claude.ai la app no puede entrar a otras páginas, así que arranca por el conector Claude Code Remote la rutina de `server/scripts/rutina-cotizaciones.md` y espera a que deje el resultado en `cotizaciones/estado`. En el cierre, el dólar recién traído pasa a ser el del cierre. La misma rutina corre sola los días hábiles a las 17:10: el botón pisa el valor de dolarhoy del día y la corrida diaria solo lo completa si no estaba.
- La rutina necesita un entorno de Claude Code con acceso (nivel Limitado, dominios permitidos) a dolarhoy.com, www.indec.gob.ar, api.argentinadatos.com y github.com, para bajar el código. Desde un proyecto privado una rutina dispara siempre en la sesión que la creó, así que la crea y la corre el hilo "Cotizaciones automáticas" del proyecto, que usa ese entorno. Como Claude Code da la corrida por buena apenas despierta esa sesión, la app espera el resultado en `cotizaciones/estado` (hasta 15 minutos) y solo corta antes si la rutina no se pudo disparar. Su id va en `client/.env.artifact` (`VITE_RUTINA_COTIZACIONES`); sin id, el botón no aparece.
- En la versión con servidor no hay rutina: el botón le pide al server que lo traiga y contesta en el momento, y el server lo trae solo una vez por día (ver Publicarla gratis).
- "Importar historial", en Dólar e IPC, sigue sirviendo para pegar el JSON de ArgentinaDatos o columnas de un Excel. Lo lee `server/src/cotizaciones/importar.js`.
- `actualizarPorIpc(monto, ipc, desde, hasta)` (en el motor) lleva un monto de un mes a otro con el IPC de cada mes del medio; lo usa la calculadora de esa pestaña.

## Ventas: análisis de la facturación

La pestaña Ventas muestra lo facturado cada mes, sin IVA y en pesos (o en dólares al MEP de cada mes), separado en:

- **MRR**: abonos (fee por local y fee fijo), comisiones e infraestructura (hosting, servidores).
- **Extra jobs**: desarrollos, implementaciones, lanzamientos de app, consultorías, gráficas y cualquier concepto que no sea de los anteriores.
- **Reintegros y ajustes**: van en las tablas pero no en el gráfico.

La categoría sale del tipo de renglón del motor o, en lo importado, del código Dux (`categoriaDe` en `server/src/engine/facturacion.js`). Cada mes sale de una sola fuente, en este orden: lo pasado a cuentas corrientes, lo importado del Excel y, si no hay nada de eso, el cierre generado sin pasar (se marca como provisorio).

Los meses de antes del sistema se importan pegando la hoja DETALLE del Excel del contador ("Importar un mes del Excel"). Lee montos en formato argentino o inglés, toma el dólar de la hoja si está (o lo deduce de un renglón en dólares), compara contra el TOTAL de la planilla y sugiere el cliente de cada factura; lo que no tenga cliente en el sistema queda con el nombre del Excel.

## Ventas desde la plataforma (para los devs)

Hasta que esté conectada la plataforma, las ventas para la comisión se cargan a mano en cada cliente (Clientes → Locales y ventas) y quedan en los mismos documentos `ventas/<AAAA-MM>`. La API no cambió:

`POST /api/ventas` con una fila (o un array) por cliente × grupo de locales × mes × canal, con el total del grupo:

```json
{ "cliente_id": "quem", "grupo": "propios", "periodo": "2026-09", "canal": "delivery", "total_con_iva": 1244000.00 }
```

`grupo` es `propios` (los locales propios), `franquiciados` (los franquiciados, cuando paga la marca) o el `id` del franquiciado (cuando paga cada uno). Si la marca paga todo con la misma comisión también sirve un solo total con `"grupo": "todos"`. Si un grupo no vendió en un canal, mandar la fila con 0.

En la versión publicada la API pide el mismo usuario y clave que la app: `curl -u deenex:<clave> -H 'Content-Type: application/json' -d '<filas>' https://<app>.onrender.com/api/ventas`.

## Versión publicada en claude.ai

`npm run build:artifact --workspace client` arma `client/dist-artifact/cobranza.html`: el mismo frontend con el motor corriendo en el navegador y los datos en la base del artifact (`client/src/backend/store-artifact.js`). Es la versión que usa Joaco mientras no haya un servidor con MongoDB.

Se publica con las capacidades `db` (la base), `downloads` (bajar el Excel para el contador y el respaldo; el navegador del artifact no deja bajar archivos de otra forma) y `mcp` (el conector Claude Code Remote, con `fire_trigger` para arrancar la rutina de cotizaciones y `get_trigger` para ver cómo terminó). ExcelJS se carga recién al bajar el Excel, desde jsdelivr (`client/src/excel.js`).

Documentos (los mismos en el artifact y en Mongo):

| Ruta | Contenido |
| --- | --- |
| `clientes/<id>` | el cliente: marca, cantidad de locales propios y franquiciados, `cambiosLocales`, franquiciados que pagan, acuerdos, extras, `diaVencimiento` |
| `ventas/<AAAA-MM>` | `{ filas: [{ cliente_id, grupo, periodo, canal, total_con_iva }] }` |
| `cierres/<AAAA-MM>` | `{ periodo, mep, fechaMep, generadoEn, resultados, confirmado }` |
| `cargos/<AAAA-MM>~<cliente>~<pagador>` | lo que debe un pagador por un mes, con sus renglones |
| `cargos/saldo~<cliente>~<pagador>~<id>` | saldo anterior cargado a mano (`tipo: 'saldoAnterior'`) |
| `pagos/<fecha>~<id>` | `{ clienteId, pagadorId, fecha, montoArs, medio, nota }` |
| `facturacion/<AAAA-MM>` | un mes importado del Excel: `{ periodo, mep, renglones }` |
| `cotizaciones/mep-<AAAA>`, `cotizaciones/ipc` | series automáticas (`{ valores, fuente, actualizado }`) |
| `cotizaciones/mep-dolarhoy` | el MEP venta tomado de dolarhoy: `{ valores, detalle: { fecha: { compra, venta, publicado, leidoEn, pedido } } }` |
| `cotizaciones/estado` | cómo salió la última actualización: `{ ultima: { pedido, inicio, fin, ok, mep, ipc, errores, documentos } }` |
| `cotizaciones/mep-manual`, `parametros/ipc` | lo cargado a mano (`{ valores }`) |

El artifact no puede llamar a otras páginas, así que el dólar y el IPC los escribe la rutina de cotizaciones (ver Dólar MEP e IPC).

## Publicarla gratis (Render + MongoDB Atlas)

La versión con servidor es la misma app con los datos en MongoDB. Corre en el [plan gratis de Render](https://render.com/docs/free) con la [base gratis de Atlas](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) (M0, 512 MB; hoy los datos ocupan menos de 1 MB).

1. **Atlas**: crear un cluster M0 en AWS, región N. Virginia (`us-east-1`, cerca del server). En Database Access, un usuario con contraseña; en Network Access, permitir `0.0.0.0/0` (el plan gratis de Render no tiene IP fija). En Connect → Drivers, copiar la dirección `mongodb+srv://…` y poner la contraseña. Si la dirección no trae nombre de base, guarda en `cobranza`.
2. **Render**: New → Blueprint → este repo. Lee `render.yaml` y pide `MONGODB_URI` (la dirección de Atlas) y `APP_CLAVE` (la clave para entrar; el usuario es `deenex`, o el de `APP_USUARIO`). Cada push a `main` se publica solo.
3. **Datos**: en la versión de claude.ai, Respaldo → Bajar respaldo. En la nueva, que arranca vacía y lo avisa, Respaldo → Elegir el archivo → Cargar estos datos. Solo carga en una base sin datos propios (el dólar y el IPC que ya trajo se juntan con los del respaldo); si se corta, se vuelve a cargar el mismo archivo y sigue.

Cómo se comporta:

- Pide usuario y clave (HTTP Basic) para todo menos `/api/salud`. Con `MONGODB_URI` y sin `APP_CLAVE` no arranca.
- Perdona los errores típicos al pegar en Render: comillas o espacios alrededor, los `< >` que Atlas pone alrededor de la contraseña y los signos de la contraseña que hay que escapar (`@ : / ? #`). Si igual no se conecta, el log de Render dice qué revisar (contraseña, cluster o Network Access).
- El plan gratis se duerme a los 15 minutos sin uso y tarda cerca de un minuto en despertar. Por eso el dólar y el IPC no esperan una hora fija: el server los trae la primera vez que se usa la app cada día (hora argentina), salvo que ese día ya se hayan traído bien, también con el botón, y si falla reintenta a la media hora. Un día sin uso no tiene lectura de dolarhoy y el cierre usa el historial de ArgentinaDatos; el día del cierre, el botón trae el valor del momento.
- La rutina de Claude Code escribe en la base del artifact, no en Mongo: cuando se deje de usar la versión de claude.ai, se apaga.
