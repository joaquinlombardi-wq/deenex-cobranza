import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarVentas, ventasPorGrupo, reemplazarVentasCliente, casillerosDeVentas } from '../src/engine/ventas.js';
import { normalizarCliente } from '../src/engine/clientes.js';

const venta = (grupo, total, canal = 'delivery', cliente_id = 'marca-x') => ({ cliente_id, grupo, periodo: '2026-09', canal, total_con_iva: total });
const resumen = (filas) => filas.map((v) => `${v.cliente_id}|${v.grupo}|${v.canal}=${v.total_con_iva}`).sort();

test('Una fila nueva reemplaza a la del mismo cliente, grupo y canal', () => {
  const filas = combinarVentas([venta('propios', 1), venta('propios', 2, 'takeaway')], [venta('propios', 5)]);
  assert.deepEqual(resumen(filas), ['marca-x|propios|delivery=5', 'marca-x|propios|takeaway=2']);
});

test('El total de todos los locales y los de propios y franquiciados se reemplazan entre sí', () => {
  const separadas = [venta('propios', 300), venta('franquiciados', 700), venta('f1', 50), venta('propios', 9, 'delivery', 'otra')];
  assert.deepEqual(resumen(combinarVentas(separadas, [venta('todos', 1000)])), ['marca-x|f1|delivery=50', 'marca-x|todos|delivery=1000', 'otra|propios|delivery=9']);
  const total = [venta('todos', 1000), venta('todos', 80, 'takeaway')];
  assert.deepEqual(resumen(combinarVentas(total, [venta('propios', 300), venta('franquiciados', 700)])), [
    'marca-x|franquiciados|delivery=700',
    'marca-x|propios|delivery=300',
    'marca-x|todos|takeaway=80',
  ]);
});

// QUEM cobra 3% del delivery de sus locales propios; la marca X cobra lo mismo a propios y franquiciados.
const grupoQuem = [{ id: 'propios', pagador: 'marca', tasas: { delivery: 0.03 }, miembros: ['propios'] }];
const grupoTodos = [{ id: 'todos', pagador: 'marca', tasas: { delivery: 0.02, takeaway: 0.01 }, miembros: ['propios', 'franquiciados'] }];

test('Lo cargado de un cliente se lee por grupo y canal; el total sale de sus partes si llegaron separadas', () => {
  const filas = [venta('propios', 300), venta('franquiciados', 700), venta('propios', 50, 'takeaway'), venta('propios', 9, 'delivery', 'otra')];
  assert.deepEqual(ventasPorGrupo(filas, 'marca-x', grupoTodos), { 'todos|delivery': 1000 });
  assert.deepEqual(ventasPorGrupo([venta('propios', 1244000, 'delivery', 'quem')], 'quem', grupoQuem), { 'propios|delivery': 1244000 });
});

test('Guardar las ventas de un cliente reemplaza solo lo suyo y solo los canales que cobra', () => {
  const filas = [venta('propios', 300), venta('franquiciados', 700), venta('propios', 9, 'delivery', 'otra'), venta('f9', 5)];
  const nuevas = reemplazarVentasCliente(filas, { clienteId: 'marca-x', periodo: '2026-09', grupos: grupoTodos, valores: { 'todos|delivery': '1500', 'todos|takeaway': '' } });
  assert.deepEqual(resumen(nuevas), ['marca-x|f9|delivery=5', 'marca-x|todos|delivery=1500', 'otra|propios|delivery=9']);
  // Borrar el monto deja ese canal sin cargar.
  assert.deepEqual(resumen(reemplazarVentasCliente(nuevas, { clienteId: 'marca-x', periodo: '2026-09', grupos: grupoTodos, valores: {} })), ['marca-x|f9|delivery=5', 'otra|propios|delivery=9']);
});

test('Cada mes pide las ventas de los canales que cobra, con el acuerdo y los locales de ese mes', () => {
  // QUEM cobra 3% del delivery desde 2025 y pasa a cobrar también 1% del take away en diciembre.
  const quem = normalizarCliente({
    id: 'quem',
    nombre: 'QUEM S.A.',
    locales: { propios: 12 },
    cambiosLocales: [{ desde: '2026-11', propios: 14 }],
    acuerdos: [
      { vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 45 }, comision: { delivery: 0.03 } },
      { vigenciaDesde: '2026-12', moneda: 'USD', feePorLocal: { precio: 45 }, comision: { delivery: 0.03, takeaway: 0.01 } },
    ],
  });
  const filas = [venta('propios', 1400000, 'delivery', 'quem'), { ...venta('propios', 5, 'delivery', 'quem'), periodo: '2026-08' }];
  const casilla = (c) => `${c.grupo}|${c.canal}|${c.tasa}|${c.locales}=${c.monto}`;
  assert.deepEqual(casillerosDeVentas(quem, '2026-09', filas).map(casilla), ['propios|delivery|0.03|12=1400000']);
  assert.deepEqual(casillerosDeVentas(quem, '2026-11', []).map(casilla), ['propios|delivery|0.03|14=null']);
  assert.deepEqual(casillerosDeVentas(quem, '2026-12', []).map(casilla), ['propios|delivery|0.03|14=null', 'propios|takeaway|0.01|14=null']);
  // Sin comisión no pide nada.
  assert.deepEqual(casillerosDeVentas(normalizarCliente({ id: 'k', nombre: 'KONEX', acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 650 } }] }), '2026-10', []), []);
});

test('Si la marca paga propios y franquiciados con las mismas tasas se pide un total, que también sale de sus partes', () => {
  const marca = normalizarCliente({
    id: 'marca-x',
    nombre: 'MARCA X',
    tieneFranquiciados: true,
    locales: { propios: 2, franquiciados: 3 },
    acuerdos: [{ vigenciaDesde: '2026-01', moneda: 'ARS', comision: { delivery: 0.02 } }],
  });
  const separadas = [venta('propios', 300), venta('franquiciados', 700)];
  assert.deepEqual(casillerosDeVentas(marca, '2026-09', separadas).map((c) => [c.grupo, c.locales, c.monto]), [['todos', 5, 1000]]);
});
