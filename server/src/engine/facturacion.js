import { D } from './dinero.js';
import { compararPeriodos } from './periodos.js';

// Análisis de lo que factura Deenex mes a mes: cuánto es MRR (lo que se cobra todos los meses:
// abonos, comisiones e infraestructura) y cuánto son extra jobs (trabajos puntuales). Los montos
// son en pesos y sin IVA.

export const CATEGORIAS = [
  { id: 'abonos', nombre: 'Abonos', mrr: true },
  { id: 'comisiones', nombre: 'Comisiones', mrr: true },
  { id: 'infraestructura', nombre: 'Infraestructura', mrr: true },
  { id: 'extras', nombre: 'Extra jobs', mrr: false },
  { id: 'reintegros', nombre: 'Reintegros y ajustes', mrr: false },
];

const POR_TIPO = {
  feePorLocal: 'abonos',
  feeFijo: 'abonos',
  comision: 'comisiones',
  hosting: 'infraestructura',
  servidores: 'infraestructura',
  desarrollo: 'extras',
  implementacion: 'extras',
  lanzamientoApp: 'extras',
  consultoria: 'extras',
  graficas: 'extras',
  reintegro: 'reintegros',
};

// Productos Dux de la planilla del contador, para los meses importados del Excel.
const POR_CODIGO_DUX = {
  P006: 'abonos', P001: 'abonos', P0020: 'abonos', P0021: 'abonos', P0022: 'abonos', P0023: 'abonos',
  P002: 'comisiones', 6: 'comisiones', 4: 'comisiones', CLUBSOCIOS: 'comisiones',
  P0005: 'infraestructura', P004: 'infraestructura',
  8: 'extras', 9: 'extras', 5: 'extras', 3: 'extras', 7: 'extras', 11: 'extras', P0008: 'extras', APPLAUNCH: 'extras',
  2: 'reintegros',
};

// Lo que no se reconoce cuenta como extra: el MRR suma solo lo que seguro se repite.
export function categoriaDe(renglon) {
  return POR_TIPO[renglon.tipo] ?? POR_CODIGO_DUX[String(renglon.productoDux ?? '').trim().toUpperCase()] ?? 'extras';
}

/**
 * Lo facturado en cada mes, de la mejor fuente que haya: lo pasado a cuentas corrientes, si no lo
 * importado del Excel del contador y si no el cierre generado que todavía no se pasó.
 *
 * @param cargos     cargos de las cuentas corrientes (los saldos anteriores no son facturación del mes)
 * @param cierres    cierres guardados: { periodo, mep, resultados }
 * @param importados meses importados del Excel: { periodo, mep, renglones: [{ clienteId, clienteNombre, ... }] }
 */
export function mesesFacturados({ cargos = [], cierres = [], importados = [] }) {
  const meses = new Map();
  const mes = (periodo, origen, mep) => {
    if (!meses.has(periodo)) meses.set(periodo, { periodo, origen, mep: mep ?? null, items: [] });
    return meses.get(periodo);
  };

  for (const c of cargos) {
    if (c.tipo === 'saldoAnterior' || !c.periodo) continue;
    const m = mes(c.periodo, 'cuentas', c.mep);
    m.mep ??= c.mep ?? null;
    m.items.push({ clienteId: c.clienteId, clienteNombre: c.clienteNombre, renglones: c.renglones ?? [] });
  }
  const conCuentas = new Set(meses.keys());
  for (const f of importados) {
    if (conCuentas.has(f.periodo)) continue;
    const m = mes(f.periodo, 'excel', f.mep);
    for (const r of f.renglones ?? []) m.items.push({ clienteId: r.clienteId, clienteNombre: r.clienteNombre, renglones: [r] });
  }
  for (const c of cierres) {
    if (meses.has(c.periodo)) continue;
    const m = mes(c.periodo, 'cierre', c.mep);
    for (const r of c.resultados ?? []) {
      for (const l of r.liquidaciones ?? []) m.items.push({ clienteId: r.cliente.id, clienteNombre: r.cliente.nombre, renglones: l.renglones });
    }
  }
  return [...meses.values()].sort((a, b) => compararPeriodos(a.periodo, b.periodo));
}

const centavos = (v) => v.toDecimalPlaces(2).toNumber();
const enCero = () => Object.fromEntries(CATEGORIAS.map((c) => [c.id, D(0)]));

function totales(porCategoria) {
  const mrr = CATEGORIAS.filter((c) => c.mrr).reduce((s, c) => s.plus(porCategoria[c.id]), D(0));
  const total = CATEGORIAS.reduce((s, c) => s.plus(porCategoria[c.id]), D(0));
  return {
    mrrArs: centavos(mrr),
    extrasArs: centavos(porCategoria.extras),
    reintegrosArs: centavos(porCategoria.reintegros),
    totalArs: centavos(total),
  };
}

// Un mes: cuánto de cada categoría, MRR, extras, total sin IVA y con IVA, y lo mismo por cliente.
export function resumirMes({ periodo, origen, mep, items }) {
  const porCategoria = enCero();
  const porCliente = new Map();
  let neto = D(0);
  for (const item of items) {
    const cliente = porCliente.get(item.clienteId) ?? { clienteId: item.clienteId, clienteNombre: item.clienteNombre, categorias: enCero() };
    for (const r of item.renglones) {
      const categoria = categoriaDe(r);
      porCategoria[categoria] = porCategoria[categoria].plus(r.brutoArs ?? 0);
      cliente.categorias[categoria] = cliente.categorias[categoria].plus(r.brutoArs ?? 0);
      neto = neto.plus(r.netoArs ?? r.brutoArs ?? 0);
    }
    porCliente.set(item.clienteId, cliente);
  }
  return {
    periodo,
    origen,
    mep,
    categorias: Object.fromEntries(CATEGORIAS.map((c) => [c.id, centavos(porCategoria[c.id])])),
    ...totales(porCategoria),
    netoArs: centavos(neto),
    clientes: [...porCliente.values()]
      .map((c) => ({ clienteId: c.clienteId, clienteNombre: c.clienteNombre, ...totales(c.categorias) }))
      .sort((a, b) => b.totalArs - a.totalArs || a.clienteNombre.localeCompare(b.clienteNombre)),
  };
}

export const resumenFacturacion = (fuentes) => mesesFacturados(fuentes).map(resumirMes);
