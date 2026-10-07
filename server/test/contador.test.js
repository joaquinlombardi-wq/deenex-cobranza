import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { liquidarCliente } from '../src/engine/liquidar.js';
import { planillaContador, nombreArchivoContador } from '../src/facturacion/planillaContador.js';
import { armarLibroContador } from '../src/facturacion/libroContador.js';
import * as c from './casos-octubre-2026.js';

// El cierre de octubre con los clientes en el orden de la planilla emitida (F-01 a F-06).
const octubre = {
  periodo: '2026-10',
  mep: c.MEP_OCTUBRE,
  fechaMep: '2026-10-01',
  resultados: [c.laFabrica, c.meetAndEat, c.quem, c.quemCentral, c.konex, c.pannus].map((cliente) =>
    liquidarCliente(cliente, { periodo: '2026-10', mep: c.MEP_OCTUBRE, ventas: c.ventasQuemSeptiembre }),
  ),
};

test('La planilla de octubre tiene una factura por cliente y suma lo emitido', () => {
  const p = planillaContador(octubre);
  assert.deepEqual(p.facturas.map((f) => [f.numero, f.cliente, f.renglones.length]), [
    ['F-01', 'LA FÁBRICA (NAGYMAROS)', 3],
    ['F-02', 'MEET & EAT', 1],
    ['F-03', 'QUEM S.A.', 2],
    ['F-04', 'QUEM S.A. (Central / Distribuidora)', 1],
    ['F-05', 'KONEX', 2],
    ['F-06', 'PANNUS', 1],
  ]);
  // Los totales de la hoja DETALLE emitida: USD 7.690 de bruto y $ 14.472.791,22 de neto. En la
  // hoja emitida el reintegro sin IVA ($ 6.900) no tenía bruto, así que su bruto total daba
  // $ 11.955.282; acá el reintegro tiene bruto igual al neto y bruto + IVA = neto.
  assert.deepEqual(p.totales, {
    usd: { bruto: 7690, iva: 1614.9, neto: 9304.9 },
    ars: { bruto: 11962182, iva: 2510609.22, neto: 14472791.22 },
  });
  assert.equal(nombreArchivoContador('2026-10'), 'Facturacion_Octubre_2026.xlsx');
});

test('Cada renglón lleva el producto de Dux con su nombre exacto; lo que va en pesos no tiene columnas en dólares', () => {
  const [laFabrica, , quem] = planillaContador(octubre).facturas;
  const reintegro = laFabrica.renglones.find((r) => r.productoDux === '2');
  assert.deepEqual([reintegro.productoDuxNombre, reintegro.ivaPct, reintegro.usd, reintegro.ars], ['REINTEGROS A CLIENTES', 0, null, { bruto: 6900, iva: 0, neto: 6900 }]);
  const [fee, comision] = quem.renglones;
  assert.equal(fee.productoDuxNombre, 'SUSCRIPCION - FULL PLAN (VENTAS & FIDELIZACION & MARKETING)');
  assert.deepEqual(fee.usd, { bruto: 540, iva: 113.4, neto: 653.4 });
  assert.equal(comision.productoDuxNombre, 'COMISION % - TRANSACCIONES DELIVERY Y TAKE AWAY');
  assert.deepEqual([comision.moneda, comision.usd, comision.ars.bruto], ['ARS', null, 37320]);
  const productos = planillaContador(octubre).productos;
  assert.deepEqual(productos.find((x) => x.codigo === 'P006').usadoEn, ['F-01', 'F-03', 'F-04', 'F-05', 'F-06']);
  assert.deepEqual(productos.find((x) => x.codigo === 'P0008').usadoEn, []);
});

