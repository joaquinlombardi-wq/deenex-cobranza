// Clientes reales tal como se facturaron en octubre 2026 (versión final emitida, MEP venta 1.549,80).

export const MEP_OCTUBRE = 1549.8;

export const laFabrica = {
  id: 'la-fabrica',
  nombre: 'LA FÁBRICA (NAGYMAROS)',
  quienPaga: 'marca',
  locales: { propios: 86 },
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
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD' }],
  extras: [{ concepto: 'Servidores cloud', tipo: 'servidores', monto: 150, moneda: 'USD' }],
};

export const quem = {
  id: 'quem',
  nombre: 'QUEM S.A.',
  quienPaga: 'marca',
  locales: { propios: 12 },
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 45 }, comision: { delivery: 0.03 } }],
  extras: [],
};

// Delivery de septiembre de los 12 locales propios: $ 1.244.000 en total.
export const ventasQuemSeptiembre = [
  { cliente_id: 'quem', grupo: 'propios', periodo: '2026-09', canal: 'delivery', total_con_iva: 1244000 },
];

export const quemCentral = {
  id: 'quem-central',
  nombre: 'QUEM S.A. (Central / Distribuidora)',
  quienPaga: 'marca',
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 420, detalle: 'Fee mensual SaaS - QUEM Central / Distribuidora' } }],
  extras: [],
};

export const konex = {
  id: 'konex',
  nombre: 'KONEX',
  quienPaga: 'marca',
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feeFijo: { monto: 650, detalle: 'Plan full' } }],
  extras: [{ concepto: 'Cuota desarrollo a medida', tipo: 'desarrollo', monto: 500, moneda: 'USD', cuotas: { total: 6, primera: '2026-06' } }],
};

export const pannus = {
  id: 'pannus',
  nombre: 'PANNUS',
  quienPaga: 'marca',
  locales: { propios: 3 },
  acuerdos: [{ vigenciaDesde: '2025-01', moneda: 'USD', feePorLocal: { precio: 65 } }],
  extras: [],
};
