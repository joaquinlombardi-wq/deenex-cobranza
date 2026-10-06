import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoriaDe, resumenFacturacion } from '../src/engine/facturacion.js';
import { leerDetallePegado, leerImporte, facturasDe, sugerirCliente, asignarClientes } from '../src/facturacion/importarDetalle.js';

const fixture = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');

// Los clientes como están cargados en el sistema (los que importan para reconocer el Excel).
const CLIENTES = [
  { id: 'la-fabrica', nombre: 'LA FÁBRICA (NAGYMAROS)', acuerdos: [{ vigenciaDesde: '2025-01' }] },
  { id: 'la-fabrica-de-sandwiches', nombre: 'LA FABRICA DE SANDWICHES', razonSocial: 'NAGYMAROS', acuerdos: [{ vigenciaDesde: '2026-10' }] },
  { id: 'meet-and-eat', nombre: 'MEET & EAT', acuerdos: [{ vigenciaDesde: '2025-01' }] },
  { id: 'quem', nombre: 'QUEM S.A.', acuerdos: [{ vigenciaDesde: '2025-01' }] },
  { id: 'quem-central', nombre: 'QUEM S.A. (Central / Distribuidora)', acuerdos: [{ vigenciaDesde: '2025-01' }] },
  { id: 'konex', nombre: 'KONEX', acuerdos: [{ vigenciaDesde: '2025-01' }] },
  { id: 'pannus', nombre: 'PANNUS', acuerdos: [{ vigenciaDesde: '2025-01' }] },
];

test('Cada renglón va a su categoría: abonos, comisiones e infraestructura son MRR; lo demás, extra', () => {
  const tipos = ['feePorLocal', 'feeFijo', 'comision', 'hosting', 'servidores', 'desarrollo', 'lanzamientoApp', 'reintegro'];
  assert.deepEqual(tipos.map((tipo) => categoriaDe({ tipo })),
    ['abonos', 'abonos', 'comisiones', 'infraestructura', 'infraestructura', 'extras', 'extras', 'reintegros']);
  const codigos = ['P006', 'P0020', 'P002', 'CLUBSOCIOS', 'P0005', 'P004', '8', 'APPLAUNCH', '9', '2', 'XYZ'];
  assert.deepEqual(codigos.map((productoDux) => categoriaDe({ productoDux })),
    ['abonos', 'abonos', 'comisiones', 'comisiones', 'infraestructura', 'infraestructura', 'extras', 'extras', 'extras', 'reintegros', 'extras']);
});

test('Lee montos como los copia Excel, en formato argentino o inglés', () => {
  assert.equal(leerImporte('$ 7.501.032,00'), 7501032);
  assert.equal(leerImporte('($ 103.146,00)'), -103146);
  assert.equal(leerImporte('USD 4.920,00'), 4920);
  assert.equal(leerImporte('$ 11,962,182.00'), 11962182);
  assert.equal(leerImporte('-6900'), -6900);
  assert.ok(Number.isNaN(leerImporte('F-01')));
});

test('Importa la hoja DETALLE de septiembre: renglones, dólar y total como en la planilla', () => {
  const r = leerDetallePegado(fixture('detalle-septiembre-2026.tsv'));
  assert.equal(r.renglones.length, 12);
  // Septiembre no trae el dólar en la hoja: sale de un renglón en dólares (114.345 / 75).
  assert.equal(r.mep, 1524.6);
  assert.deepEqual(r.totales, { brutoArs: 11256924, ivaArs: 2363954.04, netoArs: 13620878.04 });
  assert.deepEqual(r.totalPlanilla, { brutoArs: 11256924, netoArs: 13620878.04 });
  assert.deepEqual(r.descartadas, []);
  const reintegro = r.renglones.find((x) => x.productoDux === '2');
  assert.deepEqual([reintegro.brutoArs, reintegro.ivaPct, reintegro.precioUnitario], [-103146, 0.21, -103146]);
});

test('Importa la hoja DETALLE de octubre copiada con números en inglés y el dólar arriba', () => {
  const r = leerDetallePegado(fixture('detalle-octubre-2026.tsv'));
  assert.equal(r.mep, 1549.8);
  assert.equal(r.renglones.length, 10);
  assert.equal(r.totales.netoArs, 14472791.22);
  assert.equal(r.totalPlanilla.netoArs, 14472791.22);
  const sinIva = r.renglones.find((x) => x.productoDux === '2');
  assert.deepEqual([sinIva.brutoArs, sinIva.ivaArs, sinIva.netoArs], [6900, 0, 6900]);
});

test('Sin montos en pesos calcula cantidad x precio x dólar', () => {
  const texto = ['FACTURA\tCLIENTE\tCÓDIGO DUX\tDETALLE\tCANT.\tMON.\tP. UNIT.\tIVA %', 'F-01\tPANNUS\tP006\tServicio full\t3\tUSD\t65\t21%', 'F-02\tPANNUS\t2\tDescuento\t1\tARS\t-1000\t21%'].join('\n');
  const r = leerDetallePegado(texto, { mep: 1500 });
  assert.deepEqual(r.renglones.map((x) => [x.brutoArs, x.ivaArs, x.netoArs]), [[292500, 61425, 353925], [-1000, -210, -1210]]);
  assert.throws(() => leerDetallePegado('CLIENTE\tMONTO\nPANNUS\t10'), /títulos de la hoja DETALLE/);
});

