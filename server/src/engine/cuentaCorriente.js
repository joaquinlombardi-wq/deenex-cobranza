import { D } from './dinero.js';
import { diasDelMes } from './periodos.js';

// Cuenta corriente de cada pagador: los cargos salen de los cierres confirmados y los pagos
// se imputan en orden (el más viejo primero), como en una cuenta corriente común.

const CENTAVO = D('0.005');

export function vencimientoDe(periodo, dia = 10) {
  const ultimo = diasDelMes(periodo);
  return `${periodo}-${String(Math.min(Math.max(1, Number(dia) || 10), ultimo)).padStart(2, '0')}`;
}

const menor = (a, b) => (a.lt(b) ? a : b);

const porVencimiento = (a, b) =>
  a.vencimiento.localeCompare(b.vencimiento) || a.periodo.localeCompare(b.periodo);
const porFecha = (a, b) =>
  a.fecha.localeCompare(b.fecha) || String(a.registradoEn ?? '').localeCompare(String(b.registradoEn ?? ''));

function cuentaDePagador(cargos, pagos, hoy) {
  const ordenados = [...cargos].sort(porVencimiento).map((c) => ({ ...c, pagado: D(0), pagadoEl: null }));
  const pagosOrdenados = [...pagos].sort(porFecha);

  let sinImputar = D(0);
  for (const pago of pagosOrdenados) {
    let resto = D(pago.montoArs);
    for (const cargo of ordenados) {
      if (resto.lte(0)) break;
      const saldo = D(cargo.montoArs).minus(cargo.pagado);
      if (saldo.lte(CENTAVO)) continue;
      const aplicado = menor(saldo, resto);
      cargo.pagado = cargo.pagado.plus(aplicado);
      resto = resto.minus(aplicado);
      if (D(cargo.montoArs).minus(cargo.pagado).lte(CENTAVO)) cargo.pagadoEl = pago.fecha;
    }
    sinImputar = sinImputar.plus(resto);
  }

  let vencido = D(0);
  const filas = ordenados.map(({ pagado: pagadoCargo, ...c }) => {
    const saldo = D(c.montoArs).minus(pagadoCargo);
    let estado;
    if (saldo.lte(CENTAVO)) estado = 'pagado';
    else if (c.vencimiento < hoy) estado = 'vencido';
    else if (pagadoCargo.gt(0)) estado = 'parcial';
    else estado = 'pendiente';
    if (estado === 'vencido') vencido = vencido.plus(saldo);
    return {
      ...c,
      pagadoArs: pagadoCargo.toDecimalPlaces(2).toNumber(),
      saldoArs: saldo.lte(CENTAVO) ? 0 : saldo.toDecimalPlaces(2).toNumber(),
      estado,
    };
  });

  const cargado = ordenados.reduce((s, c) => s.plus(c.montoArs), D(0));
  const pagado = pagosOrdenados.reduce((s, p) => s.plus(p.montoArs), D(0));
  const saldo = cargado.minus(pagado);
  return {
    cargos: filas,
    pagos: pagosOrdenados,
    totales: {
      cargadoArs: cargado.toNumber(),
      pagadoArs: pagado.toNumber(),
      saldoArs: saldo.toDecimalPlaces(2).toNumber(), // negativo = saldo a favor del cliente
      vencidoArs: vencido.toDecimalPlaces(2).toNumber(),
      aFavorArs: sinImputar.toDecimalPlaces(2).toNumber(),
    },
  };
}

function estadoGeneral(totales, hayMovimientos) {
  if (!hayMovimientos) return 'sin-movimientos';
  if (totales.vencidoArs > 0) return 'vencido';
  if (totales.saldoArs > 0.005) return 'pendiente';
  return 'al-dia';
}

/**
 * Estado de cuenta de un cliente (o de varios: agrupa por cliente y pagador).
 *
 * @param cargos [{ clienteId, pagadorId, pagadorNombre, periodo, vencimiento, montoArs, ... }]
 * @param pagos  [{ clienteId, pagadorId, fecha, montoArs, ... }]
 * @param hoy    'AAAA-MM-DD'
 */
export function estadoDeCuenta({ cargos = [], pagos = [], hoy }) {
  const grupos = new Map();
  const grupo = (clienteId, pagadorId) => {
    const k = `${clienteId}|${pagadorId}`;
    if (!grupos.has(k)) grupos.set(k, { clienteId, pagadorId, cargos: [], pagos: [] });
    return grupos.get(k);
  };
  for (const c of cargos) grupo(c.clienteId, c.pagadorId).cargos.push(c);
  for (const p of pagos) grupo(p.clienteId, p.pagadorId).pagos.push(p);

  const pagadores = [...grupos.values()].map((g) => {
    const cuenta = cuentaDePagador(g.cargos, g.pagos, hoy);
    const ultimoCargo = [...g.cargos].sort(porVencimiento).at(-1);
    return {
      clienteId: g.clienteId,
      pagadorId: g.pagadorId,
      pagadorNombre: ultimoCargo?.pagadorNombre ?? g.pagos.at(-1)?.pagadorNombre ?? g.pagadorId,
      pagadorTipo: ultimoCargo?.pagadorTipo ?? (g.pagadorId === 'marca' ? 'marca' : 'franquiciado'),
      cuit: ultimoCargo?.cuit,
      ...cuenta,
      estado: estadoGeneral(cuenta.totales, g.cargos.length + g.pagos.length > 0),
    };
  });

  const suma = (campo) => pagadores.reduce((s, p) => s.plus(p.totales[campo]), D(0)).toNumber();
  const totales = {
    cargadoArs: suma('cargadoArs'),
    pagadoArs: suma('pagadoArs'),
    saldoArs: suma('saldoArs'),
    vencidoArs: suma('vencidoArs'),
  };
  const ultimoPago = [...pagos].sort(porFecha).at(-1) ?? null;
  return { pagadores, totales, ultimoPago, estado: estadoGeneral(totales, cargos.length + pagos.length > 0) };
}
