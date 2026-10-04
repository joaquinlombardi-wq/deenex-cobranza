import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidarCliente, ErrorLiquidacion } from '../src/engine/liquidar.js';

const MEP = 1000;

// Marca X: 3 locales propios y 7 franquiciados (4 de F1, 3 de F2). USD 50 propios, USD 55 franquiciados, 2% delivery.
const marcaX = () => ({
  id: 'marca-x',
  nombre: 'Marca X',
  razonSocial: 'Marca X S.A.',
  cuit: '30-11111111-1',
  quienPaga: 'franquiciados',
  franquiciados: [
    { id: 'f1', razonSocial: 'Franquicia Uno SRL', cuit: '30-22222222-2' },
    { id: 'f2', razonSocial: 'Franquicia Dos SRL', cuit: '30-33333333-3' },
  ],
  locales: [
    ...[1, 2, 3].map((i) => ({ id: `p${i}`, nombre: `Propio ${i}`, tipo: 'propio', alta: '2025-01-01' })),
    ...[1, 2, 3, 4].map((i) => ({ id: `a${i}`, nombre: `F1 local ${i}`, tipo: 'franquiciado', franquiciadoId: 'f1', alta: '2025-01-01' })),
    ...[1, 2, 3].map((i) => ({ id: `b${i}`, nombre: `F2 local ${i}`, tipo: 'franquiciado', franquiciadoId: 'f2', alta: '2025-01-01' })),
  ],
  acuerdos: [
    { vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 55, precioPropio: 50 }, comision: { delivery: 0.02 } },
  ],
  extras: [{ concepto: 'Infraestructura cloud', tipo: 'hosting', monto: 100, moneda: 'USD' }],
});

const ventas = (ids, monto = 100000, canal = 'delivery') =>
  ids.map((id) => ({ local_id: id, periodo: '2026-09', canal, total_con_iva: monto }));

const todosLosLocales = ['p1', 'p2', 'p3', 'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'];

test('Paga cada franquiciado: una liquidación a la marca (propios + extras) y una por franquiciado', () => {
  const r = liquidarCliente(marcaX(), { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales) });
  assert.deepEqual(
    r.liquidaciones.map((l) => l.pagador.nombre),
    ['Marca X', 'Franquicia Dos SRL', 'Franquicia Uno SRL'],
  );
  const [marca, f2, f1] = r.liquidaciones;
  // Marca: 3 x 50 x 1000 + 2% de 300.000 + cloud 100 x 1000
  assert.deepEqual(marca.renglones.map((x) => x.brutoArs), [150000, 6000, 100000]);
  assert.equal(marca.pagador.cuit, '30-11111111-1');
  // F1: 4 x 55 x 1000 + 2% de 400.000, sin extras
  assert.deepEqual(f1.renglones.map((x) => x.brutoArs), [220000, 8000]);
  assert.equal(f1.pagador.cuit, '30-22222222-2');
  assert.deepEqual(f2.renglones.map((x) => x.brutoArs), [165000, 6000]);
  assert.equal(f2.totales.netoArs, 206910);
});

test('Paga la marca: todo en una sola liquidación', () => {
  const cliente = { ...marcaX(), quienPaga: 'marca' };
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales) });
  assert.equal(r.liquidaciones.length, 1);
  assert.equal(r.liquidaciones[0].totales.brutoArs, 150000 + 385000 + 20000 + 100000);
});

test('Precio específico de un local pisa el del acuerdo', () => {
  const cliente = marcaX();
  cliente.locales[0].precio = 30;
  const r = liquidarCliente({ ...cliente, quienPaga: 'marca' }, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales) });
  const fees = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'feePorLocal');
  assert.deepEqual(fees.map((x) => [x.cantidad, x.precioUnitario]), [[1, 30], [2, 50], [7, 55]]);
});

test('Comisión por takeaway y delivery con tasas distintas', () => {
  const cliente = { ...marcaX(), quienPaga: 'marca' };
  cliente.acuerdos[0].comision = { delivery: 0.03, takeaway: 0.01 };
  const filas = [...ventas(todosLosLocales, 100000), ...ventas(todosLosLocales, 50000, 'takeaway')];
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: filas });
  const com = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision');
  assert.deepEqual(com.map((x) => x.brutoArs), [30000, 5000]);
});

