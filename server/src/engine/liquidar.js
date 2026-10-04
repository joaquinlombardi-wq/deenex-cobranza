import { D, redondear, IVA_GENERAL } from './dinero.js';
import { periodoAnterior, diasDelMes, diasActivos, compararPeriodos, periodoDe } from './periodos.js';
import { PRODUCTOS_DUX } from './productosDux.js';

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

function pagadorDeLocal(cliente, local) {
  if (cliente.quienPaga !== 'franquiciados' || local.tipo === 'propio') return 'marca';
  if (!local.franquiciadoId) {
    throw new ErrorLiquidacion(`El local "${local.nombre}" es franquiciado pero no tiene franquiciado asignado.`);
  }
  return local.franquiciadoId;
}

function precioDeLocal(fee, local) {
  if (local.precio != null) return local.precio;
  if (local.tipo === 'propio' && fee.precioPropio != null) return fee.precioPropio;
  if (local.tipo === 'franquiciado' && fee.precioFranquiciado != null) return fee.precioFranquiciado;
  return fee.precio;
}

// Qué parte del mes se le cobra a un local según la regla de prorrateo del acuerdo.
function factorProrrateo(acuerdo, local, periodo) {
  const dias = diasActivos(local, periodo);
  if (dias === 0) return { factor: D(0) };
  const regla = acuerdo.prorrateo ?? { modo: 'completo' };
  if (regla.modo === 'proporcional') {
    const total = diasDelMes(periodo);
    return dias === total ? { factor: D(1) } : { factor: D(dias).div(total), nota: `proporcional ${dias}/${total} días` };
  }
  if (regla.modo === 'corte' && periodoDe(local.alta) === periodo && Number(local.alta.slice(8, 10)) > regla.dia) {
    return { factor: D(0) };
  }
  return { factor: D(1) };
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

function renglonesFeePorLocal(cliente, acuerdo, periodo, contexto) {
  const fee = acuerdo.feePorLocal;
  if (!fee) return [];
  const mes = nombrePeriodo(periodo);
  const grupos = new Map();
  const sueltos = [];

  for (const local of cliente.locales ?? []) {
    const { factor, nota } = factorProrrateo(acuerdo, local, periodo);
    if (factor.isZero()) continue;
    const pagador = pagadorDeLocal(cliente, local);
    const precio = ajustarMonto(precioDeLocal(fee, local), contexto.pasosIpc);
    if (nota) {
      sueltos.push({ pagador, local, precio: redondear(precio.times(factor)), nota });
      continue;
    }
    const clave = `${pagador}|${precio}`;
    const g = grupos.get(clave) ?? { pagador, precio, cantidad: 0 };
    g.cantidad += 1;
    grupos.set(clave, g);
  }

  const moneda = acuerdo.moneda;
  const out = [];
  for (const g of grupos.values()) {
    out.push({
      pagador: g.pagador,
      renglon: renglon({
        tipo: 'feePorLocal',
        detalle: `Servicio full - ${g.cantidad} ${g.cantidad === 1 ? 'local' : 'locales'} x ${moneda} ${montoCorto(g.precio)} - ${mes}`,
        cantidad: g.cantidad,
        moneda,
        precioUnitario: g.precio,
        mep: contexto.mep,
      }),
    });
  }
  for (const s of sueltos) {
    out.push({
      pagador: s.pagador,
      renglon: renglon({
        tipo: 'feePorLocal',
        detalle: `Servicio full - ${s.local.nombre} (${s.nota}) - ${mes}`,
        cantidad: 1,
        moneda,
        precioUnitario: s.precio,
        mep: contexto.mep,
      }),
    });
  }
  return out;
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

// Comisión mes vencido: se cobra en M sobre las ventas de M-1 (total con IVA, sin envío).
function renglonesComision(cliente, periodo, ventas, avisos) {
  const periodoVentas = periodoAnterior(periodo);
  const acuerdo = acuerdoVigente(cliente, periodoVentas);
  const comision = acuerdo?.comision;
  if (!comision) return [];

  const filas = (ventas ?? []).filter((v) => v.periodo === periodoVentas);
  const bases = new Map();

  for (const local of cliente.locales ?? []) {
    if (diasActivos(local, periodoVentas) === 0) continue;
    const idPlataforma = local.plataformaId ?? local.id;
    const pagador = pagadorDeLocal(cliente, local);
    for (const canal of CANALES) {
      if (comision[canal] == null) continue;
      const fila = filas.find((v) => v.local_id === idPlataforma && v.canal === canal);
      if (!fila) {
        avisos.push(`Faltan las ventas de ${canal} de ${nombrePeriodo(periodoVentas)} del local "${local.nombre}".`);
        continue;
      }
      const clave = `${pagador}|${canal}`;
      bases.set(clave, (bases.get(clave) ?? D(0)).plus(fila.total_con_iva));
    }
  }

  const out = [];
  for (const [clave, base] of bases) {
    const [pagador, canal] = clave.split('|');
    const tasa = comision[canal];
    out.push({
      pagador,
      renglon: renglon({
        tipo: 'comision',
        detalle: `Comisión ${pct(tasa)} ${canal} - ventas ${nombrePeriodo(periodoVentas)} (${formatoArs(base)})`,
        cantidad: 1,
        moneda: 'ARS',
        precioUnitario: redondear(base.times(tasa)),
      }),
    });
  }
  return out;
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
 * @param cliente  marca con franquiciados, locales, acuerdos y extras
 * @param opciones { periodo: 'AAAA-MM', mep, ipc: { 'AAAA-MM': 0.021 }, ventas: [filas de la plataforma] }
 */
export function liquidarCliente(cliente, { periodo, mep, ipc, ventas }) {
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
