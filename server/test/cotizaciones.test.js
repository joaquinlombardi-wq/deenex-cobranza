import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarSerie, mepEnFecha, ultimos, actualizarPorIpc } from '../src/engine/cotizaciones.js';
import { leerMepHistorico, leerMepHoy, leerIpc, documentosCotizaciones, fechaArgentina } from '../src/cotizaciones/fuentes.js';
import { leerSeriePegada, leerFecha, leerNumero } from '../src/cotizaciones/importar.js';

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

test('Arma un documento de MEP por año y uno de IPC con toda la serie', () => {
  const datos = { mep: { '2022-12-30': 340, '2025-12-31': 1400, '2026-01-02': 1410 }, ipc: { '1943-03': 0.016, '2026-01': 0.02 }, actualizado: 'x' };
  const docs = documentosCotizaciones(datos);
  assert.deepEqual(docs.map((d) => d.path), ['cotizaciones/mep-2022', 'cotizaciones/mep-2025', 'cotizaciones/mep-2026', 'cotizaciones/ipc']);
  assert.deepEqual(docs[3].data.valores, { '1943-03': 0.016, '2026-01': 0.02 });
  assert.equal(docs[3].data.origen, 'automatico');
  const recortados = documentosCotizaciones(datos, '2023-01-01');
  assert.deepEqual(recortados.map((d) => d.path), ['cotizaciones/mep-2025', 'cotizaciones/mep-2026', 'cotizaciones/ipc']);
  assert.deepEqual(recortados[2].data.valores, datos.ipc);
});

test('Actualiza un monto por IPC componiendo los meses posteriores al de origen', () => {
  const ipc = { '2026-06': 0.016, '2026-07': 0.019, '2026-08': 0.021 };
  // 100.000 de mayo llevados a agosto: × 1,016 × 1,019 × 1,021
  assert.deepEqual(actualizarPorIpc(100000, ipc, '2026-05', '2026-08'), {
    monto: 105704.54, factor: 1.057045384, variacion: 0.057045384, meses: 3, faltan: [],
  });
  assert.deepEqual(actualizarPorIpc(100000, ipc, '2026-08', '2026-08'), { monto: 100000, factor: 1, variacion: 0, meses: 0, faltan: [] });
  assert.deepEqual(actualizarPorIpc(100000, ipc, '2026-07', '2026-09').faltan, ['2026-09']);
});

test('Importa el IPC copiado de la página de ArgentinaDatos', () => {
  const json = JSON.stringify([{ fecha: '1943-03-31', valor: 1.6 }, { fecha: '1943-04-30', valor: -0.9 }, { fecha: '2026-08-31', valor: 1.7 }]);
  assert.deepEqual(leerSeriePegada(`  ${json}\n`, 'ipc'), {
    valores: { '1943-03': 0.016, '1943-04': -0.009, '2026-08': 0.017 }, formato: 'json', descartadas: [],
  });
});

test('Importa el IPC pegado de un Excel, con encabezado y meses en palabras', () => {
  const texto = 'Mes\tIPC\nene-24\t20,6\nfebrero de 2024\t13,2 %\n03/2024;11\n2024-04-30,8.8';
  assert.deepEqual(leerSeriePegada(texto, 'ipc'), {
    valores: { '2024-01': 0.206, '2024-02': 0.132, '2024-03': 0.11, '2024-04': 0.088 }, formato: 'texto', descartadas: ['Mes\tIPC'],
  });
});

test('Importa el historial de MEP: JSON de la página o columnas de Excel', () => {
  const json = JSON.stringify([{ casa: 'bolsa', compra: 1530, venta: 1549.8, fecha: '2026-10-01' }]);
  assert.deepEqual(leerSeriePegada(json, 'mep').valores, { '2026-10-01': 1549.8 });
  const texto = 'fecha;compra;venta\n01/10/2026;1.530,00;1.549,80\n02/10/2026\t1551\n2026-10-03 1.553,5\nmes sin día 2026-10 1.560';
  const { valores, descartadas } = leerSeriePegada(texto, 'mep');
  assert.deepEqual(valores, { '2026-10-01': 1549.8, '2026-10-02': 1551, '2026-10-03': 1553.5 });
  assert.equal(descartadas.length, 2);
});

test('Avisa si el JSON pegado quedó cortado o no hay datos', () => {
  assert.throws(() => leerSeriePegada('[{"fecha":"1943-03-31","valor":1.6},{"fe', 'ipc'), /incompleto/);
  assert.throws(() => leerSeriePegada('hola', 'ipc'), /No encontré meses/);
  assert.throws(() => leerSeriePegada('   ', 'mep'), /No pegaste nada/);
});

test('Lee fechas y números en los formatos de acá', () => {
  assert.deepEqual(leerFecha('31/01/2017'), { anio: 2017, mes: 1, dia: 31 });
  assert.deepEqual(leerFecha('dic-89'), { anio: 1989, mes: 12, dia: null });
  assert.equal(leerFecha('13/2017'), null);
  assert.equal(leerNumero('3.079,5', 'ipc'), 3079.5);
  assert.equal(leerNumero('1.549', 'mep'), 1549);
  assert.equal(leerNumero('1.549', 'ipc'), 1.549);
  assert.equal(leerNumero('1,549.80', 'mep'), 1549.8);
});
