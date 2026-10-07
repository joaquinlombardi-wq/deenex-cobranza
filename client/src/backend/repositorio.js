// Lógica de datos del sistema, igual para las dos versiones: recibe un "store" de documentos
// ({ get, set, delete, list }) que puede ser la base del artifact de claude.ai o la API Express.
//
// Documentos:
//   clientes/<id>                       el cliente: marca, cantidad de locales propios y franquiciados (y sus cambios por mes), acuerdos, extras
//   ventas/<AAAA-MM>                    { filas: [{ cliente_id, grupo, periodo, canal, total_con_iva }] } se cargan en la cuenta de cada cliente (o las manda la plataforma)
//   cierres/<AAAA-MM>                   { periodo, mep, fechaMep, resultados, confirmado }
//   cargos/<AAAA-MM>~<cliente>~<pagador> lo que debe cada pagador por un mes (sale de un cierre confirmado)
//   cargos/saldo~<cliente>~<pagador>~<id> { tipo: 'saldoAnterior', ... } lo que ya debía antes de usar el sistema
//   pagos/<id>                          { clienteId, pagadorId, fecha, montoArs, medio, nota }
//   facturacion/<AAAA-MM>               { periodo, mep, renglones } lo facturado un mes anterior, importado del Excel del contador
//   cotizaciones/mep-<AAAA>             { valores: { 'AAAA-MM-DD': venta }, fuente, origen } automático o importado
//   cotizaciones/mep-dolarhoy           { valores, detalle } el MEP venta tomado de dolarhoy (botón Actualizar o la tarea diaria)
//   cotizaciones/mep-manual             { valores } cargados a mano
//   cotizaciones/ipc                    { valores: { 'AAAA-MM': 0.021 }, fuente, origen } de INDEC, toda la serie
//   cotizaciones/estado                 { ultima } cómo salió la última actualización de dólar e IPC
//   parametros/ipc                      { valores } cargados a mano
import { liquidarCliente, ErrorLiquidacion, acuerdoVigente } from '../../../server/src/engine/liquidar.js';
import { normalizarCliente, conLocalesEnMes, localesEn, gruposDeVentas } from '../../../server/src/engine/clientes.js';
import { reemplazarVentasCliente } from '../../../server/src/engine/ventas.js';
import { periodoAnterior, mesACerrar } from '../../../server/src/engine/periodos.js';
import { combinarSerie, combinarMep } from '../../../server/src/engine/cotizaciones.js';
import { resumenFacturacion } from '../../../server/src/engine/facturacion.js';
import { vencimientoDe } from '../../../server/src/engine/cuentaCorriente.js';
import { leerSeriePegada } from '../../../server/src/cotizaciones/importar.js';
import { FUENTE_MEP, FUENTE_IPC } from '../../../server/src/cotizaciones/fuentes.js';

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
const ahora = () => new Date().toISOString();
const azar = () => Math.random().toString(36).slice(2, 10);
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
    let dolarhoy = {};
    for (const { id, data } of docs) {
      if (/^mep-\d{4}$/.test(id)) {
        Object.assign(auto, data.valores);
        if (!ultimo || (data.actualizado ?? '') > (ultimo.actualizado ?? '')) ultimo = data;
      } else if (id === 'mep-manual') {
        manual = data.valores ?? {};
      } else if (id === 'mep-dolarhoy') {
        dolarhoy = data;
      }
    }
    return {
      ...combinarMep({ automatica: auto, manual, dolarhoy: dolarhoy.valores }),
      detalleDolarhoy: dolarhoy.detalle ?? {},
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
  // confirmado, reemplaza los cargos de ese mes (los pagos y los saldos anteriores no se tocan).
  async function confirmarCierre(periodo) {
    const cierre = await store.get(`cierres/${periodo}`);
    if (!cierre) throw new Error('Primero generá las liquidaciones del mes.');
    const lista = await clientes();
    const nuevos = cargosDeCierre(cierre, new Map(lista.map((c) => [c.id, c])));
    const ids = new Set(nuevos.map((c) => c.id));
    const existentes = await store.list('cargos', [['periodo', '==', periodo]]);
    for (const { id, data } of existentes) {
      if (!ids.has(id) && data.tipo !== 'saldoAnterior') await store.delete(`cargos/${id}`);
    }
    for (const { id, data } of nuevos) await store.set(`cargos/${id}`, data);
    const confirmado = { en: ahora(), firma: firmaCierre(cierre.resultados), cargos: nuevos.length };
    await store.set(`cierres/${periodo}`, { ...cierre, confirmado });
    return { ...cierre, confirmado };
  }

  async function clienteGuardado(id) {
    const c = await store.get(`clientes/${id}`);
    if (!c) throw new Error('No encontré el cliente. Puede que lo hayan borrado.');
    return c;
  }

  // Cambio en la cantidad de locales desde un mes: un cambio por mes, el último manda.
  async function guardarCambiosLocales(clienteId, cambiar) {
    const actual = await clienteGuardado(clienteId);
    const cambiosLocales = cambiar(actual.cambiosLocales ?? []).sort((a, b) => a.desde.localeCompare(b.desde));
    const nuevo = sinVacios({ ...actual, cambiosLocales });
    await store.set(`clientes/${clienteId}`, nuevo);
    return normalizarCliente(nuevo);
  }

  return {
    estado: async () => ({ guardaDatos: store.guardaDatos !== false }),
    clientes,
    async cliente(id) {
      return normalizarCliente(await clienteGuardado(id));
    },
    cambiarLocales: (clienteId, cambio) =>
      guardarCambiosLocales(clienteId, (cambios) => [...cambios.filter((x) => x.desde !== cambio.desde), { ...cambio, registradoEn: ahora() }]),
    borrarCambioLocales: (clienteId, desde) => guardarCambiosLocales(clienteId, (cambios) => cambios.filter((x) => x.desde !== desde)),
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
    // El mes que toca cerrar hoy ('AAAA-MM-DD'): ver mesACerrar en periodos.js.
    async mesACerrar(hoy) {
      const actual = hoy.slice(0, 7);
      const cierres = await Promise.all([actual, periodoAnterior(actual, -1)].map((p) => store.get(`cierres/${p}`)));
      return mesACerrar(hoy, cierres.filter(Boolean));
    },
    // Cierres generados que no están en las cuentas corrientes (o cambiaron desde que se pasaron).
    async cierresSinPasar() {
      return datos(await store.list('cierres'))
        .filter((c) => c.resultados?.some((r) => r.liquidaciones?.length))
        .filter((c) => !c.confirmado || c.confirmado.firma !== firmaCierre(c.resultados))
        .map((c) => ({
          periodo: c.periodo,
          cambio: Boolean(c.confirmado),
          totalArs: c.resultados.flatMap((r) => r.liquidaciones).reduce((s, l) => s + l.totales.netoArs, 0),
        }))
        .sort((a, b) => a.periodo.localeCompare(b.periodo));
    },
    // Lo facturado mes a mes, para el análisis de la pestaña Ventas.
    async facturacion() {
      const [cargos, cierres, importados] = await Promise.all([store.list('cargos'), store.list('cierres'), store.list('facturacion')]);
      return resumenFacturacion({ cargos: datos(cargos), cierres: datos(cierres), importados: datos(importados) });
    },
    async importarFacturacion(periodo, { mep, renglones }) {
      await store.set(`facturacion/${periodo}`, sinVacios({ periodo, mep: mep ?? null, renglones, importadoEn: ahora() }));
      return { renglones: renglones.length };
    },
    borrarFacturacion: (periodo) => store.delete(`facturacion/${periodo}`),
    async ventas(periodo) {
      return (await store.get(`ventas/${periodo}`))?.filas ?? [];
    },
    // Las ventas de un cliente en todos los meses cargados.
    async ventasDeCliente(clienteId) {
      return datos(await store.list('ventas'))
        .flatMap((d) => (d.filas ?? []).map((f) => ({ ...f, periodo: f.periodo ?? d.periodo })))
        .filter((f) => f.cliente_id === clienteId);
    },
    // Lo que se carga mes a mes en la cuenta de un cliente: cuántos locales tuvo (rige desde ese mes
    // hasta el próximo cambio) y cuánto vendió en cada canal que cobra comisión.
    // `valores` es { 'grupo|canal': monto } con los grupos de gruposDeVentas para esos locales.
    async guardarMesCliente(clienteId, periodo, { locales, valores }) {
      const guardado = await clienteGuardado(clienteId);
      let cliente = normalizarCliente(guardado);
      const cambios = locales && conLocalesEnMes(cliente, periodo, locales);
      if (cambios && JSON.stringify(cambios) !== JSON.stringify(cliente.cambiosLocales)) {
        const cambiosLocales = cambios.map((x) => (x.desde === periodo ? { ...x, registradoEn: ahora() } : x));
        await store.set(`clientes/${clienteId}`, sinVacios({ ...guardado, cambiosLocales }));
        cliente = normalizarCliente({ ...guardado, cambiosLocales });
      }
      if (valores) {
        const acuerdo = acuerdoVigente(cliente, periodo);
        const grupos = acuerdo?.comision ? gruposDeVentas(localesEn(cliente, periodo), acuerdo) : [];
        const actual = (await store.get(`ventas/${periodo}`))?.filas ?? [];
        const filas = reemplazarVentasCliente(actual, { clienteId, periodo, grupos, valores });
        if (JSON.stringify(filas) !== JSON.stringify(actual)) await store.set(`ventas/${periodo}`, { periodo, filas, actualizado: ahora() });
      }
      return cliente;
    },
    // Los cierres guardados y los meses importados del Excel, para el historial.
    async historial() {
      const [cierres, importados] = await Promise.all([store.list('cierres'), store.list('facturacion')]);
      return { cierres: datos(cierres), importados: datos(importados) };
    },
    async guardarVentas(periodo, filas) {
      await store.set(`ventas/${periodo}`, { periodo, filas, actualizado: ahora() });
      return { cargadas: filas.length };
    },
    async cotizaciones() {
      const [mep, ipc] = await Promise.all([serieMep(), serieIpc()]);
      return { mep, ipc };
    },
    // Cómo salió la última actualización de dólar e IPC (la escribe la tarea programada).
    async estadoCotizaciones() {
      return (await store.get('cotizaciones/estado'))?.ultima ?? null;
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
      const id = `${pago.fecha}~${azar()}`;
      const data = { ...pago, id, registradoEn: ahora() };
      await store.set(`pagos/${id}`, data);
      return data;
    },
    borrarPago: (id) => store.delete(`pagos/${id}`),
    // Lo que un pagador ya debía antes de empezar a usar el sistema. Vence en la fecha que se
    // cargue, así los pagos lo cancelan primero.
    async cargarSaldoAnterior({ clienteId, pagadorId = 'marca', fecha, montoArs, concepto }) {
      const cliente = normalizarCliente(await clienteGuardado(clienteId));
      const franquiciado = pagadorId === 'marca' ? null : cliente.franquiciados.find((f) => f.id === pagadorId);
      if (pagadorId !== 'marca' && !franquiciado) throw new Error('Ese franquiciado no está cargado en el cliente.');
      const id = `saldo~${clienteId}~${pagadorId}~${azar()}`;
      const data = {
        id,
        tipo: 'saldoAnterior',
        concepto: concepto?.trim() || 'Saldo anterior',
        periodo: fecha.slice(0, 7),
        vencimiento: fecha,
        clienteId,
        clienteNombre: cliente.nombre,
        pagadorId,
        pagadorTipo: franquiciado ? 'franquiciado' : 'marca',
        pagadorNombre: franquiciado ? franquiciado.razonSocial : cliente.razonSocial || cliente.nombre,
        cuit: (franquiciado ? franquiciado.cuit : cliente.cuit) ?? null,
        montoArs,
        renglones: [],
        emitidoEn: ahora(),
      };
      await store.set(`cargos/${id}`, data);
      return data;
    },
    async borrarSaldoAnterior(id) {
      const cargo = await store.get(`cargos/${id}`);
      if (cargo?.tipo !== 'saldoAnterior') throw new Error('Solo se pueden borrar los saldos anteriores cargados a mano.');
      await store.delete(`cargos/${id}`);
    },
  };
}
