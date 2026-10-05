// Lógica de datos del sistema, igual para las dos versiones: recibe un "store" de documentos
// ({ get, set, delete, list }) que puede ser la base del artifact de claude.ai o la API Express.
//
// Documentos:
//   clientes/<id>                       el cliente: marca, cantidad de locales propios y franquiciados, acuerdos, extras
//   ventas/<AAAA-MM>                    { filas: [{ cliente_id, grupo, periodo, canal, total_con_iva }] }
//   cierres/<AAAA-MM>                   { periodo, mep, fechaMep, resultados, confirmado }
//   cargos/<AAAA-MM>~<cliente>~<pagador> lo que debe cada pagador por un mes (sale de un cierre confirmado)
//   pagos/<id>                          { clienteId, pagadorId, fecha, montoArs, medio, nota }
//   cotizaciones/mep-<AAAA>             { valores: { 'AAAA-MM-DD': venta }, fuente, origen } automático o importado
//   cotizaciones/mep-manual             { valores } cargados a mano
//   cotizaciones/ipc                    { valores: { 'AAAA-MM': 0.021 }, fuente, origen } de INDEC, toda la serie
//   parametros/ipc                      { valores } cargados a mano
import { liquidarCliente, ErrorLiquidacion } from '../../../server/src/engine/liquidar.js';
import { normalizarCliente } from '../../../server/src/engine/clientes.js';
import { periodoAnterior } from '../../../server/src/engine/periodos.js';
import { combinarSerie } from '../../../server/src/engine/cotizaciones.js';
import { vencimientoDe } from '../../../server/src/engine/cuentaCorriente.js';
import { leerSeriePegada } from '../../../server/src/cotizaciones/importar.js';
import { FUENTE_MEP, FUENTE_IPC } from '../../../server/src/cotizaciones/fuentes.js';

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
const ahora = () => new Date().toISOString();
// La base guarda JSON: saca los campos sin valor (undefined) antes de guardar.
const sinVacios = (x) => JSON.parse(JSON.stringify(x));

// Firma de un cierre: cambia si cambia algún monto o pagador. Sirve para saber si hay que
// volver a pasar el cierre a las cuentas corrientes.
export function firmaCierre(resultados) {
  return resultados
    .flatMap((r) => r.liquidaciones.map((l) => `${r.cliente.id}~${l.pagador.id}=${l.totales.netoArs}`))
    .sort()
    .join('|');
}

function cargosDeCierre(cierre, clientesPorId) {
  const emitidoEn = ahora();
  return cierre.resultados
    .filter((r) => !r.error)
    .flatMap((r) =>
      r.liquidaciones.map((l) => ({
        id: `${cierre.periodo}~${r.cliente.id}~${l.pagador.id}`,
        data: {
          periodo: cierre.periodo,
          clienteId: r.cliente.id,
          clienteNombre: r.cliente.nombre,
          pagadorId: l.pagador.id,
          pagadorTipo: l.pagador.tipo,
          pagadorNombre: l.pagador.razonSocial || l.pagador.nombre,
          cuit: l.pagador.cuit ?? null,
          vencimiento: vencimientoDe(cierre.periodo, clientesPorId.get(r.cliente.id)?.diaVencimiento ?? 10),
          montoArs: l.totales.netoArs,
          brutoArs: l.totales.brutoArs,
          ivaArs: l.totales.ivaArs,
          mep: cierre.mep ?? null,
          renglones: l.renglones,
          emitidoEn,
        },
      })),
    );
}