test('Reconoce a qué cliente del sistema corresponde cada factura del Excel', () => {
  const septiembre = facturasDe(leerDetallePegado(fixture('detalle-septiembre-2026.tsv')).renglones);
  const elegidos = Object.fromEntries(septiembre.map((f) => [`${f.factura} ${f.cliente}`, sugerirCliente(f, CLIENTES, '2026-09')]));
  assert.deepEqual(elegidos, {
    'F-01 LA FÁBRICA': 'la-fabrica',
    'F-02 PALTA': null,
    'F-03 QUEM S.A.': 'quem',
    'F-04 QUEM S.A.': 'quem-central',
    'F-05 KONEX': 'konex',
    'F-06 PANNUS': 'pannus',
    'F-07 CAFEJU S.R.L.': null,
  });
  const octubre = facturasDe(leerDetallePegado(fixture('detalle-octubre-2026.tsv')).renglones);
  assert.equal(sugerirCliente(octubre.find((f) => f.factura === 'F-01'), CLIENTES, '2026-10'), 'la-fabrica');
  assert.equal(sugerirCliente(octubre.find((f) => f.factura === 'F-02'), CLIENTES, '2026-10'), 'meet-and-eat');
});

test('Septiembre importado: MRR, extra jobs y reintegros suman el total facturado', () => {
  const { renglones, mep } = leerDetallePegado(fixture('detalle-septiembre-2026.tsv'));
  const elegidos = Object.fromEntries(facturasDe(renglones).map((f) => [f.clave, sugerirCliente(f, CLIENTES, '2026-09')]));
  const [mes] = resumenFacturacion({ importados: [{ periodo: '2026-09', mep, renglones: asignarClientes(renglones, elegidos, CLIENTES) }] });
  assert.equal(mes.origen, 'excel');
  assert.deepEqual(mes.categorias, { abonos: 10184328, comisiones: 70407, infraestructura: 343035, extras: 762300, reintegros: -103146 });
  assert.deepEqual([mes.mrrArs, mes.extrasArs, mes.reintegrosArs, mes.totalArs, mes.netoArs], [10597770, 762300, -103146, 11256924, 13620878.04]);
  const konex = mes.clientes.find((c) => c.clienteId === 'konex');
  assert.deepEqual([konex.mrrArs, konex.extrasArs, konex.totalArs], [990990, 762300, 1753290]);
  // Lo que no tiene cliente en el sistema queda con el nombre del Excel.
  assert.ok(mes.clientes.some((c) => c.clienteId === 'excel-palta' && c.clienteNombre === 'PALTA'));
});

const renglon = (tipo, brutoArs) => ({ tipo, brutoArs, netoArs: brutoArs * 1.21 });
const liquidacion = (renglones) => ({ renglones });

test('Cada mes sale de las cuentas corrientes, si no del Excel y si no del cierre sin pasar', () => {
  const cargos = [
    { periodo: '2026-10', clienteId: 'konex', clienteNombre: 'KONEX', mep: 1549.8, renglones: [renglon('feeFijo', 1007370), renglon('desarrollo', 774900)] },
    // Un saldo anterior no es facturación de ese mes.
    { tipo: 'saldoAnterior', periodo: '2026-08', clienteId: 'konex', montoArs: 500000, renglones: [] },
  ];
  const importados = [
    { periodo: '2026-09', mep: 1524.6, renglones: [{ clienteId: 'konex', clienteNombre: 'KONEX', productoDux: 'P006', brutoArs: 990990, netoArs: 1199097.9 }] },
    { periodo: '2026-10', mep: 1549.8, renglones: [{ clienteId: 'konex', clienteNombre: 'KONEX', productoDux: 'P006', brutoArs: 1 }] },
  ];
  const cierres = [
    { periodo: '2026-10', mep: 1, resultados: [{ cliente: { id: 'konex', nombre: 'KONEX' }, liquidaciones: [liquidacion([renglon('feeFijo', 2)])] }] },
    { periodo: '2026-11', mep: 1538, resultados: [
      { cliente: { id: 'konex', nombre: 'KONEX' }, liquidaciones: [liquidacion([renglon('feeFijo', 999700), renglon('desarrollo', 769000)])] },
      { cliente: { id: 'nuevo', nombre: 'Nuevo' }, arranca: '2026-12', liquidaciones: [] },
    ] },
  ];
  const meses = resumenFacturacion({ cargos, cierres, importados });
  assert.deepEqual(meses.map((m) => [m.periodo, m.origen, m.mep, m.mrrArs, m.extrasArs]), [
    ['2026-09', 'excel', 1524.6, 990990, 0],
    ['2026-10', 'cuentas', 1549.8, 1007370, 774900],
    ['2026-11', 'cierre', 1538, 999700, 769000],
  ]);
  assert.deepEqual(meses[2].clientes.map((c) => c.clienteId), ['konex']);
});
