import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidarCliente, ErrorLiquidacion } from '../src/engine/liquidar.js';
import { normalizarCliente, gruposDeLocales, gruposDeVentas } from '../src/engine/clientes.js';

const MEP = 1000;

// Marca X: 3 locales propios y 7 franquiciados (4 de F1, 3 de F2). USD 50 propios, USD 55 franquiciados, 2% delivery.
const marcaX = () => ({
  id: 'marca-x',
  nombre: 'Marca X',
  razonSocial: 'Marca X S.A.',
  cuit: '30-11111111-1',
  tieneFranquiciados: true,
  quienPaga: 'franquiciados',
  locales: { propios: 3 },
  franquiciados: [
    { id: 'f1', razonSocial: 'Franquicia Uno SRL', cuit: '30-22222222-2', locales: 4 },
    { id: 'f2', razonSocial: 'Franquicia Dos SRL', cuit: '30-33333333-3', locales: 3 },
  ],
  acuerdos: [
    { vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 50, precioFranquiciado: 55 }, comision: { delivery: 0.02 } },
  ],
  extras: [{ concepto: 'Infraestructura cloud', tipo: 'hosting', monto: 100, moneda: 'USD' }],
});

// La misma marca cuando paga todo: 3 propios y 7 franquiciados, sin detalle de franquiciados.
const pagaLaMarca = () => ({ ...marcaX(), quienPaga: 'marca', locales: { propios: 3, franquiciados: 7 }, franquiciados: [] });

const venta = (grupo, total, canal = 'delivery', cliente_id = 'marca-x') => ({ cliente_id, grupo, periodo: '2026-09', canal, total_con_iva: total });
const ventasPorFranquiciado = [venta('propios', 300000), venta('f1', 400000), venta('f2', 300000)];
const ventasDeLaMarca = [venta('propios', 300000), venta('franquiciados', 700000)];

test('Paga cada franquiciado: una liquidación a la marca (propios + extras) y una por franquiciado', () => {
  const r = liquidarCliente(marcaX(), { periodo: '2026-10', mep: MEP, ventas: ventasPorFranquiciado });
  assert.deepEqual(r.liquidaciones.map((l) => l.pagador.nombre), ['Marca X', 'Franquicia Dos SRL', 'Franquicia Uno SRL']);
  const [marca, f2, f1] = r.liquidaciones;
  // Marca: 3 x 50 x 1000 + 2% de 300.000 + cloud 100 x 1000
  assert.deepEqual(marca.renglones.map((x) => x.brutoArs), [150000, 6000, 100000]);
  assert.equal(marca.pagador.cuit, '30-11111111-1');
  // F1: 4 x 55 x 1000 + 2% de 400.000, sin extras
  assert.deepEqual(f1.renglones.map((x) => x.brutoArs), [220000, 8000]);
  assert.equal(f1.pagador.cuit, '30-22222222-2');
  assert.deepEqual(f2.renglones.map((x) => x.brutoArs), [165000, 6000]);
  assert.equal(f2.totales.netoArs, 206910);
  assert.deepEqual(r.avisos, []);
});

test('Paga la marca: una sola liquidación con propios y franquiciados, cada uno a su precio', () => {
  const r = liquidarCliente(pagaLaMarca(), { periodo: '2026-10', mep: MEP, ventas: ventasDeLaMarca });
  assert.equal(r.liquidaciones.length, 1);
  const fees = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'feePorLocal');
  assert.deepEqual(fees.map((x) => x.detalle), [
    'Servicio full - 3 locales propios x USD 50 - Octubre 2026',
    'Servicio full - 7 locales franquiciados x USD 55 - Octubre 2026',
  ]);
  // 150.000 + 385.000 de fee, 2% de 1.000.000 en un solo renglón y cloud
  assert.equal(r.liquidaciones[0].totales.brutoArs, 150000 + 385000 + 20000 + 100000);
  assert.equal(r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision').length, 1);
});

test('Si propios y franquiciados pagan lo mismo, va un solo renglón por todos los locales', () => {
  const cliente = pagaLaMarca();
  cliente.acuerdos[0].feePorLocal = { precio: 50 };
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventasDeLaMarca });
  const fees = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'feePorLocal');
  assert.deepEqual(fees.map((x) => x.detalle), ['Servicio full - 10 locales x USD 50 - Octubre 2026']);
});

test('Los franquiciados pueden tener otra comisión que los propios', () => {
  const cliente = pagaLaMarca();
  cliente.acuerdos[0].comisionFranquiciado = { delivery: 0.03 };
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventasDeLaMarca });
  const com = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision');
  assert.deepEqual(com.map((x) => x.brutoArs), [6000, 21000]);
});

