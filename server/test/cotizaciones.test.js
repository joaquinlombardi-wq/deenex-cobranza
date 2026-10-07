import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarSerie, combinarMep, mepEnFecha, ultimos, actualizarPorIpc } from '../src/engine/cotizaciones.js';
import {
  leerMepHistorico, leerMepHoy, leerIpc, fechaArgentina, leerPesos, leerHoraDolarhoy, leerMepDolarhoy, leerIpcIndec, FUENTES,
} from '../src/cotizaciones/fuentes.js';
import { armarActualizacion, traerFuentes } from '../src/cotizaciones/actualizar.js';
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

test('MEP: manda dolarhoy, después lo cargado a mano y después el historial', () => {
  const { valores, fuentes } = combinarMep({
    automatica: { '2026-10-01': 1545, '2026-10-02': 1547, '2026-10-05': 1548 },
    manual: { '2026-10-01': 1538, '2026-10-05': 1549 },
    dolarhoy: { '2026-10-05': 1549.8 },
  });
  assert.deepEqual(valores, { '2026-10-01': 1538, '2026-10-02': 1547, '2026-10-05': 1549.8 });
  assert.deepEqual(fuentes, { '2026-10-01': 'manual', '2026-10-02': 'automatica', '2026-10-05': 'dolarhoy' });
});

// Página de dolarhoy con el formato que usa: un casillero por Compra y Venta y la hora de actualización.
const PAGINA_DOLARHOY = `<!DOCTYPE html><html lang="es"><head><title>Dólar MEP hoy</title>
<script>window.datos = { titulo: "Venta $9999" };</script></head><body>
<nav><a href="/cotizaciondolarblue">D&oacute;lar blue</a></nav>
<div class="tile is-parent is-7 is-vertical">
  <div class="tile is-child"><h1 class="title">D&oacute;lar MEP hoy</h1></div>
  <div class="tile is-child"><div class="topic">Compra</div><div class="value">$1530.10</div></div>
  <div class="tile is-child">
    <div class="topic">Venta</div>
    <div class="value">$1549.80</div>
  </div>
</div>
<div class="tile update"><span>Actualizado por &uacute;ltima vez: 07/10/26 10:44 AM</span></div>
<aside><div class="title">D&oacute;lar blue</div><div class="topic">Compra</div><div class="value">$1500.00</div>
<div class="topic">Venta</div><div class="value">$1520.00</div></aside>
</body></html>`;

test('Lee el MEP de la página de dolarhoy: el primer casillero de venta y la hora', () => {
  assert.deepEqual(leerMepDolarhoy(PAGINA_DOLARHOY), { compra: 1530.1, venta: 1549.8, publicado: '2026-10-07T10:44' });
  // Si cambian el armado de la página, toma el primer número después de la palabra.
  assert.deepEqual(leerMepDolarhoy('<p>Compra: $ 1.530,10</p><p>Venta: $ 1.549,80</p><p>Actualizado 03/10/2026 05:00 PM</p>'), {
    compra: 1530.1, venta: 1549.8, publicado: '2026-10-03T17:00',
  });
  assert.throws(() => leerMepDolarhoy('<p>Página en mantenimiento</p>'), /No encontré el valor de venta/);
  assert.throws(() => leerMepDolarhoy('<p>Compra $1600</p><p>Venta $1549,80</p>'), /mayor que la venta/);
});

test('Lee montos y horas como los escribe dolarhoy', () => {
  assert.equal(leerPesos('$1549.80'), 1549.8);
  assert.equal(leerPesos('$ 1.549,80'), 1549.8);
  assert.equal(leerPesos('1549,8'), 1549.8);
  assert.equal(leerPesos('1.549'), 1549);
  assert.equal(leerPesos('1,549.80'), 1549.8);
  assert.ok(Number.isNaN(leerPesos('-')));
  assert.equal(leerHoraDolarhoy('Actualizado por última vez: 07/10/26 12:05 AM'), '2026-10-07T00:05');
  assert.equal(leerHoraDolarhoy('Actualizado por última vez: 07/10/26 12:05 PM'), '2026-10-07T12:05');
  assert.equal(leerHoraDolarhoy('sin fecha'), null);
});

