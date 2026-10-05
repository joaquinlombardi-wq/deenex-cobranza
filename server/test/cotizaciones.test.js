import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarSerie, mepEnFecha, ultimos } from '../src/engine/cotizaciones.js';
import { leerMepHistorico, leerMepHoy, leerIpc, documentosCotizaciones, fechaArgentina } from '../src/cotizaciones/fuentes.js';

const serie = { '2026-10-01': 1549.8, '2026-10-02': 1551, '2026-10-03': 1553.5 };

test('MEP de un día hábil', () => {
  assert.deepEqual(mepEnFecha(serie, '2026-10-02'), { fecha: '2026-10-02', valor: 1551 });
});

test('MEP de un fin de semana usa el último día hábil anterior', () => {
  assert.deepEqual(mepEnFecha(serie, '2026-10-05'), { fecha: '2026-10-03', valor: 1553.5 });
});

test('Sin cotización cercana no inventa un valor', () => {
  assert.equal(mepEnFecha(serie, '2026-11-20'), null);
  assert.equal(mepEnFecha(serie, '2026-09-30'), null);
});

test('La fuente manda y lo cargado a mano completa huecos', () => {
  const { valores, fuentes } = combinarSerie({ '2026-08': 0.021 }, { '2026-08': 0.03, '2026-09': 0.019 });
  assert.deepEqual(valores, { '2026-08': 0.021, '2026-09': 0.019 });
  assert.deepEqual(fuentes, { '2026-08': 'automatica', '2026-09': 'manual' });
});

test('Últimos valores de la serie, del más nuevo al más viejo', () => {
  assert.deepEqual(ultimos(serie, 2).map((x) => x.clave), ['2026-10-03', '2026-10-02']);
});

test('Lee el historial de MEP de ArgentinaDatos', () => {
  const json = [
    { casa: 'bolsa', compra: 1530, venta: 1549.8, fecha: '2026-10-01' },
    { casa: 'bolsa', compra: 1531, venta: null, fecha: '2026-10-02' },
    { casa: 'bolsa', compra: 1532, venta: 1553.5, fecha: 'mal' },
  ];
  assert.deepEqual(leerMepHistorico(json), { '2026-10-01': 1549.8 });
  assert.throws(() => leerMepHistorico([]), /vacío/);
});

test('Lee la cotización del día de DolarApi en fecha argentina', () => {
  assert.equal(fechaArgentina('2026-10-06T01:30:00.000Z'), '2026-10-05');
  assert.deepEqual(leerMepHoy({ casa: 'bolsa', compra: 1540, venta: 1555.2, fechaActualizacion: '2026-10-05T18:00:00.000Z' }), {
    fecha: '2026-10-05',
    venta: 1555.2,
  });
});

test('Lee el IPC mensual como fracción', () => {
  assert.deepEqual(leerIpc([{ fecha: '2026-08-31', valor: 2.1 }, { fecha: '2026-09-30', valor: 1.85 }]), {
    '2026-08': 0.021,
    '2026-09': 0.0185,
  });
});

test('Arma un documento de MEP por año y uno de IPC', () => {
  const docs = documentosCotizaciones(
    { mep: { '2022-12-30': 340, '2025-12-31': 1400, '2026-01-02': 1410 }, ipc: { '2022-12': 0.05, '2026-01': 0.02 }, actualizado: 'x' },
    '2023-01-01',
  );
  assert.deepEqual(docs.map((d) => d.path), ['cotizaciones/mep-2025', 'cotizaciones/mep-2026', 'cotizaciones/ipc']);
  assert.deepEqual(docs[2].data.valores, { '2026-01': 0.02 });
});