test('Comisión por takeaway y delivery con tasas distintas', () => {
  const cliente = pagaLaMarca();
  cliente.acuerdos[0].comision = { delivery: 0.03, takeaway: 0.01 };
  const filas = [...ventasDeLaMarca, venta('propios', 150000, 'takeaway'), venta('franquiciados', 350000, 'takeaway')];
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: filas });
  const com = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision');
  assert.deepEqual(com.map((x) => x.brutoArs), [30000, 5000]);
});

test('Si la marca paga todo con la misma comisión, alcanza con el total de ventas', () => {
  const cliente = pagaLaMarca();
  assert.deepEqual(gruposDeVentas(normalizarCliente(cliente), cliente.acuerdos[0]).map((g) => [g.id, g.locales]), [['todos', 10]]);
  const total = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: [venta('todos', 1000000)] });
  const separadas = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventasDeLaMarca });
  for (const r of [total, separadas]) {
    assert.deepEqual(r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision').map((x) => x.brutoArs), [20000]);
    assert.deepEqual(r.avisos, []);
  }
  const sinVentas = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: [venta('propios', 300000)] });
  assert.deepEqual(sinVentas.avisos, ['Faltan las ventas de delivery de Septiembre 2026 de todos los locales.']);
});

test('Con otra comisión para los franquiciados, las ventas van por separado', () => {
  const cliente = pagaLaMarca();
  cliente.acuerdos[0].comisionFranquiciado = { delivery: 0.03 };
  assert.deepEqual(gruposDeVentas(normalizarCliente(cliente), cliente.acuerdos[0]).map((g) => g.id), ['propios', 'franquiciados']);
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: [venta('todos', 1000000)] });
  assert.equal(r.avisos.length, 2);
  // Si los franquiciados no pagan comisión, solo se cargan las ventas de los propios.
  cliente.acuerdos[0].comisionFranquiciado = {};
  assert.deepEqual(gruposDeVentas(normalizarCliente(cliente), cliente.acuerdos[0]).map((g) => g.id), ['propios']);
});

test('Faltan las ventas de un grupo: avisa cuál y no inventa el monto', () => {
  const r = liquidarCliente(marcaX(), { periodo: '2026-10', mep: MEP, ventas: ventasPorFranquiciado.slice(1) });
  assert.deepEqual(r.avisos, ['Faltan las ventas de delivery de Septiembre 2026 de los locales propios.']);
  const otro = liquidarCliente(marcaX(), { periodo: '2026-10', mep: MEP, ventas: [venta('propios', 1), venta('f2', 1)] });
  assert.deepEqual(otro.avisos, ['Faltan las ventas de delivery de Septiembre 2026 de Franquicia Uno SRL.']);
});

test('Las ventas de otro cliente no se mezclan', () => {
  const r = liquidarCliente(pagaLaMarca(), { periodo: '2026-10', mep: MEP, ventas: [...ventasDeLaMarca, venta('propios', 999999, 'delivery', 'otra')] });
  assert.equal(r.liquidaciones[0].renglones.find((x) => x.tipo === 'comision').brutoArs, 20000);
});

test('Fee mensual fijo: no importan los locales ni los franquiciados', () => {
  const cliente = { ...marcaX(), acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 650 } }], extras: [] };
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP });
  assert.equal(r.liquidaciones.length, 1);
  assert.equal(r.liquidaciones[0].pagador.tipo, 'marca');
  assert.deepEqual(r.liquidaciones[0].renglones.map((x) => x.brutoArs), [650000]);
  assert.deepEqual(r.avisos, []);
});

test('Híbrido "el mayor de los dos": cobra la comisión si supera al fee', () => {
  const cliente = { ...pagaLaMarca(), extras: [] };
  cliente.acuerdos[0].combinacion = { modo: 'mayor' };
  const chico = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventasDeLaMarca });
  assert.ok(chico.liquidaciones[0].renglones.every((x) => x.tipo === 'feePorLocal'));
  const grandes = [venta('propios', 15000000), venta('franquiciados', 35000000)];
  const grande = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: grandes });
  assert.deepEqual(grande.liquidaciones[0].renglones.map((x) => x.tipo), ['comision']);
  assert.equal(grande.liquidaciones[0].totales.brutoArs, 1000000);
});

test('Híbrido con tope de comisión', () => {
  const cliente = { ...pagaLaMarca(), extras: [] };
  cliente.acuerdos[0].combinacion = { modo: 'tope', tope: 200 };
  const grandes = [venta('propios', 15000000), venta('franquiciados', 35000000)];
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: grandes });
  const com = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision');
  assert.deepEqual(com.map((x) => x.brutoArs), [200000]);
});

