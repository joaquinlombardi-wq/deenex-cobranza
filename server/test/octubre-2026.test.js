import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidarCliente } from '../src/engine/liquidar.js';
import * as c from './casos-octubre-2026.js';

const opciones = { periodo: '2026-10', mep: c.MEP_OCTUBRE, ventas: c.ventasQuemSeptiembre };
const neto = (cliente) => {
  const r = liquidarCliente(cliente, opciones);
  assert.equal(r.liquidaciones.length, 1);
  assert.deepEqual(r.avisos, []);
  return r.liquidaciones[0].totales.netoArs;
};

test('La Fábrica: 86 locales x USD 60 + cloud + reintegro sin IVA', () => {
  assert.equal(neto(c.laFabrica), 9823875.63);
});

test('Meet & Eat: servidores cloud', () => {
  assert.equal(neto(c.meetAndEat), 281288.7);
});

test('QUEM: 12 locales x USD 45 + 3% del delivery de septiembre', () => {
  const r = liquidarCliente(c.quem, opciones);
  const [fee, comision] = r.liquidaciones[0].renglones;
  assert.equal(fee.brutoArs, 836892);
  assert.equal(comision.brutoArs, 37320);
  assert.equal(comision.productoDux, 'P002');
  assert.match(comision.detalle, /Comisión 3% delivery - ventas Septiembre 2026 \(\$ 1\.244\.000,00\)/);
  assert.equal(r.liquidaciones[0].totales.netoArs, 1057796.52);
});

test('QUEM Central: fee fijo USD 420', () => {
  assert.equal(neto(c.quemCentral), 787608.36);
});

test('Konex: plan USD 650 + cuota de desarrollo 5 de 6', () => {
  const r = liquidarCliente(c.konex, opciones);
  assert.match(r.liquidaciones[0].renglones[1].detalle, /cuota 5 de 6/);
  assert.equal(r.liquidaciones[0].totales.netoArs, 2156546.7);
});

test('Pannus: 3 locales x USD 65', () => {
  assert.equal(neto(c.pannus), 365675.31);
});

test('Total general de octubre coincide con lo emitido ($ 14.472.791,22)', () => {
  const total = [c.laFabrica, c.meetAndEat, c.quem, c.quemCentral, c.konex, c.pannus]
    .map(neto)
    .reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total * 100) / 100, 14472791.22);
});
