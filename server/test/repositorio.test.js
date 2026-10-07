import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDocumentosMemoria } from '../src/store/documentos.js';
import { estadoDeCuenta } from '../src/engine/cuentaCorriente.js';
import { crearRepositorio, leerRespaldo, COLECCIONES } from '../../client/src/backend/repositorio.js';

// El repositorio arma los filtros como la base del artifact ([campo, '==', valor]); el store del
// servidor los recibe de la URL como [campo, valor].
function repositorio() {
  const docs = crearDocumentosMemoria();
  const store = { ...docs, list: (coleccion, filtros = []) => docs.list(coleccion, filtros.map(([campo, , valor]) => [campo, valor])) };
  return { repo: crearRepositorio(store), store };
}

const pannus = {
  id: 'pannus',
  nombre: 'PANNUS',
  razonSocial: 'Pannus SRL',
  locales: { propios: 3 },
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 65 } }],
  extras: [],
};

test('Pasar un cierre a cuentas corrientes no borra el saldo anterior cargado a mano', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(pannus);
  const saldo = await repo.cargarSaldoAnterior({ clienteId: 'pannus', fecha: '2026-11-02', montoArs: 239819.58, concepto: 'Septiembre impago' });
  await repo.liquidar({ periodo: '2026-11', mep: 1000 });
  await repo.confirmarCierre('2026-11');
  await repo.liquidar({ periodo: '2026-11', mep: 1100 });
  await repo.confirmarCierre('2026-11');

  const { cargos } = await repo.cuenta('pannus');
  assert.deepEqual(cargos.map((c) => [c.tipo ?? 'mes', c.montoArs]).sort(), [['mes', 259545], ['saldoAnterior', 239819.58]]);
  assert.equal(cargos.find((c) => c.tipo === 'saldoAnterior').pagadorNombre, 'Pannus SRL');

  await repo.borrarSaldoAnterior(saldo.id);
  assert.equal((await repo.cuenta('pannus')).cargos.length, 1);
  await assert.rejects(repo.borrarSaldoAnterior('2026-11~pannus~marca'), /Solo se pueden borrar los saldos anteriores/);
});

test('Un pago cancela primero el saldo anterior y la deuda queda en el saldo', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(pannus);
  await repo.cargarSaldoAnterior({ clienteId: 'pannus', fecha: '2026-10-10', montoArs: 100000 });
  await repo.liquidar({ periodo: '2026-11', mep: 1000 });
  await repo.confirmarCierre('2026-11');
  await repo.registrarPago({ clienteId: 'pannus', pagadorId: 'marca', fecha: '2026-11-05', montoArs: 100000 });

  const estado = estadoDeCuenta({ ...(await repo.cuenta('pannus')), hoy: '2026-11-20' });
  const [pagador] = estado.pagadores;
  assert.deepEqual(pagador.cargos.map((c) => [c.concepto ?? c.periodo, c.estado]), [['Saldo anterior', 'pagado'], ['2026-11', 'vencido']]);
  assert.equal(estado.totales.saldoArs, 235950);
});

test('Cambiar la cantidad de locales desde un mes no toca los meses anteriores', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(pannus);
  await repo.cambiarLocales('pannus', { desde: '2026-12', propios: 5 });
  const cantidad = async (periodo) => (await repo.liquidar({ periodo, mep: 1000 })).resultados[0].liquidaciones[0].renglones[0].cantidad;
  assert.deepEqual([await cantidad('2026-11'), await cantidad('2026-12')], [3, 5]);

  const cliente = await repo.borrarCambioLocales('pannus', '2026-12');
  assert.deepEqual(cliente.cambiosLocales, []);
  assert.equal(await cantidad('2026-12'), 3);
});

test('Avisa qué cierres están generados pero no pasaron a las cuentas corrientes', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(pannus);
  await repo.liquidar({ periodo: '2026-11', mep: 1000 });
  assert.deepEqual(await repo.cierresSinPasar(), [{ periodo: '2026-11', cambio: false, totalArs: 235950 }]);
  await repo.confirmarCierre('2026-11');
  assert.deepEqual(await repo.cierresSinPasar(), []);
  await repo.liquidar({ periodo: '2026-11', mep: 1100 });
  assert.deepEqual((await repo.cierresSinPasar()).map((c) => [c.periodo, c.cambio]), [['2026-11', true]]);
});

