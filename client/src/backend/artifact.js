// Backend para la versión publicada en claude.ai: el motor corre en el navegador y los datos
// se guardan en la base del artifact (capability `db`). Si la vista no tiene base, usa memoria.
import { liquidarCliente, ErrorLiquidacion } from '../../../server/src/engine/liquidar.js';
import { periodoAnterior } from '../../../server/src/engine/periodos.js';

const memoria = new Map();
const storeMemoria = {
  async get(path) { return memoria.get(path) ?? null; },
  async set(path, data) { memoria.set(path, structuredClone(data)); },
  async list(coleccion) {
    return [...memoria].filter(([p]) => p.startsWith(`${coleccion}/`)).map(([, d]) => d);
  },
};

let storePromise;
function store() {
  storePromise ??= (async () => {
    const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
    if (!db) return { ...storeMemoria, guardaDatos: false };
    return {
      guardaDatos: true,
      async get(path) {
        const snap = await db.doc(path).get();
        return snap.exists ? snap.data() : null;
      },
      async set(path, data) { await db.doc(path).set(JSON.parse(JSON.stringify(data))); },
      async list(coleccion) {
        const snap = await db.collection(coleccion).get();
        return snap.docs.map((d) => d.data());
      },
    };
  })();
  return storePromise;
}

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);

async function clientes() {
  const s = await store();
  return (await s.list('clientes')).sort(porNombre);
}

async function liquidarTodos({ periodo, mep, ipc }) {
  const s = await store();
  const lista = await clientes();
  const ventas = (await s.get(`ventas/${periodoAnterior(periodo)}`))?.filas ?? [];
  const resultados = lista.map((c) => {
    try {
      return liquidarCliente(c, { periodo, mep, ipc, ventas });
    } catch (e) {
      if (!(e instanceof ErrorLiquidacion)) throw e;
      return { cliente: { id: c.id, nombre: c.nombre }, periodo, error: e.message, liquidaciones: [], avisos: [] };
    }
  });
  await s.set(`cierres/${periodo}`, { periodo, mep, ipc, generadoEn: new Date().toISOString(), resultados });
  return resultados;
}

export const api = {
  estado: async () => ({ guardaDatos: (await store()).guardaDatos }),
  clientes,
  async crearCliente(c) {
    const s = await store();
    if (await s.get(`clientes/${c.id}`)) throw new Error(`Ya existe un cliente con el id "${c.id}". Cambiale el nombre o editá el existente.`);
    await s.set(`clientes/${c.id}`, c);
    return c;
  },
  async actualizarCliente(c) {
    await (await store()).set(`clientes/${c.id}`, c);
    return c;
  },
  async simular({ cliente, periodo, mep, ipc }) {
    return liquidarCliente(cliente, { periodo, mep, ipc, ventas: [] });
  },
  liquidar: liquidarTodos,
  async ventas(periodo) {
    return (await (await store()).get(`ventas/${periodo}`))?.filas ?? [];
  },
  async guardarVentas(periodo, filas) {
    await (await store()).set(`ventas/${periodo}`, { periodo, filas, actualizado: new Date().toISOString() });
    return { cargadas: filas.length };
  },
  async ipc() {
    return (await (await store()).get('parametros/ipc'))?.valores ?? {};
  },
  async guardarIpc(valores) {
    await (await store()).set('parametros/ipc', { valores });
    return valores;
  },
  async cierre(periodo) {
    return (await store()).get(`cierres/${periodo}`);
  },
};
