# Deenex · Sistema de cobranza

Calcula a principio de cada mes cuánto tiene que pagar cada pagador (marca o franquiciado) según el acuerdo cargado para cada cliente.

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

- `server/src/engine/` · motor de cálculo puro (sin base de datos). `liquidarCliente(cliente, { periodo, mep, ipc, ventas })`.
- `server/src/models/` · esquemas de Mongo: `Cliente` (marca, franquiciados, locales, acuerdos, extras) y `Venta`.
- `server/src/routes/api.js` · API REST. `server/src/store/` · Mongo o memoria (modo demo).
- `client/` · React: Cierre del mes, Clientes y Alta de cliente (5 pasos + simulación).
- `server/test/` · tests. `octubre-2026.test.js` reproduce la facturación real emitida ($ 14.472.791,22).

## Reglas de cálculo

- Fee por local y fee fijo: mes en curso. Comisión: mes vencido, sobre ventas del mes anterior **con IVA y sin envío**.
- USD × dólar MEP venta del día (dolarhoy). ARS con ajuste: × (1 + último IPC publicado, el de M-2), acumulado mes a mes.
- IVA 21% por renglón, salvo conceptos marcados sin IVA. Cada renglón se redondea al centavo.
- Si paga cada franquiciado: una liquidación por franquiciado con sus locales y una a la marca con los propios y los extras.
- Híbrido: `suma` (por defecto), `mayor` (fee o comisión, lo que sea mayor) o `tope` (comisión con máximo).
- Prorrateo de locales que abren o cierran en el mes: `completo` (por defecto), `proporcional` o `corte` (no paga si abrió después del día N).

## Ventas desde la plataforma (para los devs)

`POST /api/ventas` con una fila (o un array) por local × mes × canal:

```json
{ "local_id": "quem-palermo", "periodo": "2026-09", "canal": "delivery", "total_con_iva": 1244000.00, "cantidad_pedidos": 812 }
```

`local_id` es el `plataformaId` del local cargado en el cliente. Si un local no vendió en un canal, mandar la fila con 0.