test('Sin precio por local la liquidación se frena con un error claro', () => {
  const cliente = { ...pagaLaMarca(), acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: {} }] };
  assert.throws(() => liquidarCliente(cliente, { periodo: '2026-10', mep: MEP }), /Falta el precio por local/);
});

const hatsu = {
  id: 'hatsu',
  nombre: 'Hatsu Sushi',
  quienPaga: 'marca',
  acuerdos: [{ vigenciaDesde: '2026-08', moneda: 'ARS', ajusteIpc: { activo: true, mesBase: '2026-08' }, feeFijo: { monto: 500000 } }],
};

test('Acuerdo en pesos ajustado por el último IPC publicado (M-2), acumulado mes a mes', () => {
  // Septiembre usa IPC de julio (2%), octubre usa IPC de agosto (3%).
  const ipc = { '2026-07': 0.02, '2026-08': 0.03 };
  const r = liquidarCliente(hatsu, { periodo: '2026-10', ipc });
  // 500.000 x 1,02 = 510.000 x 1,03 = 525.300
  assert.equal(r.liquidaciones[0].renglones[0].brutoArs, 525300);
  assert.equal(r.liquidaciones[0].renglones[0].moneda, 'ARS');
  const base = liquidarCliente(hatsu, { periodo: '2026-08', ipc });
  assert.equal(base.liquidaciones[0].renglones[0].brutoArs, 500000);
});

test('Sin el IPC necesario la liquidación se frena con un error claro', () => {
  assert.throws(() => liquidarCliente(hatsu, { periodo: '2026-10', ipc: { '2026-07': 0.02 } }), ErrorLiquidacion);
});

const unLocal = () => ({ id: 'c', nombre: 'C', quienPaga: 'marca', locales: { propios: 1 }, acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 62 } }] });

test('Sin MEP no liquida acuerdos en dólares', () => {
  assert.throws(() => liquidarCliente(unLocal(), { periodo: '2026-10' }), /MEP/);
});

test('Cambio de precio: cada mes usa el acuerdo vigente', () => {
  const cliente = unLocal();
  cliente.acuerdos.push({ vigenciaDesde: '2026-11', moneda: 'USD', feePorLocal: { precio: 70 } });
  assert.equal(liquidarCliente(cliente, { periodo: '2026-10', mep: MEP }).liquidaciones[0].totales.brutoArs, 62000);
  assert.equal(liquidarCliente(cliente, { periodo: '2026-11', mep: MEP }).liquidaciones[0].totales.brutoArs, 70000);
});

test('Extra que paga un franquiciado (excepción)', () => {
  const cliente = marcaX();
  cliente.extras[0].pagador = 'f1';
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventasPorFranquiciado });
  const f1 = r.liquidaciones.find((l) => l.pagador.id === 'f1');
  assert.ok(f1.renglones.some((x) => x.tipo === 'hosting'));
});

test('Todos los locales propios: no hay franquiciados aunque haya quedado algo cargado', () => {
  const cliente = normalizarCliente({ ...marcaX(), tieneFranquiciados: false });
  assert.equal(cliente.quienPaga, 'marca');
  assert.deepEqual(gruposDeLocales(cliente).map((g) => g.id), ['propios']);
});

test('Clientes guardados con un renglón por local se leen como cantidades', () => {
  const viejo = {
    id: 'v',
    nombre: 'Viejo',
    quienPaga: 'franquiciados',
    franquiciados: [{ id: 'f1', razonSocial: 'F1 SRL' }],
    locales: [
      { id: 'a', nombre: 'A', tipo: 'propio', alta: '2025-01-01' },
      { id: 'b', nombre: 'B', tipo: 'propio', alta: '2025-01-01' },
      { id: 'c', nombre: 'C', tipo: 'franquiciado', franquiciadoId: 'f1', alta: '2025-01-01' },
      { id: 'd', nombre: 'D', tipo: 'propio', alta: '2025-01-01', baja: '2026-01-31' },
    ],
    acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 55, precioPropio: 50 }, prorrateo: { modo: 'completo' } }],
  };
  const c = normalizarCliente(viejo);
  assert.equal(c.tieneFranquiciados, true);
  assert.deepEqual(c.locales, { propios: 2, franquiciados: 0 });
  assert.equal(c.franquiciados[0].locales, 1);
  assert.deepEqual(c.acuerdos[0], { vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 50, precioFranquiciado: 55 } });
  const r = liquidarCliente(viejo, { periodo: '2026-10', mep: MEP });
  assert.deepEqual(r.liquidaciones.map((l) => l.totales.brutoArs), [100000, 55000]);
});
