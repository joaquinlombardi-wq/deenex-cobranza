// Lo que el contador tiene que facturar a partir de un cierre: una factura por pagador (la marca o
// cada franquiciado que paga), un renglón por concepto con su producto Dux, como en la hoja DETALLE
// del Excel de facturación. Dos clientes del sistema son dos facturas aunque compartan CUIT (QUEM
// y QUEM Central).

import { D } from '../engine/dinero.js';
import { CATALOGO_DUX, productoDux } from '../engine/productosDux.js';
import { nombrePeriodo } from '../engine/liquidar.js';

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Cómo se nombra al que recibe la factura: el cliente y, si la razón social es otra, entre
// paréntesis, como "LA FÁBRICA (NAGYMAROS)". Un franquiciado va con su razón social y su marca.
export function nombreFactura(cliente, pagador) {
  if (pagador.tipo === 'franquiciado') {
    return `${pagador.razonSocial || pagador.nombre || 'Franquiciado sin nombre'} (franquiciado de ${cliente.nombre})`;
  }
  const razon = (pagador.razonSocial ?? '').trim();
  if (!razon || sinTildes(cliente.nombre).includes(sinTildes(razon))) return cliente.nombre;
  return `${cliente.nombre} (${razon})`;
}

const numero = (v) => D(v).toNumber();

function renglonPlanilla(r) {
  const ivaPct = r.ivaPct ?? 0;
  const enUsd = r.moneda === 'USD';
  const brutoUsd = enUsd ? D(r.cantidad).times(r.precioUnitario) : null;
  const ivaUsd = enUsd ? brutoUsd.times(ivaPct) : null;
  return {
    productoDux: r.productoDux ?? '',
    // El nombre sale del catálogo de Dux, así un cierre viejo también sale con el nombre exacto.
    productoDuxNombre: productoDux(r.productoDux)?.nombre ?? r.productoDuxNombre ?? '',
    detalle: r.detalle,
    cantidad: r.cantidad,
    moneda: r.moneda,
    precioUnitario: r.precioUnitario,
    ivaPct,
    usd: enUsd ? { bruto: numero(brutoUsd), iva: numero(ivaUsd), neto: numero(brutoUsd.plus(ivaUsd)) } : null,
    ars: { bruto: r.brutoArs, iva: r.ivaArs, neto: r.netoArs },
  };
}

const sumar = (renglones, moneda, campo) =>
  renglones.reduce((s, r) => (r[moneda] ? s.plus(r[moneda][campo]) : s), D(0)).toNumber();

const totalesDe = (renglones) => ({
  usd: { bruto: sumar(renglones, 'usd', 'bruto'), iva: sumar(renglones, 'usd', 'iva'), neto: sumar(renglones, 'usd', 'neto') },
  ars: { bruto: sumar(renglones, 'ars', 'bruto'), iva: sumar(renglones, 'ars', 'iva'), neto: sumar(renglones, 'ars', 'neto') },
});

/**
 * @param cierre { periodo, mep, fechaMep, resultados } como lo guarda el cierre del mes
 * @returns { periodo, mep, fechaMep, facturas, totales, pendientes, productos }
 */
export function planillaContador(cierre) {
  const facturas = [];
  const pendientes = [];
  for (const r of cierre.resultados ?? []) {
    if (r.error) {
      pendientes.push({ cliente: r.cliente.nombre, motivo: r.error });
      continue;
    }
    r.liquidaciones.forEach((l, i) => {
      if (!l.renglones.length) return;
      const renglones = l.renglones.map(renglonPlanilla);
      facturas.push({
        numero: `F-${String(facturas.length + 1).padStart(2, '0')}`,
        clienteId: r.cliente.id,
        cliente: nombreFactura(r.cliente, l.pagador),
        cuit: l.pagador.cuit || '',
        pagadorTipo: l.pagador.tipo,
        renglones,
        totales: totalesDe(renglones),
        // Lo que quedó para revisar en el cierre va con la factura de la marca.
        observaciones: i === 0 ? (r.avisos ?? []).map((a) => `REVISAR: ${a}`) : [],
      });
    });
  }

  const renglones = facturas.flatMap((f) => f.renglones);
  const usadoEn = (codigo) => facturas.filter((f) => f.renglones.some((x) => x.productoDux === codigo)).map((f) => f.numero);
  return {
    periodo: cierre.periodo,
    mes: nombrePeriodo(cierre.periodo),
    mep: cierre.mep ?? null,
    fechaMep: cierre.fechaMep ?? null,
    facturas,
    totales: totalesDe(renglones),
    pendientes,
    productos: CATALOGO_DUX.map((p) => ({ ...p, usadoEn: usadoEn(p.codigo) })),
  };
}

export const nombreArchivoContador = (periodo) => `Facturacion_${nombrePeriodo(periodo).replace(' ', '_')}.xlsx`;
