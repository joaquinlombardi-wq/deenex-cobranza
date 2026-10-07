import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidarCliente } from '../src/engine/liquidar.js';
import { normalizarCliente, localesEn, conLocalesEnMes } from '../src/engine/clientes.js';

const MEP = 1000;

// Marca que paga todo: 10 propios a USD 60 desde enero, crece a 14 en diciembre y baja a 12 en marzo.
const creciendo = () => ({
  id: 'crece',
  nombre: 'Crece',
  locales: { propios: 10 },
  cambiosLocales: [
    { desde: '2027-03', propios: 12 },
    { desde: '2026-12', propios: 14 },
  ],
  acuerdos: [{ vigenciaDesde: '2026-01', moneda: 'USD', feePorLocal: { precio: 60 } }],
});

const fee = (r) => r.liquidaciones.flatMap((l) => l.renglones).filter((x) => x.tipo === 'feePorLocal');

test('Cambio de locales: cada mes cobra los locales que tenía ese mes', () => {
  const cantidades = ['2026-11', '2026-12', '2027-02', '2027-03'].map((periodo) => fee(liquidarCliente(creciendo(), { periodo, mep: MEP }))[0].cantidad);
  assert.deepEqual(cantidades, [10, 14, 14, 12]);
  const diciembre = fee(liquidarCliente(creciendo(), { periodo: '2026-12', mep: MEP }))[0];
  assert.equal(diciembre.detalle, 'Servicio full - 14 locales x USD 60 - Diciembre 2026');
  assert.equal(diciembre.brutoArs, 840000);
});

test('Los cambios quedan ordenados y uno nuevo para el mismo mes reemplaza al anterior', () => {
  const c = normalizarCliente({ ...creciendo(), cambiosLocales: [...creciendo().cambiosLocales, { desde: '2026-12', propios: 15 }, { desde: 'mal' }] });
  assert.deepEqual(c.cambiosLocales.map((x) => [x.desde, x.propios]), [['2026-12', 15], ['2027-03', 12]]);
  assert.equal(localesEn(c, '2026-11').locales.propios, 10);
  assert.equal(localesEn(c, '2027-01').locales.propios, 15);
});

// Cada franquiciado paga sus locales; F3 se suma en diciembre y F1 pasa de 4 a 5.
const conFranquiciados = () => ({
  id: 'franquicia',
  nombre: 'Franquicia',
  tieneFranquiciados: true,
  quienPaga: 'franquiciados',
  locales: { propios: 2 },
  franquiciados: [
    { id: 'f1', razonSocial: 'Uno SRL', locales: 4 },
    { id: 'f2', razonSocial: 'Dos SRL', locales: 3 },
    { id: 'f3', razonSocial: 'Tres SRL', locales: 0 },
  ],
  cambiosLocales: [{ desde: '2026-12', propios: 2, porFranquiciado: { f1: 5, f3: 2 } }],
  acuerdos: [{ vigenciaDesde: '2026-01', moneda: 'USD', feePorLocal: { precio: 50 }, comision: { delivery: 0.02 } }],
});

const venta = (grupo, periodo, total) => ({ cliente_id: 'franquicia', grupo, periodo, canal: 'delivery', total_con_iva: total });

test('Un franquiciado que no figura en el cambio conserva sus locales', () => {
  const c = localesEn(normalizarCliente(conFranquiciados()), '2027-01');
  assert.deepEqual(c.franquiciados.map((f) => [f.id, f.locales]), [['f1', 5], ['f2', 3], ['f3', 2]]);
});

test('Un franquiciado nuevo paga sus locales desde el mes del cambio y su comisión desde el mes siguiente', () => {
  const ventasNoviembre = [venta('propios', '2026-11', 100000), venta('f1', '2026-11', 200000), venta('f2', '2026-11', 150000)];
  const diciembre = liquidarCliente(conFranquiciados(), { periodo: '2026-12', mep: MEP, ventas: ventasNoviembre });
  const tres = diciembre.liquidaciones.find((l) => l.pagador.id === 'f3');
  // Fee de diciembre con sus 2 locales; las ventas de noviembre no se le piden porque todavía no estaba.
  assert.deepEqual(tres.renglones.map((x) => [x.tipo, x.brutoArs]), [['feePorLocal', 100000]]);
  assert.deepEqual(diciembre.avisos, []);
  const uno = diciembre.liquidaciones.find((l) => l.pagador.id === 'f1');
  assert.equal(uno.renglones[0].cantidad, 5);

  const enero = liquidarCliente(conFranquiciados(), { periodo: '2027-01', mep: MEP, ventas: [] });
  assert.ok(enero.avisos.includes('Faltan las ventas de delivery de Diciembre 2026 de Tres SRL.'));
});

