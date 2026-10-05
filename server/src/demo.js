// Clientes de ejemplo para el modo demo: los reales de octubre 2026 y una marca con franquicias inventada.
import * as octubre from '../test/casos-octubre-2026.js';

export function documentosDemo() {
  const marcaDemo = {
    id: 'sushi-demo',
    nombre: 'Sushi Demo (franquicias, ejemplo)',
    razonSocial: 'Sushi Demo S.A.',
    cuit: '30-71234567-8',
    condicionIva: 'Responsable Inscripto',
    contacto: { nombre: 'Administración', email: 'admin@sushidemo.com' },
    quienPaga: 'franquiciados',
    franquiciados: [
      { id: 'f-norte', razonSocial: 'Gastronomía Norte SRL', cuit: '30-70000001-1', condicionIva: 'Responsable Inscripto', contacto: { email: 'norte@ejemplo.com' } },
      { id: 'f-sur', razonSocial: 'Sur Foods SAS', cuit: '30-70000002-2', condicionIva: 'Responsable Inscripto', contacto: { email: 'sur@ejemplo.com' } },
    ],
    locales: [
      { id: 'sd-palermo', nombre: 'Palermo', tipo: 'propio', alta: '2025-03-01' },
      { id: 'sd-belgrano', nombre: 'Belgrano', tipo: 'propio', alta: '2025-03-01' },
      { id: 'sd-olivos', nombre: 'Olivos', tipo: 'franquiciado', franquiciadoId: 'f-norte', alta: '2025-06-01' },
      { id: 'sd-martinez', nombre: 'Martínez', tipo: 'franquiciado', franquiciadoId: 'f-norte', alta: '2025-06-01' },
      { id: 'sd-quilmes', nombre: 'Quilmes', tipo: 'franquiciado', franquiciadoId: 'f-sur', alta: '2026-10-15' },
    ],
    acuerdos: [
      {
        vigenciaDesde: '2025-03',
        moneda: 'USD',
        feePorLocal: { precio: 55, precioPropio: 50 },
        comision: { delivery: 0.02, takeaway: 0.01 },
        combinacion: { modo: 'suma' },
        prorrateo: { modo: 'proporcional' },
      },
    ],
    extras: [{ concepto: 'Infraestructura cloud', tipo: 'hosting', monto: 80, moneda: 'USD' }],
  };

  const ventasDemo = ['sd-palermo', 'sd-belgrano', 'sd-olivos', 'sd-martinez'].flatMap((id, i) => [
    { local_id: id, periodo: '2026-10', canal: 'delivery', total_con_iva: 2500000 + i * 300000, cantidad_pedidos: 400 },
    { local_id: id, periodo: '2026-10', canal: 'takeaway', total_con_iva: 1200000 + i * 100000, cantidad_pedidos: 250 },
  ]);
  const ventasQuemOctubre = octubre.ventasQuemSeptiembre.map((v) => ({ ...v, periodo: '2026-10', total_con_iva: v.total_con_iva * 1.1 }));

  const clientes = [octubre.laFabrica, octubre.meetAndEat, octubre.quem, octubre.quemCentral, octubre.konex, octubre.pannus, marcaDemo];
  const ventas = [...octubre.ventasQuemSeptiembre, ...ventasQuemOctubre, ...ventasDemo];
  const periodos = [...new Set(ventas.map((v) => v.periodo))];
  return [
    ...clientes.map((c) => ({ path: `clientes/${c.id}`, data: c })),
    ...periodos.map((p) => ({ path: `ventas/${p}`, data: { periodo: p, filas: ventas.filter((v) => v.periodo === p) } })),
  ];
}