export function crearRepositorio(store) {
  const datos = (filas) => filas.map((f) => f.data);

  async function clientes() {
    return datos(await store.list('clientes')).map(normalizarCliente).sort(porNombre);
  }

  async function serieIpc() {
    const [auto, manual] = await Promise.all([store.get('cotizaciones/ipc'), store.get('parametros/ipc')]);
    return {
      ...combinarSerie(auto?.valores, manual?.valores),
      actualizado: auto?.actualizado ?? null,
      fuente: auto?.fuente ?? null,
      origen: auto ? auto.origen ?? 'automatico' : null,
    };
  }

  async function serieMep() {
    const docs = await store.list('cotizaciones');
    const auto = {};
    let ultimo = null;
    let manual = {};
    for (const { id, data } of docs) {
      if (/^mep-\d{4}$/.test(id)) {
        Object.assign(auto, data.valores);
        if (!ultimo || (data.actualizado ?? '') > (ultimo.actualizado ?? '')) ultimo = data;
      } else if (id === 'mep-manual') {
        manual = data.valores ?? {};
      }
    }
    return {
      ...combinarSerie(auto, manual),
      actualizado: ultimo?.actualizado ?? null,
      fuente: ultimo?.fuente ?? null,
      origen: ultimo ? ultimo.origen ?? 'automatico' : null,
    };
  }

  async function guardarManual(path, clave, valor) {
    const valores = { ...((await store.get(path))?.valores ?? {}) };
    if (valor == null) delete valores[clave];
    else valores[clave] = valor;
    await store.set(path, { valores, actualizado: ahora() });
  }

  async function liquidar({ periodo, mep, fechaMep }) {
    const [lista, ventasDoc, ipc, anterior] = await Promise.all([
      clientes(),
      store.get(`ventas/${periodoAnterior(periodo)}`),
      serieIpc(),
      store.get(`cierres/${periodo}`),
    ]);
    const ventas = ventasDoc?.filas ?? [];
    const resultados = lista.map((c) => {
      try {
        return liquidarCliente(c, { periodo, mep, ipc: ipc.valores, ventas });
      } catch (e) {
        if (!(e instanceof ErrorLiquidacion)) throw e;
        return { cliente: { id: c.id, nombre: c.nombre }, periodo, error: e.message, liquidaciones: [], avisos: [] };
      }
    });
    const cierre = {
      periodo,
      mep: mep ?? null,
      fechaMep: fechaMep ?? null,
      generadoEn: ahora(),
      resultados,
      confirmado: anterior?.confirmado ?? null,
    };
    await store.set(`cierres/${periodo}`, cierre);
    return cierre;
  }

  // Pasa el cierre a las cuentas corrientes: un cargo por pagador. Si el mes ya estaba
  // confirmado, reemplaza los cargos de ese mes (los pagos no se tocan).
  async function confirmarCierre(periodo) {
    const cierre = await store.get(`cierres/${periodo}`);
    if (!cierre) throw new Error('Primero generá las liquidaciones del mes.');
    const lista = await clientes();
    const nuevos = cargosDeCierre(cierre, new Map(lista.map((c) => [c.id, c])));
    const ids = new Set(nuevos.map((c) => c.id));
    const existentes = await store.list('cargos', [['periodo', '==', periodo]]);
    for (const { id } of existentes) if (!ids.has(id)) await store.delete(`cargos/${id}`);
    for (const { id, data } of nuevos) await store.set(`cargos/${id}`, data);
    const confirmado = { en: ahora(), firma: firmaCierre(cierre.resultados), cargos: nuevos.length };
    await store.set(`cierres/${periodo}`, { ...cierre, confirmado });
    return { ...cierre, confirmado };
  }

  return {
    estado: async () => ({ guardaDatos: store.guardaDatos !== false }),
    clientes,
    async crearCliente(c) {
      if (await store.get(`clientes/${c.id}`)) {
        throw new Error(`Ya existe un cliente con el id "${c.id}". Cambiale el nombre o editá el existente.`);
      }
      await store.set(`clientes/${c.id}`, sinVacios(c));
      return c;
    },
    async actualizarCliente(c) {
      await store.set(`clientes/${c.id}`, sinVacios(c));
      return c;
    },
    async simular({ cliente, periodo, mep }) {
      return liquidarCliente(cliente, { periodo, mep, ipc: (await serieIpc()).valores, ventas: [] });
    },
    liquidar,
    confirmarCierre,
    cierre: (periodo) => store.get(`cierres/${periodo}`),
    async ventas(periodo) {
      return (await store.get(`ventas/${periodo}`))?.filas ?? [];
    },
    async guardarVentas(periodo, filas) {
      await store.set(`ventas/${periodo}`, { periodo, filas, actualizado: ahora() });
      return { cargadas: filas.length };
    },
    async cotizaciones() {
      const [mep, ipc] = await Promise.all([serieMep(), serieIpc()]);
      return { mep, ipc };
    },
    // Serie pegada en la pestaña Dólar e IPC: el JSON de ArgentinaDatos o columnas de un Excel.
    // Pisa, día por día o mes por mes, lo que ya había de la fuente; lo cargado a mano no se toca.
    async importarSerie(tipo, texto) {
      const { valores, formato, descartadas } = leerSeriePegada(texto, tipo);
      const grupos = {};
      for (const [clave, valor] of Object.entries(valores)) {
        (grupos[tipo === 'ipc' ? 'ipc' : `mep-${clave.slice(0, 4)}`] ??= {})[clave] = valor;
      }
      const actualizado = ahora();
      await Promise.all(Object.entries(grupos).map(async ([id, nuevos]) => {
        const path = `cotizaciones/${id}`;
        const actual = await store.get(path);
        const fuente = formato === 'json' ? (tipo === 'ipc' ? FUENTE_IPC : FUENTE_MEP) : actual?.fuente ?? 'Pegado de un Excel';
        await store.set(path, { valores: { ...actual?.valores, ...nuevos }, fuente, origen: 'importado', actualizado });
      }));
      const claves = Object.keys(valores).sort();
      return { cantidad: claves.length, desde: claves[0], hasta: claves.at(-1), descartadas };
    },
    guardarMepManual: (fecha, valor) => guardarManual('cotizaciones/mep-manual', fecha, valor),
    guardarIpcManual: (mes, valor) => guardarManual('parametros/ipc', mes, valor),
    async cuenta(clienteId) {
      const [cargos, pagos] = await Promise.all([
        store.list('cargos', [['clienteId', '==', clienteId]]),
        store.list('pagos', [['clienteId', '==', clienteId]]),
      ]);
      return { cargos: datos(cargos), pagos: datos(pagos) };
    },
    async cuentas() {
      const [cargos, pagos] = await Promise.all([store.list('cargos'), store.list('pagos')]);
      return { cargos: datos(cargos), pagos: datos(pagos) };
    },
    async registrarPago(pago) {
      const id = `${pago.fecha}~${Math.random().toString(36).slice(2, 10)}`;
      const data = { ...pago, id, registradoEn: ahora() };
      await store.set(`pagos/${id}`, data);
      return data;
    },
    borrarPago: (id) => store.delete(`pagos/${id}`),
  };
}
