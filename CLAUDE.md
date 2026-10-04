# deenex-cobranza

- Idioma del dominio y de la UI: español rioplatense. Nombres del dominio en español (cliente, local, pagador, acuerdo, liquidación).
- El motor (`server/src/engine/`) es puro y no conoce Mongo. Toda regla de cálculo nueva va con su test en `server/test/`.
- Plata siempre con `decimal.js` (`engine/dinero.js`), redondeo al centavo por renglón, half-up.
- `npm test` tiene que pasar antes de cada push; `octubre-2026.test.js` es la referencia contra lo facturado de verdad.