test('Lee el IPC nacional, nivel general, del CSV del INDEC', () => {
  const csv = [
    'Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region',
    '0;NIVEL GENERAL;Nivel general y divisiones COICOP;201612;100;;;Nacional',
    '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202607;12345,6;1,9;30,5;Nacional',
    '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202608;12580,1;1,9466;29,1;Nacional',
    '01;Alimentos y bebidas no alcoh\u00f3licas;Nivel general y divisiones COICOP;202608;1;2,5;1;Nacional',
    '0;NIVEL GENERAL;Nivel general y divisiones COICOP;202608;1;2,4;1;GBA',
  ].join('\r\n');
  assert.deepEqual(leerIpcIndec(csv), { '2026-07': 0.019, '2026-08': 0.019 });
  // Con acentos mal leídos (el archivo viene en latin1) y separado por comas.
  const latin = 'C\ufffddigo,Descripci\ufffdn,Periodo,v_m_IPC,Regi\ufffdn\n0,Nivel general,2026-08,-0.25,Nacional';
  assert.deepEqual(leerIpcIndec(latin), { '2026-08': -0.002 });
  assert.throws(() => leerIpcIndec('a;b\n1;2'), /columnas Periodo y v_m_IPC/);
});

const ok = (valor) => ({ ok: true, valor });
const fallo = (error) => ({ ok: false, error });
const fuentesBase = () => ({
  dolarhoy: ok({ compra: 1530.1, venta: 1549.8, publicado: '2026-10-07T10:44' }),
  ipcIndec: ok({ '2026-07': 0.019, '2026-08': 0.019 }),
  mepHistorico: ok({ '2025-12-31': 1400, '2026-10-06': 1545 }),
  ipcHistorico: ok({ '1943-03': 0.016, '2026-07': 0.019, '2026-08': 0.02 }),
});

test('La primera actualización arma el historial, el MEP de dolarhoy y el IPC del INDEC', () => {
  const { documentos, estado } = armarActualizacion({ fuentes: fuentesBase(), ahora: '2026-10-07T13:46:00.000Z', pedido: 'boton' });
  assert.deepEqual(documentos.map((d) => d.id), ['mep-2025', 'mep-2026', 'mep-dolarhoy', 'ipc']);
  const dolarhoy = documentos[2].data;
  assert.deepEqual(dolarhoy.valores, { '2026-10-07': 1549.8 });
  assert.deepEqual(dolarhoy.detalle['2026-10-07'], {
    compra: 1530.1, venta: 1549.8, publicado: '2026-10-07T10:44', leidoEn: '2026-10-07T13:46:00.000Z', pedido: 'boton',
  });
  // El INDEC pisa al historial donde los dos tienen el mes.
  assert.deepEqual(documentos[3].data.valores, { '1943-03': 0.016, '2026-07': 0.019, '2026-08': 0.019 });
  assert.deepEqual(estado.ultima.mep, { fecha: '2026-10-07', venta: 1549.8, compra: 1530.1, publicado: '2026-10-07T10:44', guardado: true });
  assert.deepEqual(estado.ultima.ipc, { mes: '2026-08', valor: 0.019, fuente: 'INDEC' });
  assert.equal(estado.ultima.ok, true);
  assert.deepEqual(estado.ultima.errores, []);
  assert.deepEqual(estado.ultima.documentos, ['mep-2025', 'mep-2026', 'mep-dolarhoy', 'ipc']);
});

test('La corrida diaria no pisa el MEP que ya se tomó ese día; el botón sí', () => {
  const actuales = {
    'mep-2025': { valores: { '2025-12-31': 1400 } },
    'mep-2026': { valores: { '2026-10-06': 1545 } },
    'mep-dolarhoy': { valores: { '2026-10-07': 1547 }, detalle: { '2026-10-07': { compra: 1529, venta: 1547, publicado: '2026-10-07T10:02' } } },
    ipc: { valores: { '1943-03': 0.016, '2026-07': 0.019, '2026-08': 0.019 } },
  };
  const diaria = armarActualizacion({ actuales, fuentes: fuentesBase(), ahora: '2026-10-07T20:10:00.000Z' });
  assert.deepEqual(diaria.documentos, []);
  assert.deepEqual(diaria.estado.ultima.mep, { fecha: '2026-10-07', venta: 1547, compra: 1529, publicado: '2026-10-07T10:02', guardado: false });
  const boton = armarActualizacion({ actuales, fuentes: fuentesBase(), ahora: '2026-10-07T20:10:00.000Z', pedido: 'boton' });
  assert.deepEqual(boton.documentos.map((d) => d.id), ['mep-dolarhoy']);
  assert.equal(boton.documentos[0].data.valores['2026-10-07'], 1549.8);
});

test('Un sábado guarda el MEP con la fecha que publicó dolarhoy', () => {
  const fuentes = { ...fuentesBase(), dolarhoy: ok({ compra: 1530, venta: 1551, publicado: '2026-10-09T17:00' }) };
  const { estado } = armarActualizacion({ fuentes, ahora: '2026-10-10T14:00:00.000Z', pedido: 'boton' });
  assert.equal(estado.ultima.mep.fecha, '2026-10-09');
});

