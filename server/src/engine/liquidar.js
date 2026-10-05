import { D, redondear, IVA_GENERAL } from './dinero.js';
import { periodoAnterior, compararPeriodos } from './periodos.js';
import { PRODUCTOS_DUX } from './productosDux.js';
import { normalizarCliente, gruposDeLocales, gruposDeVentas } from './clientes.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function nombrePeriodo(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

const formatoArs = (v) =>
  '$ ' + D(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// 45 -> '45', 45.5 -> '45,50'
const montoCorto = (v) => (D(v).isInteger() ? D(v).toString() : D(v).toFixed(2).replace('.', ','));

const pct = (v) => `${D(v).times(100).toString().replace('.', ',')}%`;

export class ErrorLiquidacion extends Error {}

// El acuerdo vigente en un periodo es el último cuya vigencia empezó en o antes de ese mes.
export function acuerdoVigente(cliente, periodo) {
  return [...(cliente.acuerdos ?? [])]
    .filter((a) => compararPeriodos(a.vigenciaDesde, periodo) <= 0)
    .sort((a, b) => compararPeriodos(b.vigenciaDesde, a.vigenciaDesde))[0];
}

// Factor de ajuste por IPC acumulado desde el mes base. Para liquidar el mes M se usa el
// último IPC publicado, que es el de M-2.
function factorIpc(acuerdo, periodo, ipc) {
  const ajuste = acuerdo.ajusteIpc;
  if (acuerdo.moneda !== 'ARS' || !ajuste?.activo) return null;
  const pasos = [];
  for (let p = periodo; compararPeriodos(p, ajuste.mesBase) > 0; p = periodoAnterior(p)) {
    const mesIpc = periodoAnterior(p, 2);
    if (ipc?.[mesIpc] === undefined) {
      throw new ErrorLiquidacion(`Falta el IPC de ${nombrePeriodo(mesIpc)} para ajustar el acuerdo en pesos.`);
    }
    pasos.unshift(D(ipc[mesIpc]));
  }
  return pasos;
}

// Aplica los ajustes de IPC mes a mes, redondeando cada mes como se haría a mano.
function ajustarMonto(monto, pasosIpc) {
  if (!pasosIpc) return D(monto);
  return pasosIpc.reduce((m, i) => redondear(m.times(D(1).plus(i))), D(monto));
}

function datosPagador(cliente, idPagador) {
  if (idPagador === 'marca') {
    const { razonSocial, cuit, condicionIva, contacto } = cliente;
    return { tipo: 'marca', id: 'marca', nombre: cliente.nombre, razonSocial, cuit, condicionIva, contacto };
  }
  const f = (cliente.franquiciados ?? []).find((x) => x.id === idPagador);
  if (!f) throw new ErrorLiquidacion(`El franquiciado "${idPagador}" no está cargado en ${cliente.nombre}.`);
  return { tipo: 'franquiciado', id: f.id, nombre: f.razonSocial, ...f };
}

function renglon({ tipo, detalle, cantidad, moneda, precioUnitario, mep, conIva = true }) {
  const cotizacion = moneda === 'USD' ? D(mep) : D(1);
  const bruto = redondear(D(cantidad).times(precioUnitario).times(cotizacion));
  const ivaPct = conIva ? IVA_GENERAL : D(0);
  const iva = redondear(bruto.times(ivaPct));
  const producto = PRODUCTOS_DUX[tipo] ?? { codigo: null, nombre: null };
  return {
    tipo,
    productoDux: producto.codigo,
    productoDuxNombre: producto.nombre,
    detalle,
    cantidad: Number(cantidad),
    moneda,
    precioUnitario: D(precioUnitario).toNumber(),
    brutoArs: bruto.toNumber(),
    ivaPct: ivaPct.toNumber(),
    ivaArs: iva.toNumber(),
    netoArs: bruto.plus(iva).toNumber(),
  };
}

const sumar = (renglones, campo) => renglones.reduce((s, r) => s.plus(r[campo]), D(0));

// Fee por local: cantidad de locales de cada grupo x su precio. Los grupos de un mismo pagador
// con el mismo precio van en un solo renglón.
function renglonesFeePorLocal(cliente, acuerdo, periodo, contexto) {
  const fee = acuerdo.feePorLocal;
  if (!fee) return [];
  const juntos = new Map();
  for (const g of gruposDeLocales(cliente)) {
    const base = g.franquicia ? fee.precioFranquiciado ?? fee.precio : fee.precio;
    if (base == null) throw new ErrorLiquidacion(`Falta el precio por local de ${cliente.nombre}.`);
    const precio = ajustarMonto(base, contexto.pasosIpc);
    const clave = `${g.pagador}|${precio}`;
    const x = juntos.get(clave) ?? { pagador: g.pagador, precio, cantidad: 0, tipos: new Set() };
    x.cantidad += g.locales;
    x.tipos.add(g.franquicia ? 'franquiciado' : 'propio');
    juntos.set(clave, x);
  }

  const moneda = acuerdo.moneda;
  const grupos = [...juntos.values()];
  return grupos.map((g) => {
    // Si la marca paga propios y franquiciados a precios distintos, el renglón dice cuál es cuál.
    const separa = g.tipos.size === 1 && grupos.filter((o) => o.pagador === g.pagador).length > 1;
    const que = g.cantidad === 1 ? 'local' : 'locales';
    const tipo = separa ? ` ${[...g.tipos][0]}${g.cantidad === 1 ? '' : 's'}` : '';
    return {
      pagador: g.pagador,
      renglon: renglon({
        tipo: 'feePorLocal',
        detalle: `Servicio full - ${g.cantidad} ${que}${tipo} x ${moneda} ${montoCorto(g.precio)} - ${nombrePeriodo(periodo)}`,
        cantidad: g.cantidad,
        moneda,
        precioUnitario: g.precio,
        mep: contexto.mep,
      }),
    };
  });
}

function renglonesFeeFijo(acuerdo, periodo, contexto) {
  const fijo = acuerdo.feeFijo;
  if (!fijo) return [];
  return [
    {
      pagador: 'marca',
      renglon: renglon({
        tipo: 'feeFijo',
        detalle: `${fijo.detalle ?? 'Fee mensual SaaS'} - ${nombrePeriodo(periodo)}`,
        cantidad: 1,
        moneda: acuerdo.moneda,
        precioUnitario: ajustarMonto(fijo.monto, contexto.pasosIpc),
        mep: contexto.mep,
      }),
    },
  ];
}

const CANALES = ['delivery', 'takeaway'];

// Ventas de un grupo en un canal: su fila, o la suma de las de sus partes si propios y
// franquiciados se cobran juntos pero llegaron por separado.
function ventasDeGrupo(filas, grupo, canal) {
  const de = (id) => filas.find((v) => v.grupo === id && v.canal === canal);
  const total = de(grupo.id);
  if (total) return D(total.total_con_iva);
  if (grupo.miembros.length < 2) return null;
  const partes = grupo.miembros.map(de);
  return partes.every(Boolean) ? partes.reduce((s, p) => s.plus(p.total_con_iva), D(0)) : null;
}

// Comisión mes vencido: se cobra en M sobre las ventas de M-1 (total con IVA, sin envío).
// Las ventas llegan por cliente y grupo de locales: { cliente_id, grupo, periodo, canal, total_con_iva }.
function renglonesComision(cliente, periodo, ventas, avisos) {
  const periodoVentas = periodoAnterior(periodo);
  const acuerdo = acuerdoVigente(cliente, periodoVentas);
  if (!acuerdo?.comision) return [];

  const filas = (ventas ?? []).filter((v) => v.periodo === periodoVentas && v.cliente_id === cliente.id);
  const bases = new Map();
  for (const g of gruposDeVentas(cliente, acuerdo)) {
    for (const canal of CANALES) {
      const tasa = g.tasas[canal];
      if (tasa == null) continue;
      const total = ventasDeGrupo(filas, g, canal);
      if (!total) {
        avisos.push(`Faltan las ventas de ${canal} de ${nombrePeriodo(periodoVentas)} de ${g.nombre}.`);
        continue;
      }
      const clave = `${g.pagador}|${canal}|${tasa}`;
      const x = bases.get(clave) ?? { pagador: g.pagador, canal, tasa, base: D(0) };
      x.base = x.base.plus(total);
      bases.set(clave, x);
    }
  }

  return [...bases.values()].map(({ pagador, canal, tasa, base }) => ({
    pagador,
    renglon: renglon({
      tipo: 'comision',
      detalle: `Comisión ${pct(tasa)} ${canal} - ventas ${nombrePeriodo(periodoVentas)} (${formatoArs(base)})`,
      cantidad: 1,
      moneda: 'ARS',
      precioUnitario: redondear(base.times(tasa)),
    }),
  }));
}

// Cómo se combinan fee y comisión de un mismo pagador cuando el acuerdo es híbrido.
function combinarHibrido(acuerdo, renglones, contexto) {
  const regla = acuerdo.combinacion ?? { modo: 'suma' };
  const fees = renglones.filter((r) => r.tipo === 'feePorLocal' || r.tipo === 'feeFijo');
  const comisiones = renglones.filter((r) => r.tipo === 'comision');
  const resto = renglones.filter((r) => !fees.includes(r) && !comisiones.includes(r));
  if (regla.modo === 'suma' || !fees.length || !comisiones.length) return renglones;

  if (regla.modo === 'mayor') {
    const ganan = sumar(comisiones, 'brutoArs').gt(sumar(fees, 'brutoArs')) ? comisiones : fees;
    return [...ganan, ...resto];
  }

  if (regla.modo === 'tope') {
    const topeArs = redondear(D(regla.tope).times(acuerdo.moneda === 'USD' ? contexto.mep : 1));
    if (sumar(comisiones, 'brutoArs').lte(topeArs)) return renglones;
    const tope = renglon({
      tipo: 'comision',
      detalle: `Comisión con tope (${acuerdo.moneda} ${montoCorto(regla.tope)}) - ${nombrePeriodo(periodoAnterior(contexto.periodo))}`,
      cantidad: 1,
      moneda: acuerdo.moneda,
      precioUnitario: regla.tope,
      mep: contexto.mep,
    });
    return [...fees, tope, ...resto];
  }
  throw new ErrorLiquidacion(`Regla de combinación desconocida: ${regla.modo}`);
}

function mesesEntre(desde, hasta) {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

function renglonesExtras(cliente, periodo, contexto) {
  const out = [];
  for (const extra of cliente.extras ?? []) {
    if (extra.desde && compararPeriodos(periodo, extra.desde) < 0) continue;
    if (extra.hasta && compararPeriodos(periodo, extra.hasta) > 0) continue;
    let detalle = `${extra.concepto} - ${nombrePeriodo(periodo)}`;
    if (extra.cuotas) {
      const n = mesesEntre(extra.cuotas.primera, periodo) + 1;
      if (n < 1 || n > extra.cuotas.total) continue;
      detalle = `${extra.concepto} - cuota ${n} de ${extra.cuotas.total} - ${nombrePeriodo(periodo)}`;
    }
    out.push({
      pagador: extra.pagador ?? 'marca',
      renglon: renglon({
        tipo: extra.tipo,
        detalle,
        cantidad: extra.cantidad ?? 1,
        moneda: extra.moneda,
        precioUnitario: extra.monto,
        mep: contexto.mep,
        conIva: extra.conIva !== false,
      }),
    });
  }
  return out;
}

/**
 * Liquida un cliente para un mes. Devuelve una liquidación por pagador con el monto a pagar.
 *
 * @param datosCliente marca con sus locales propios y franquiciados, acuerdos y extras (ver clientes.js)
 * @param opciones     { periodo: 'AAAA-MM', mep, ipc: { 'AAAA-MM': 0.021 }, ventas: [{ cliente_id, grupo, periodo, canal, total_con_iva }] }
 */
export function liquidarCliente(datosCliente, { periodo, mep, ipc, ventas }) {
  const cliente = normalizarCliente(datosCliente);
  const acuerdo = acuerdoVigente(cliente, periodo);
  if (!acuerdo) throw new ErrorLiquidacion(`${cliente.nombre} no tiene un acuerdo vigente en ${nombrePeriodo(periodo)}.`);

  const usaUsd = acuerdo.moneda === 'USD' || (cliente.extras ?? []).some((e) => e.moneda === 'USD');
  if (usaUsd && !(Number(mep) > 0)) throw new ErrorLiquidacion('Falta el dólar MEP venta del día.');

  const avisos = [];
  const contexto = { periodo, mep, pasosIpc: factorIpc(acuerdo, periodo, ipc) };

  const todos = [
    ...renglonesFeePorLocal(cliente, acuerdo, periodo, contexto),
    ...renglonesFeeFijo(acuerdo, periodo, contexto),
    ...renglonesComision(cliente, periodo, ventas, avisos),
    ...renglonesExtras(cliente, periodo, contexto),
  ];

  const porPagador = new Map();
  for (const { pagador, renglon: r } of todos) {
    if (!porPagador.has(pagador)) porPagador.set(pagador, []);
    porPagador.get(pagador).push(r);
  }

  const liquidaciones = [...porPagador].map(([idPagador, renglones]) => {
    const finales = combinarHibrido(acuerdo, renglones, contexto);
    const bruto = sumar(finales, 'brutoArs');
    const iva = sumar(finales, 'ivaArs');
    return {
      pagador: datosPagador(cliente, idPagador),
      renglones: finales,
      totales: { brutoArs: bruto.toNumber(), ivaArs: iva.toNumber(), netoArs: bruto.plus(iva).toNumber() },
    };
  });

  // La marca primero, después los franquiciados en orden alfabético.
  liquidaciones.sort((a, b) =>
    a.pagador.tipo === b.pagador.tipo ? a.pagador.nombre.localeCompare(b.pagador.nombre) : a.pagador.tipo === 'marca' ? -1 : 1,
  );

  return { cliente: { id: cliente.id, nombre: cliente.nombre }, periodo, mep, liquidaciones, avisos };
}