test('Noviembre no cambia aunque haya un cambio cargado para diciembre', () => {
  const noviembre = liquidarCliente(conFranquiciados(), { periodo: '2026-11', mep: MEP, ventas: [] });
  assert.deepEqual(noviembre.liquidaciones.map((l) => [l.pagador.id, l.renglones[0].cantidad]), [['marca', 2], ['f2', 3], ['f1', 4]]);
});

test('Un cliente que arranca más adelante no se cobra todavía y dice desde cuándo', () => {
  const nuevo = { ...creciendo(), acuerdos: [{ vigenciaDesde: '2027-01', moneda: 'USD', feePorLocal: { precio: 60 } }] };
  const r = liquidarCliente(nuevo, { periodo: '2026-11', mep: null });
  assert.equal(r.arranca, '2027-01');
  assert.deepEqual(r.liquidaciones, []);
  assert.equal(liquidarCliente(nuevo, { periodo: '2027-01', mep: MEP }).arranca, undefined);
});

test('Antes de arrancar se cobran los extras de ese mes (por ejemplo, el lanzamiento)', () => {
  const nuevo = {
    ...creciendo(),
    acuerdos: [{ vigenciaDesde: '2027-01', moneda: 'USD', feePorLocal: { precio: 60 } }],
    extras: [{ concepto: 'Lanzamiento app', tipo: 'lanzamientoApp', monto: 800, moneda: 'USD', desde: '2026-12', hasta: '2026-12' }],
  };
  const r = liquidarCliente(nuevo, { periodo: '2026-12', mep: MEP });
  assert.equal(r.arranca, '2027-01');
  assert.deepEqual(r.liquidaciones[0].renglones.map((x) => [x.productoDux, x.brutoArs]), [['APPLAUNCH', 800000]]);
  // Sin extras en noviembre no hace falta dólar.
  assert.deepEqual(liquidarCliente(nuevo, { periodo: '2026-11', mep: null }).liquidaciones, []);
});

test('Sin ningún acuerdo cargado la liquidación se frena', () => {
  assert.throws(() => liquidarCliente({ ...creciendo(), acuerdos: [] }, { periodo: '2026-11', mep: MEP }), /no tiene un acuerdo cargado/);
});

test('Los locales cargados en un mes rigen desde ese mes; si no cambian, no queda un cambio de más', () => {
  const c = normalizarCliente(creciendo());
  // Enero 2027 pasa a 16: rige enero y febrero; marzo conserva su cambio a 12.
  const conEnero = normalizarCliente({ ...creciendo(), cambiosLocales: conLocalesEnMes(c, '2027-01', { propios: 16 }) });
  assert.deepEqual(['2026-12', '2027-01', '2027-02', '2027-03'].map((p) => localesEn(conEnero, p).locales.propios), [14, 16, 16, 12]);
  // Cargar en febrero lo mismo que ya tenía no agrega nada.
  assert.deepEqual(conLocalesEnMes(conEnero, '2027-02', { propios: 16 }).map((x) => x.desde), ['2026-12', '2027-01', '2027-03']);
  // Volver diciembre a los 10 de antes saca ese cambio.
  assert.deepEqual(conLocalesEnMes(c, '2026-12', { propios: 10 }).map((x) => [x.desde, x.propios]), [['2027-03', 12]]);
});

test('Con franquiciados que pagan, el cambio del mes guarda cuántos locales tiene cada uno', () => {
  const c = normalizarCliente(conFranquiciados());
  const cambios = conLocalesEnMes(c, '2027-02', { propios: 2, porFranquiciado: { f1: 5, f2: 4, f3: 2 } });
  const febrero = localesEn(normalizarCliente({ ...conFranquiciados(), cambiosLocales: cambios }), '2027-02');
  assert.deepEqual(febrero.franquiciados.map((f) => [f.id, f.locales]), [['f1', 5], ['f2', 4], ['f3', 2]]);
  assert.deepEqual(conLocalesEnMes(c, '2027-02', { propios: 2, porFranquiciado: { f1: 5, f2: 3, f3: 2 } }).map((x) => x.desde), ['2026-12']);
});