test('Si paga cada franquiciado, cada uno es una factura con su razón social y su CUIT', () => {
  const marca = {
    id: 'sushi',
    nombre: 'SUSHI CLUB',
    razonSocial: 'Sushi Club SA',
    cuit: '30-11111111-1',
    tieneFranquiciados: true,
    quienPaga: 'franquiciados',
    locales: { propios: 2 },
    franquiciados: [{ id: 'f1', razonSocial: 'Rolls SRL', cuit: '30-22222222-2', locales: 3 }],
    acuerdos: [{ vigenciaDesde: '2026-01', moneda: 'USD', feePorLocal: { precio: 50 } }],
    extras: [],
  };
  const cierre = { periodo: '2026-11', mep: 1000, resultados: [liquidarCliente(marca, { periodo: '2026-11', mep: 1000, ventas: [] })] };
  const { facturas } = planillaContador(cierre);
  assert.deepEqual(facturas.map((f) => [f.numero, f.cliente, f.cuit, f.totales.ars.bruto]), [
    ['F-01', 'SUSHI CLUB (Sushi Club SA)', '30-11111111-1', 100000],
    ['F-02', 'Rolls SRL (franquiciado de SUSHI CLUB)', '30-22222222-2', 150000],
  ]);
});

test('Lo que no se pudo liquidar queda afuera y anotado; lo que hay que revisar va en observaciones', () => {
  const cierre = {
    periodo: '2026-11',
    mep: 1538,
    resultados: [
      { cliente: { id: 'x', nombre: 'SIN ACUERDO' }, error: 'SIN ACUERDO no tiene un acuerdo cargado.', liquidaciones: [], avisos: [] },
      liquidarCliente(c.quem, { periodo: '2026-11', mep: 1538, ventas: [] }),
    ],
  };
  const p = planillaContador(cierre);
  assert.deepEqual(p.pendientes, [{ cliente: 'SIN ACUERDO', motivo: 'SIN ACUERDO no tiene un acuerdo cargado.' }]);
  assert.deepEqual(p.facturas.map((f) => f.numero), ['F-01']);
  assert.deepEqual(p.facturas[0].observaciones, ['REVISAR: Faltan las ventas de delivery de Octubre 2026 de los locales propios.']);
});

test('El Excel tiene DETALLE con fórmulas que dan lo del sistema y PRODUCTOS DUX', async () => {
  const { libro } = armarLibroContador(ExcelJS, octubre, '2026-10-01T09:00:00.000Z');
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  assert.deepEqual(leido.worksheets.map((h) => h.name), ['DETALLE', 'PRODUCTOS DUX']);

  const detalle = leido.getWorksheet('DETALLE');
  assert.equal(detalle.getCell('I2').value, 1549.8);
  assert.deepEqual(detalle.getRow(4).values.slice(1, 7), ['FACTURA', 'CLIENTE', 'CUIT', 'CÓDIGO DUX', 'PRODUCTO DUX (sistema contable)', 'DETALLE EN LA FACTURA']);
  // F-01, primer renglón: 86 locales x USD 60 al MEP de la celda I2.
  assert.deepEqual([detalle.getCell('A5').value, detalle.getCell('G5').value, detalle.getCell('I5').value], ['F-01', 86, 60]);
  assert.equal(detalle.getCell('N5').value.formula, 'IF($H5="USD",ROUND($G5*$I5*$I$2,2),ROUND($G5*$I5,2))');
  assert.deepEqual([detalle.getCell('K5').value.result, detalle.getCell('N5').value.result, detalle.getCell('P5').value.result], [5160, 7996968, 9676331.28]);

  // Diez renglones (5 a 14) y el total general debajo, sumando todos.
  assert.equal(detalle.getCell('A15').value, 'TOTAL GENERAL');
  assert.deepEqual(detalle.getCell('P15').value, { formula: 'SUM(P5:P14)', result: 14472791.22 });
  assert.deepEqual(detalle.getCell('K15').value, { formula: 'SUM(K5:K14)', result: 7690 });

  const productos = leido.getWorksheet('PRODUCTOS DUX');
  const filas = productos.getSheetValues().filter(Boolean).map((v) => v.slice(1));
  assert.deepEqual(filas.find((v) => v[0] === 'P002'), ['P002', 'COMISION % - TRANSACCIONES DELIVERY Y TAKE AWAY', 'VENTAS', 0.21, 'PESOS', 'F-03']);
  assert.equal(productos.getCell('F4').value, 'USADO EN OCTUBRE');
});