test('Un cliente que arranca más adelante aparece en el cierre sin cobrarle', async () => {
  const { repo } = repositorio();
  await repo.crearCliente({ ...pannus, acuerdos: [{ ...pannus.acuerdos[0], vigenciaDesde: '2027-01' }] });
  const cierre = await repo.liquidar({ periodo: '2026-11', mep: 1000 });
  assert.deepEqual(cierre.resultados.map((r) => [r.cliente.id, r.arranca, r.error, r.liquidaciones.length]), [['pannus', '2027-01', undefined, 0]]);
});

test('La facturación mes a mes junta lo importado, lo pasado a cuentas y lo generado', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(pannus);
  await repo.importarFacturacion('2026-09', {
    mep: 1524.6,
    renglones: [{ clienteId: 'pannus', clienteNombre: 'PANNUS', productoDux: 'P006', detalle: 'Servicio full', brutoArs: 198198, ivaArs: 41621.58, netoArs: 239819.58 }],
  });
  await repo.liquidar({ periodo: '2026-10', mep: 1549.8 });
  await repo.confirmarCierre('2026-10');
  await repo.cargarSaldoAnterior({ clienteId: 'pannus', fecha: '2026-08-10', montoArs: 5000 });
  await repo.liquidar({ periodo: '2026-11', mep: 1538 });

  const meses = await repo.facturacion();
  assert.deepEqual(meses.map((m) => [m.periodo, m.origen, m.mrrArs]), [['2026-09', 'excel', 198198], ['2026-10', 'cuentas', 302211], ['2026-11', 'cierre', 299910]]);
  await repo.borrarFacturacion('2026-09');
  assert.deepEqual((await repo.facturacion()).map((m) => m.periodo), ['2026-10', '2026-11']);
});

const quem = {
  id: 'quem',
  nombre: 'QUEM S.A.',
  locales: { propios: 12 },
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 45 }, comision: { delivery: 0.03 } }],
  extras: [],
};

test('Lo que se carga mes a mes en la cuenta de un cliente lo usa el cierre del mes siguiente', async () => {
  const { repo } = repositorio();
  await repo.crearCliente(quem);
  await repo.guardarVentas('2026-10', [{ cliente_id: 'otro', grupo: 'propios', periodo: '2026-10', canal: 'delivery', total_con_iva: 5 }]);
  await repo.guardarMesCliente('quem', '2026-10', { locales: { propios: 14 }, valores: { 'propios|delivery': 1500000 } });

  assert.deepEqual((await repo.ventasDeCliente('quem')).map((f) => [f.periodo, f.grupo, f.canal, f.total_con_iva]), [['2026-10', 'propios', 'delivery', 1500000]]);
  assert.equal((await repo.ventas('2026-10')).length, 2);
  const [renglonFee, renglonComision] = (await repo.liquidar({ periodo: '2026-11', mep: 1000 })).resultados[0].liquidaciones[0].renglones;
  // 14 locales desde octubre siguen en noviembre; la comisión es el 3% de lo vendido en octubre.
  assert.deepEqual([renglonFee.cantidad, renglonComision.brutoArs], [14, 45000]);

  // Volver a los 12 de antes saca el cambio; borrar el monto deja el mes sin cargar.
  const cliente = await repo.guardarMesCliente('quem', '2026-10', { locales: { propios: 12 }, valores: {} });
  assert.deepEqual(cliente.cambiosLocales, []);
  assert.deepEqual(await repo.ventasDeCliente('quem'), []);
});

// Una base con un poco de todo, como la de claude.ai: cliente, cierre pasado a cuentas, saldo
// anterior, pago, ventas, dólar e IPC cargados a mano y traídos.
async function baseConDatos() {
  const { repo, store } = repositorio();
  await repo.crearCliente(quem);
  await repo.cargarSaldoAnterior({ clienteId: 'quem', fecha: '2026-10-10', montoArs: 1057796.52, concepto: 'Factura de Octubre 2026 (F-03)' });
  await repo.guardarMesCliente('quem', '2026-10', { valores: { 'propios|delivery': 1500000 } });
  await repo.liquidar({ periodo: '2026-11', mep: 1538 });
  await repo.confirmarCierre('2026-11');
  await repo.registrarPago({ clienteId: 'quem', pagadorId: 'marca', fecha: '2026-10-09', montoArs: 500000, medio: 'Transferencia' });
  await repo.guardarMepManual('2026-10-01', 1538);
  await repo.guardarIpcManual('2026-09', 0.021);
  await store.set('cotizaciones/mep-dolarhoy', { valores: { '2026-10-07': 1544.4 }, detalle: { '2026-10-07': { venta: 1544.4, pedido: 'boton' } } });
  await store.set('cotizaciones/estado', { ultima: { pedido: 'boton', inicio: '2026-10-07T11:03:00.000Z', ok: true } });
  return { repo, store };
}

