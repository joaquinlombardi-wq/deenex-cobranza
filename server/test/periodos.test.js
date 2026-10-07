import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesACerrar } from '../src/engine/periodos.js';

const generado = (periodo) => ({ periodo, confirmado: null });
const pasado = (periodo) => ({ periodo, confirmado: { en: `${periodo}-01T12:00:00.000Z` } });

test('El cierre que toca es el que está generado y sin pasar a las cuentas corrientes', () => {
  // 7 de octubre: noviembre generado y octubre facturado por fuera del sistema.
  assert.equal(mesACerrar('2026-10-07', [generado('2026-11')]), '2026-11');
  assert.equal(mesACerrar('2026-11-20', [pasado('2026-10'), generado('2026-11')]), '2026-11');
});

test('Sin un cierre pendiente, hasta el 10 toca el mes actual y después el siguiente', () => {
  assert.equal(mesACerrar('2026-11-01', []), '2026-11');
  assert.equal(mesACerrar('2026-11-10', [pasado('2026-11')]), '2026-11');
  assert.equal(mesACerrar('2026-11-11', [pasado('2026-11')]), '2026-12');
  assert.equal(mesACerrar('2026-12-28', []), '2027-01');
});
