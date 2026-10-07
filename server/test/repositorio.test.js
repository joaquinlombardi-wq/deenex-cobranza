import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDocumentosMemoria } from '../src/store/documentos.js';
import { estadoDeCuenta } from '../src/engine/cuentaCorriente.js';
import { crearRepositorio } from '../../client/src/backend/repositorio.js';

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
