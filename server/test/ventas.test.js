import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarVentas } from '../src/engine/ventas.js';

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
