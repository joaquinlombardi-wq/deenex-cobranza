// Productos cargados en Dux, el sistema contable, como figuran en la hoja PRODUCTOS DUX del Excel de
// facturación (octubre 2026). El nombre es el exacto de Dux: es lo que el contador busca al facturar.
export const CATALOGO_DUX = [
  { codigo: '8', nombre: 'DESARROLLO A MEDIDA', disponiblePara: 'TODOS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '6', nombre: 'COMISION % DELIVERY', disponiblePara: 'TODOS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '2', nombre: 'REINTEGROS A CLIENTES', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P0005', nombre: 'SERVICIO DE HOSTING', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'DOLARES' },
  { codigo: 'P0008', nombre: 'CONSULTORIA - EXPERTO DEDICADO', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'DOLARES' },
  { codigo: '5', nombre: 'ANTICIPO ANDROID & IOS', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '9', nombre: 'IMPLEMENTACION', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P001', nombre: 'SUSCRIPCION - SISTEMA INTEGRADO AL POS', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P0020', nombre: 'SUSCRIPCION - MODULO EN LOCAL', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P004', nombre: 'SERVICIO DE SERVIDORES DEDICADOS', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P006', nombre: 'SUSCRIPCION - FULL PLAN (VENTAS & FIDELIZACION & MARKETING)', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '3', nombre: 'ANTICIPO MARTIN BUEN ROSTRO', disponiblePara: 'TODOS', ivaPct: 0, moneda: 'DOLARES' },
  { codigo: 'P0022', nombre: 'SUSCRIPCION - MODULO TAKE AWAY', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P0023', nombre: 'SUSCRIPCION - MODULO FIDELIZACION & MARKETING', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P0021', nombre: 'SUSCRIPCION - MODULO DELIVERY', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'P002', nombre: 'COMISION % - TRANSACCIONES DELIVERY Y TAKE AWAY', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'CLUBSOCIOS', nombre: 'COMISION 20% - INSCRIPCIONES CLUB DE SOCIOS', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: 'APPLAUNCH', nombre: 'LANZAMIENTO APP NATIVA - IOS & ANDROID', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '4', nombre: 'COBRO DE DELIVERY DE CONSUMIDORES', disponiblePara: 'VENTAS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '7', nombre: 'GRAFICAS', disponiblePara: 'TODOS', ivaPct: 0.21, moneda: 'PESOS' },
  { codigo: '11', nombre: 'HONORARIOS PROFESIONALES', disponiblePara: 'TODOS', ivaPct: 0.21, moneda: 'PESOS' },
];

export const productoDux = (codigo) => CATALOGO_DUX.find((p) => p.codigo === codigo) ?? null;

// Producto Dux de cada tipo de renglón (mapeo usado en la facturación mensual).
const CODIGO_POR_TIPO = {
  feePorLocal: 'P006',
  feeFijo: 'P006',
  comision: 'P002',
  hosting: 'P0005',
  servidores: 'P004',
  desarrollo: '8',
  implementacion: '9',
  lanzamientoApp: 'APPLAUNCH',
  consultoria: 'P0008',
  graficas: '7',
  reintegro: '2',
};

export const PRODUCTOS_DUX = Object.fromEntries(
  Object.entries(CODIGO_POR_TIPO).map(([tipo, codigo]) => [tipo, { codigo, nombre: productoDux(codigo).nombre }]),
);
