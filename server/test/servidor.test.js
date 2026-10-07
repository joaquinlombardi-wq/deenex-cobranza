import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearApp } from '../src/app.js';
import { crearDocumentosMemoria, nombreDeBase } from '../src/store/documentos.js';
import { crearActualizacionDiaria } from '../src/cotizaciones/diaria.js';
import { actualizarEnBase } from '../src/cotizaciones/actualizar.js';

// Lo que devuelve traerFuentes en un día normal, sin salir a internet.
const fuentes = () => ({
  dolarhoy: { ok: true, valor: { compra: 1530, venta: 1550, publicado: '2026-10-07T11:20' } },
  ipcIndec: { ok: true, valor: { '2026-08': 0.019 } },
  mepHistorico: { ok: true, valor: { '2026-10-06': 1545 } },
  ipcHistorico: { ok: false, error: 'api.argentinadatos.com no respondió' },
});

async function servir(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((listo) => { server.closeAllConnections(); server.close(listo); }));
  return `http://127.0.0.1:${server.address().port}`;
}

const credenciales = (usuario, clave) => ({ authorization: `Basic ${Buffer.from(`${usuario}:${clave}`).toString('base64')}` });

function appArmada() {
  const dist = mkdtempSync(join(tmpdir(), 'cobranza-dist-'));
  writeFileSync(join(dist, 'index.html'), '<title>Deenex Cobranza</title><div id="root"></div>');
  return dist;
}

async function esperarA(condicion) {
  for (let i = 0; i < 100; i++) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('No pasó a tiempo');
}

test('Con clave, la app y la API piden usuario y clave; el control de salud no', async (t) => {
  const url = await servir(t, crearApp({ docs: crearDocumentosMemoria(), usuario: 'deenex', clave: 'año-2026', dist: appArmada() }));

  const sin = await fetch(`${url}/`);
  assert.equal(sin.status, 401);
  assert.match(sin.headers.get('www-authenticate'), /^Basic realm="Deenex Cobranza"/);
  assert.equal((await fetch(`${url}/`, { headers: credenciales('deenex', 'otra') })).status, 401);
  assert.equal((await fetch(`${url}/api/docs/clientes`, { headers: credenciales('joaco', 'año-2026') })).status, 401);

  const app = await fetch(`${url}/`, { headers: credenciales('deenex', 'año-2026') });
  assert.equal(app.status, 200);
  assert.match(await app.text(), /<title>Deenex Cobranza<\/title>/);
  const api = await fetch(`${url}/api/docs/clientes`, { headers: credenciales('deenex', 'año-2026') });
  assert.deepEqual(await api.json(), []);
  assert.deepEqual(await (await fetch(`${url}/api/salud`)).json(), { ok: true });
});

test('Sin clave no pide nada, y sin la app armada sirve solo la API', async (t) => {
  const url = await servir(t, crearApp({ docs: crearDocumentosMemoria(), dist: join(tmpdir(), 'no-existe-cobranza') }));
  assert.equal((await fetch(`${url}/`)).status, 404);
  assert.deepEqual(await (await fetch(`${url}/api/docs/clientes`)).json(), []);
});

test('La actualización guarda el MEP de dolarhoy, el historial, el IPC y el estado', async () => {
  const docs = crearDocumentosMemoria();
  const estado = await actualizarEnBase(docs, { pedido: 'boton', traer: async () => fuentes() });
  assert.deepEqual(estado.ultima.mep, { fecha: '2026-10-07', venta: 1550, compra: 1530, publicado: '2026-10-07T11:20', guardado: true });
  assert.deepEqual(estado.ultima.ipc, { mes: '2026-08', valor: 0.019, fuente: 'INDEC' });
  assert.equal(estado.ultima.ok, true);
  assert.deepEqual(estado.ultima.errores, [{ fuente: 'ArgentinaDatos (IPC)', mensaje: 'api.argentinadatos.com no respondió' }]);
  assert.deepEqual((await docs.get('cotizaciones/mep-dolarhoy')).valores, { '2026-10-07': 1550 });
  assert.deepEqual((await docs.get('cotizaciones/mep-2026')).valores, { '2026-10-06': 1545 });
  assert.deepEqual((await docs.get('cotizaciones/ipc')).valores, { '2026-08': 0.019 });
  assert.deepEqual(await docs.get('cotizaciones/estado'), estado);
});