// Todo lo guardado, como JSON (la base de memoria guarda también los campos sin valor; las de verdad, no).
async function todo(store) {
  const listas = await Promise.all(COLECCIONES.map((c) => store.list(c)));
  const docs = COLECCIONES.flatMap((c, i) => listas[i].map(({ id, data }) => [`${c}/${id}`, data]));
  return JSON.parse(JSON.stringify(docs.sort(([a], [b]) => a.localeCompare(b))));
}

test('El respaldo lleva todo y se carga igual en una base vacía', async () => {
  const origen = await baseConDatos();
  const respaldo = JSON.parse(JSON.stringify(await origen.repo.respaldo()));
  const destino = repositorio();
  assert.deepEqual(await destino.repo.coleccionesConDatos(), []);

  const { cantidades } = await destino.repo.restaurarRespaldo(respaldo);
  assert.deepEqual(cantidades, { clientes: 1, ventas: 1, cierres: 1, cargos: 2, pagos: 1, facturacion: 0, cotizaciones: 3, parametros: 1 });
  assert.deepEqual(await todo(destino.store), await todo(origen.store));
  assert.deepEqual(await destino.repo.coleccionesConDatos(), ['clientes', 'ventas', 'cierres', 'cargos', 'pagos', 'parametros']);
});

test('El respaldo no se carga sobre otros datos, pero una carga cortada se puede terminar', async () => {
  const respaldo = await (await baseConDatos()).repo.respaldo();

  const otra = repositorio();
  await otra.repo.crearCliente(pannus);
  await assert.rejects(otra.repo.restaurarRespaldo(respaldo), /ya tiene otros datos \(clientes\)/);
  assert.deepEqual((await otra.repo.clientes()).map((c) => c.id), ['pannus']);

  const cortada = repositorio();
  const [primero] = respaldo.documentos.filter((d) => d.path.startsWith('clientes/'));
  await cortada.store.set(primero.path, primero.data);
  await cortada.repo.restaurarRespaldo(respaldo);
  assert.equal((await cortada.repo.cuentas()).cargos.length, 2);
});

test('Al cargar el respaldo se juntan el dólar y el IPC que la base nueva ya había traído', async () => {
  const respaldo = await (await baseConDatos()).repo.respaldo();
  const nueva = repositorio();
  const estadoNuevo = { ultima: { pedido: 'automatico', inicio: '2026-10-08T12:00:00.000Z', ok: true } };
  await nueva.store.set('cotizaciones/mep-dolarhoy', { valores: { '2026-10-08': 1560 }, detalle: { '2026-10-08': { venta: 1560, pedido: 'automatico' } } });
  await nueva.store.set('cotizaciones/estado', estadoNuevo);

  await nueva.repo.restaurarRespaldo(respaldo);
  const dolarhoy = await nueva.store.get('cotizaciones/mep-dolarhoy');
  assert.deepEqual(dolarhoy.valores, { '2026-10-07': 1544.4, '2026-10-08': 1560 });
  assert.deepEqual(Object.keys(dolarhoy.detalle), ['2026-10-07', '2026-10-08']);
  assert.deepEqual(await nueva.store.get('cotizaciones/estado'), estadoNuevo);
  assert.deepEqual((await nueva.store.get('cotizaciones/mep-manual')).valores, { '2026-10-01': 1538 });
});

test('Un archivo que no es un respaldo se rechaza sin tocar la base', async () => {
  const { repo, store } = repositorio();
  const con = (documentos) => ({ formato: 'deenex-cobranza/respaldo', version: 1, documentos });
  assert.throws(() => leerRespaldo({ clientes: [] }), /no es un respaldo de Deenex Cobranza/);
  assert.throws(() => leerRespaldo({ ...con([]), version: 2 }), /versión más nueva/);
  assert.throws(() => leerRespaldo(con([{ path: 'usuarios/joaco', data: {} }])), /no reconozco \(usuarios\/joaco\)/);
  assert.throws(() => leerRespaldo(con([{ path: 'clientes/..', data: {} }])), /no reconozco/);
  assert.throws(() => leerRespaldo(con([{ path: 'clientes/quem', data: [1] }])), /no reconozco/);
  await assert.rejects(repo.restaurarRespaldo(con([{ path: 'clientes/quem', data: quem }, { path: 'clientes', data: {} }])), /no reconozco/);
  assert.deepEqual(await todo(store), []);
});