test('Una lectura de dolarhoy muy lejos del último MEP conocido no se guarda', () => {
  const fuentes = { ...fuentesBase(), dolarhoy: ok({ compra: 15301, venta: 15498, publicado: '2026-10-07T10:44' }) };
  const actuales = { 'mep-manual': { valores: { '2026-10-06': 1549 } } };
  const { documentos, estado } = armarActualizacion({ actuales, fuentes, ahora: '2026-10-07T13:46:00.000Z', pedido: 'boton' });
  assert.ok(!documentos.some((d) => d.id === 'mep-dolarhoy'));
  assert.equal(estado.ultima.mep, null);
  assert.equal(estado.ultima.ok, false);
  assert.match(estado.ultima.errores[0].mensaje, /15498.*1549 \(2026-10-06\)/);
});

test('Si una fuente falla sigue con las otras, avisa y no borra lo que había', () => {
  const fuentes = { ...fuentesBase(), dolarhoy: fallo('dolarhoy.com respondió 403'), ipcIndec: fallo('www.indec.gob.ar no respondió') };
  const actuales = { ipc: { valores: { '2026-09': 0.018 } } };
  const { documentos, estado } = armarActualizacion({ actuales, fuentes, ahora: '2026-10-07T13:46:00.000Z' });
  assert.deepEqual(documentos.find((d) => d.id === 'ipc').data.valores, { '1943-03': 0.016, '2026-07': 0.019, '2026-08': 0.02, '2026-09': 0.018 });
  assert.deepEqual(estado.ultima.ipc, { mes: '2026-09', valor: 0.018, fuente: 'ArgentinaDatos' });
  assert.equal(estado.ultima.mep, null);
  assert.equal(estado.ultima.ok, false);
  assert.deepEqual(estado.ultima.errores.map((e) => e.fuente), ['dolarhoy', 'INDEC']);
});

test('Trae cada fuente por separado y guarda lo crudo antes de leerlo', async () => {
  const respuestas = {
    [FUENTES.dolarhoy]: () => new Response(PAGINA_DOLARHOY, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    [FUENTES.indec]: () => new Response(new Uint8Array([...Buffer.from('Periodo;v_m_IPC;Regi\xf3n;Codigo\n202608;1,9;Nacional;0', 'latin1')]), {
      headers: { 'content-type': 'text/csv; charset=ISO-8859-1' },
    }),
    [FUENTES.mepHistorico]: () => new Response('no es json'),
    [FUENTES.ipc]: () => new Response('', { status: 503 }),
  };
  const crudos = [];
  const r = await traerFuentes({
    fetch: async (url) => respuestas[url](),
    crudo: (nombre, texto) => crudos.push([nombre, texto.length > 0]),
  });
  assert.deepEqual(r.dolarhoy, ok({ compra: 1530.1, venta: 1549.8, publicado: '2026-10-07T10:44' }));
  assert.deepEqual(r.ipcIndec, ok({ '2026-08': 0.019 }));
  assert.equal(r.mepHistorico.ok, false);
  assert.deepEqual(r.ipcHistorico, fallo('api.argentinadatos.com respondió 503'));
  assert.deepEqual(crudos.map((c) => c[0]).sort(), ['argentinadatos-mep.json', 'dolarhoy.html', 'indec-ipc.csv']);
});

test('Si no llega a una fuente dice a cuál y por qué', async () => {
  const corte = (causa) => Promise.reject(new TypeError('fetch failed', { cause: causa }));
  const respuestas = {
    [FUENTES.dolarhoy]: () => corte(Object.assign(new Error('Proxy response (403) !== 200 when HTTP Tunneling'), { code: 'UND_ERR_ABORTED' })),
    [FUENTES.indec]: () => corte(Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' })),
    [FUENTES.mepHistorico]: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    [FUENTES.ipc]: () => Promise.reject(new TypeError('fetch failed')),
  };
  const r = await traerFuentes({ fetch: async (url) => respuestas[url]() });
  assert.deepEqual(r.dolarhoy, fallo('la red de la tarea no deja entrar a dolarhoy.com (403)'));
  assert.deepEqual(r.ipcIndec, fallo('no pude conectarme con www.indec.gob.ar: ECONNREFUSED'));
  assert.deepEqual(r.mepHistorico, fallo('api.argentinadatos.com no respondió'));
  assert.deepEqual(r.ipcHistorico, fallo('fetch failed'));
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