test('Faltan ventas de un local: avisa y no inventa el monto', () => {
  const r = liquidarCliente(marcaX(), { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales.slice(1)) });
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /Propio 1/);
});

test('Híbrido "el mayor de los dos": cobra la comisión si supera al fee', () => {
  const cliente = { ...marcaX(), quienPaga: 'marca', extras: [] };
  cliente.acuerdos[0].combinacion = { modo: 'mayor' };
  const chico = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales) });
  assert.ok(chico.liquidaciones[0].renglones.every((x) => x.tipo === 'feePorLocal'));
  const grande = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales, 5000000) });
  assert.deepEqual(grande.liquidaciones[0].renglones.map((x) => x.tipo), ['comision']);
  assert.equal(grande.liquidaciones[0].totales.brutoArs, 1000000);
});

test('Híbrido con tope de comisión', () => {
  const cliente = { ...marcaX(), quienPaga: 'marca', extras: [] };
  cliente.acuerdos[0].combinacion = { modo: 'tope', tope: 200 };
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales, 5000000) });
  const com = r.liquidaciones[0].renglones.filter((x) => x.tipo === 'comision');
  assert.deepEqual(com.map((x) => x.brutoArs), [200000]);
});

const unLocal = (alta, prorrateo, baja) => ({
  id: 'c',
  nombre: 'C',
  quienPaga: 'marca',
  locales: [{ id: 'l1', nombre: 'Nuevo', tipo: 'propio', alta, baja }],
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 62 }, prorrateo }],
});

test('Local que abre a mitad de mes: proporcional a los días', () => {
  const r = liquidarCliente(unLocal('2026-10-17', { modo: 'proporcional' }), { periodo: '2026-10', mep: MEP });
  // 15 de 31 días x USD 62 = USD 30
  assert.equal(r.liquidaciones[0].renglones[0].brutoArs, 30000);
  assert.match(r.liquidaciones[0].renglones[0].detalle, /15\/31 días/);
});

test('Local que abre a mitad de mes: mes completo por defecto', () => {
  const r = liquidarCliente(unLocal('2026-10-17'), { periodo: '2026-10', mep: MEP });
  assert.equal(r.liquidaciones[0].renglones[0].brutoArs, 62000);
});

test('Local que abre después del día de corte no paga ese mes', () => {
  const r = liquidarCliente(unLocal('2026-10-17', { modo: 'corte', dia: 15 }), { periodo: '2026-10', mep: MEP });
  assert.equal(r.liquidaciones.length, 0);
});

test('Local dado de baja antes del mes no se cobra', () => {
  const r = liquidarCliente(unLocal('2025-01-01', undefined, '2026-09-30'), { periodo: '2026-10', mep: MEP });
  assert.equal(r.liquidaciones.length, 0);
});

const hatsu = {
  id: 'hatsu',
  nombre: 'Hatsu Sushi',
  quienPaga: 'marca',
  locales: [],
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

test('Sin MEP no liquida acuerdos en dólares', () => {
  assert.throws(() => liquidarCliente(unLocal('2025-01-01'), { periodo: '2026-10' }), /MEP/);
});

test('Cambio de precio: cada mes usa el acuerdo vigente', () => {
  const cliente = unLocal('2025-01-01');
  cliente.acuerdos.push({ vigenciaDesde: '2026-11', moneda: 'USD', feePorLocal: { precio: 70 } });
  assert.equal(liquidarCliente(cliente, { periodo: '2026-10', mep: MEP }).liquidaciones[0].totales.brutoArs, 62000);
  assert.equal(liquidarCliente(cliente, { periodo: '2026-11', mep: MEP }).liquidaciones[0].totales.brutoArs, 70000);
});

test('Extra que paga un franquiciado (excepción)', () => {
  const cliente = marcaX();
  cliente.extras[0].pagador = 'f1';
  const r = liquidarCliente(cliente, { periodo: '2026-10', mep: MEP, ventas: ventas(todosLosLocales) });
  const f1 = r.liquidaciones.find((l) => l.pagador.id === 'f1');
  assert.ok(f1.renglones.some((x) => x.tipo === 'hosting'));
});
