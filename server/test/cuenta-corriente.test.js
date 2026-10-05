import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDeCuenta, vencimientoDe } from '../src/engine/cuentaCorriente.js';

const cargo = (periodo, montoArs, extra = {}) => ({
  clienteId: 'quem',
  pagadorId: 'marca',
  pagadorNombre: 'QUEM S.A.',
  periodo,
  vencimiento: vencimientoDe(periodo, 10),
  montoArs,
  ...extra,
});
const pago = (fecha, montoArs, extra = {}) => ({ clienteId: 'quem', pagadorId: 'marca', fecha, montoArs, ...extra });

test('Vencimiento: día pactado, sin pasarse del fin de mes', () => {
  assert.equal(vencimientoDe('2026-10', 10), '2026-10-10');
  assert.equal(vencimientoDe('2026-02', 31), '2026-02-28');
});

test('Sin pagos: pendiente antes del vencimiento, vencido después', () => {
  const antes = estadoDeCuenta({ cargos: [cargo('2026-10', 1000)], hoy: '2026-10-05' });
  assert.equal(antes.pagadores[0].cargos[0].estado, 'pendiente');
  assert.equal(antes.estado, 'pendiente');
  const despues = estadoDeCuenta({ cargos: [cargo('2026-10', 1000)], hoy: '2026-10-11' });
  assert.equal(despues.estado, 'vencido');
  assert.equal(despues.totales.vencidoArs, 1000);
});

test('Los pagos se imputan al mes más viejo primero', () => {
  const r = estadoDeCuenta({
    cargos: [cargo('2026-11', 500), cargo('2026-10', 1000)],
    pagos: [pago('2026-10-08', 1200)],
    hoy: '2026-11-05',
  });
  const [oct, nov] = r.pagadores[0].cargos;
  assert.equal(oct.periodo, '2026-10');
  assert.equal(oct.estado, 'pagado');
  assert.equal(oct.pagadoEl, '2026-10-08');
  assert.equal(nov.estado, 'parcial');
  assert.equal(nov.saldoArs, 300);
  assert.equal(r.totales.saldoArs, 300);
  assert.equal(r.estado, 'pendiente');
});

test('Pago de más queda como saldo a favor', () => {
  const r = estadoDeCuenta({ cargos: [cargo('2026-10', 1000)], pagos: [pago('2026-10-09', 1100)], hoy: '2026-10-20' });
  assert.equal(r.pagadores[0].totales.saldoArs, -100);
  assert.equal(r.pagadores[0].totales.aFavorArs, 100);
  assert.equal(r.estado, 'al-dia');
});

test('Montos con centavos cierran exacto', () => {
  const r = estadoDeCuenta({
    cargos: [cargo('2026-10', 1057796.52)],
    pagos: [pago('2026-10-07', 500000.1), pago('2026-10-09', 557796.42)],
    hoy: '2026-10-20',
  });
  assert.equal(r.pagadores[0].cargos[0].estado, 'pagado');
  assert.equal(r.totales.saldoArs, 0);
});

test('Cada franquiciado tiene su propia cuenta', () => {
  const r = estadoDeCuenta({
    cargos: [
      cargo('2026-10', 1000),
      cargo('2026-10', 400, { pagadorId: 'f1', pagadorNombre: 'Franquicia Uno SRL', pagadorTipo: 'franquiciado' }),
    ],
    pagos: [pago('2026-10-05', 1000)],
    hoy: '2026-10-15',
  });
  const marca = r.pagadores.find((p) => p.pagadorId === 'marca');
  const f1 = r.pagadores.find((p) => p.pagadorId === 'f1');
  assert.equal(marca.estado, 'al-dia');
  assert.equal(f1.estado, 'vencido');
  assert.equal(r.estado, 'vencido');
  assert.equal(r.totales.vencidoArs, 400);
});

test('Cliente sin movimientos', () => {
  assert.equal(estadoDeCuenta({ hoy: '2026-10-05' }).estado, 'sin-movimientos');
});