// Un reloj que se mueve a mano y una actualización falsa que deja el estado como la de verdad.
function diaria({ sale = true, estadoInicial } = {}) {
  const docs = crearDocumentosMemoria(estadoInicial ? [{ path: 'cotizaciones/estado', data: estadoInicial }] : []);
  let ahora = Date.parse('2026-10-07T12:00:00Z'); // 9:00 en Buenos Aires
  const pedidos = [];
  const avisos = [];
  const alUsar = crearActualizacionDiaria({
    docs,
    reloj: () => ahora,
    avisar: (m) => avisos.push(m),
    actualizar: async (pedido) => {
      pedidos.push([new Date(ahora).toISOString(), pedido]);
      if (sale === 'error') throw new Error('se cayó la base');
      const ultima = { pedido, inicio: new Date(ahora).toISOString(), ok: sale };
      await docs.set('cotizaciones/estado', { ultima });
      return { ultima };
    },
  });
  const minutos = (m) => { ahora += m * 60000; };
  return { alUsar, pedidos, avisos, minutos };
}

test('El dólar y el IPC se traen solos la primera vez que se usa la app cada día', async () => {
  const d = diaria();
  await d.alUsar();
  assert.equal(await d.alUsar(), null, 'el pedido siguiente no vuelve a mirar');
  d.minutos(11);
  await d.alUsar();
  d.minutos(14 * 60); // 23:11 del mismo día
  await d.alUsar();
  assert.deepEqual(d.pedidos, [['2026-10-07T12:00:00.000Z', 'automatico']]);

  d.minutos(60); // 0:11 del día siguiente
  await d.alUsar();
  assert.deepEqual(d.pedidos.map(([cuando]) => cuando), ['2026-10-07T12:00:00.000Z', '2026-10-08T03:11:00.000Z']);
});

test('Si ese día ya se actualizó con el botón, no corre la automática', async () => {
  const d = diaria({ estadoInicial: { ultima: { pedido: 'boton', inicio: '2026-10-07T11:30:00Z', ok: true } } });
  await d.alUsar();
  assert.deepEqual(d.pedidos, []);
});

test('Si la actualización del día falla, la reintenta pasado un rato', async () => {
  const d = diaria({ sale: false });
  await d.alUsar();
  d.minutos(11);
  await d.alUsar();
  d.minutos(11);
  await d.alUsar();
  d.minutos(11); // 33 minutos después de la primera
  await d.alUsar();
  assert.deepEqual(d.pedidos.map(([cuando]) => cuando), ['2026-10-07T12:00:00.000Z', '2026-10-07T12:33:00.000Z']);
});

test('Un error en la actualización del día se avisa y no corta el pedido', async () => {
  const d = diaria({ sale: 'error' });
  await d.alUsar();
  assert.deepEqual(d.avisos, ['No pude actualizar el dólar y el IPC: se cayó la base']);
});

test('La actualización del día arranca con un pedido con clave, no con el control de salud', async (t) => {
  const docs = crearDocumentosMemoria();
  let veces = 0;
  const traer = async () => { veces++; return fuentes(); };
  const url = await servir(t, crearApp({ docs, clave: 'secreta', diaria: true, traer }));
  await fetch(`${url}/api/salud`);
  await fetch(`${url}/api/docs/clientes`);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(veces, 0);

  await fetch(`${url}/api/docs/clientes`, { headers: credenciales('deenex', 'secreta') });
  await esperarA(async () => (await docs.get('cotizaciones/estado'))?.ultima?.pedido === 'automatico');
  assert.equal(veces, 1);
});

test('El botón y la actualización del día van de a una, sin pisarse', async (t) => {
  let enVuelo = 0;
  let maximo = 0;
  const traer = async () => {
    maximo = Math.max(maximo, ++enVuelo);
    await new Promise((r) => setTimeout(r, 30));
    enVuelo--;
    return fuentes();
  };
  const url = await servir(t, crearApp({ docs: crearDocumentosMemoria(), traer }));
  const pedir = (pedido) => fetch(`${url}/api/cotizaciones/actualizar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido }),
  }).then((r) => r.json());
  const [automatica, boton] = await Promise.all([pedir('automatico'), pedir('boton')]);
  assert.equal(maximo, 1);
  assert.deepEqual([automatica.ultima.pedido, boton.ultima.pedido], ['automatico', 'boton']);
});

test('La dirección de Atlas sin nombre de base guarda en "cobranza"', () => {
  assert.equal(nombreDeBase('mongodb+srv://joaco:clave@cluster0.ab1cd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'), 'cobranza');
  assert.equal(nombreDeBase('mongodb+srv://joaco:clave@cluster0.ab1cd.mongodb.net'), 'cobranza');
  assert.equal(nombreDeBase('mongodb://localhost:27017/cobranza-dev'), undefined);
});
