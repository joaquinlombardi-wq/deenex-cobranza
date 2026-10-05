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

Con base real: `MONGODB_URI=mongodb://127.0.0.1:27017/deenex-cobranza npm run dev:server`.

## Estructura

- `server/src/engine/` · motor puro (sin base de datos): `liquidar.js` (`liquidarCliente(cliente, { periodo, mep, ipc, ventas })`), `cuentaCorriente.js` (`estadoDeCuenta({ cargos, pagos, hoy })`) y `cotizaciones.js` (series de MEP e IPC).
- `client/src/backend/repositorio.js` · la lógica de datos, igual para el artifact y para el servidor: recibe un store de documentos (`get`, `set`, `delete`, `list`).
- `server/src/store/documentos.js` · ese store sobre MongoDB (colección `documentos`) o en memoria (modo demo). `server/src/routes/api.js` lo expone en `/api/docs/:coleccion/:id`.
- `server/src/cotizaciones/` y `server/scripts/cotizaciones.mjs` · traen el historial de dólar MEP e IPC.
- `client/` · React: Cierre del mes, Clientes (con estado de cuenta y pagos), Ventas, Dólar e IPC y Alta de cliente.
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

## Cuentas corrientes

- Al confirmar un cierre ("Pasar a cuentas corrientes") se guarda un cargo por pagador y mes, que vence el `diaVencimiento` del cliente (10 si no tiene otro).
- Los pagos se imputan al cargo más viejo primero. Cada cargo queda pagado, con pago parcial, pendiente o vencido; si sobra plata queda saldo a favor.
- Si se vuelve a generar un cierre ya confirmado y cambió algún monto, las cuentas no cambian hasta tocar "Actualizar cuentas".

## Dólar MEP e IPC

- Fuentes: dólar bolsa (MEP) venta de [ArgentinaDatos](https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa) (historial) y [DolarApi](https://dolarapi.com/v1/dolares/bolsa) (el del día); IPC mensual de INDEC vía [ArgentinaDatos](https://api.argentinadatos.com/v1/finanzas/indices/inflacion).
- `npm run cotizaciones --workspace server -- <carpeta>` baja todo y deja un JSON por documento (`cotizaciones/mep-<AAAA>`, `cotizaciones/ipc`). Con el servidor andando, `POST /api/cotizaciones/actualizar` hace lo mismo y lo guarda en la base.
- Lo cargado a mano (`cotizaciones/mep-manual`, `parametros/ipc`) completa los días o meses que la fuente no tiene. El cierre guarda el dólar que usó, así que un cambio posterior en la serie no toca lo ya cobrado.
- Se guarda toda la serie: el IPC mensual desde marzo de 1943 y todo el historial de MEP que tenga la fuente.
- Mientras no corra la actualización automática, la pestaña Dólar e IPC tiene "Importar historial": se abre la página de la fuente en el navegador, se copia todo y se pega (también acepta dos columnas pegadas de un Excel). Lo lee `server/src/cotizaciones/importar.js`.
- `actualizarPorIpc(monto, ipc, desde, hasta)` (en el motor) lleva un monto de un mes a otro con el IPC de cada mes del medio; lo usa la calculadora de esa pestaña.

## Ventas desde la plataforma (para los devs)

`POST /api/ventas` con una fila (o un array) por cliente × grupo de locales × mes × canal, con el total del grupo:

```json
{ "cliente_id": "quem", "grupo": "propios", "periodo": "2026-09", "canal": "delivery", "total_con_iva": 1244000.00 }
```

`grupo` es `propios` (los locales propios), `franquiciados` (los franquiciados, cuando paga la marca) o el `id` del franquiciado (cuando paga cada uno). Si la marca paga todo con la misma comisión también sirve un solo total con `"grupo": "todos"`. Si un grupo no vendió en un canal, mandar la fila con 0.

## Versión publicada en claude.ai

`npm run build:artifact --workspace client` arma `client/dist-artifact/cobranza.html`: el mismo frontend con el motor corriendo en el navegador y los datos en la base del artifact (`client/src/backend/store-artifact.js`). Es la versión que usa Joaco mientras no haya un servidor con MongoDB.

Documentos (los mismos en el artifact y en Mongo):

| Ruta | Contenido |
| --- | --- |
| `clientes/<id>` | el cliente: marca, cantidad de locales propios y franquiciados, franquiciados que pagan, acuerdos, extras, `diaVencimiento` |
| `ventas/<AAAA-MM>` | `{ filas: [{ cliente_id, grupo, periodo, canal, total_con_iva }] }` |
| `cierres/<AAAA-MM>` | `{ periodo, mep, fechaMep, generadoEn, resultados, confirmado }` |
| `cargos/<AAAA-MM>~<cliente>~<pagador>` | lo que debe un pagador por un mes, con sus renglones |
| `pagos/<fecha>~<id>` | `{ clienteId, pagadorId, fecha, montoArs, medio, nota }` |
| `cotizaciones/mep-<AAAA>`, `cotizaciones/ipc` | series automáticas (`{ valores, fuente, actualizado }`) |
| `cotizaciones/mep-manual`, `parametros/ipc` | lo cargado a mano (`{ valores }`) |

El artifact no puede llamar a APIs externas, así que las series automáticas las escribe una rutina programada que corre el script de cotizaciones y guarda los documentos en la base del artifact. La rutina necesita un entorno con acceso a `api.argentinadatos.com` y `dolarapi.com`.
