// Clientes reales tal como se facturaron en octubre 2026 (versión final emitida, MEP venta 1.549,80).

const locales = (prefijo, n, alta = '2025-01-01') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefijo}-${i + 1}`, nombre: `${prefijo} ${i + 1}`, tipo: 'propio', alta }));

export const MEP_OCTUBRE = 1549.8;

export const laFabrica = {
  id: 'la-fabrica',
  nombre: 'LA FÁBRICA (NAGYMAROS)',
  quienPaga: 'marca',
  locales: locales('fabrica', 86),
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 60 } }],
  extras: [
    { concepto: 'Infraestructura cloud', tipo: 'hosting', monto: 75, moneda: 'USD' },
    { concepto: 'Devoluciones de pedidos pendientes', tipo: 'reintegro', monto: 6900, moneda: 'ARS', conIva: false, desde: '2026-10', hasta: '2026-10' },
  ],
};

export const meetAndEat = {
  id: 'meet-and-eat',
  nombre: 'MEET & EAT',
  quienPaga: 'marca',
  locales: [],
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD' }],
  extras: [{ concepto: 'Servidores cloud', tipo: 'servidores', monto: 150, moneda: 'USD' }],
};

export const quem = {
  id: 'quem',
  nombre: 'QUEM S.A.',
  quienPaga: 'marca',
  locales: locales('quem', 12),
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 45 }, comision: { delivery: 0.03 } }],
  extras: [],
};

// Delivery de septiembre: $ 1.244.000 en total entre los 12 locales.
export const ventasQuemSeptiembre = quem.locales.map((l, i) => ({
  local_id: l.id,
  periodo: '2026-09',
  canal: 'delivery',
  total_con_iva: i === 0 ? 144000 : 100000,
  cantidad_pedidos: 50,
}));

export const quemCentral = {
  id: 'quem-central',
  nombre: 'QUEM S.A. (Central / Distribuidora)',
  quienPaga: 'marca',
  locales: [],
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 420, detalle: 'Fee mensual SaaS - QUEM Central / Distribuidora' } }],
  extras: [],
};

export const konex = {
  id: 'konex',
  nombre: 'KONEX',
  quienPaga: 'marca',
  locales: [],
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 650, detalle: 'Plan full' } }],
  extras: [{ concepto: 'Cuota desarrollo a medida', tipo: 'desarrollo', monto: 500, moneda: 'USD', cuotas: { total: 6, primera: '2026-06' } }],
};

export const pannus = {
  id: 'pannus',
  nombre: 'PANNUS',
  quienPaga: 'marca',
  locales: locales('pannus', 3),
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 65 } }],
  extras: [],
};
