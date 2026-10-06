// Hoja DETALLE de la planilla de facturación del contador, copiada de Excel y pegada en la
// pestaña Ventas: una fila por renglón de factura con FACTURA, CLIENTE, CÓDIGO DUX, PRODUCTO DUX,
// DETALLE, CANT., MON., P. UNIT., IVA % y los montos BRUTO / IVA / NETO en dólares y en pesos.
import { redondear } from '../engine/dinero.js';
import { leerNumero } from '../cotizaciones/importar.js';

const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// '$ 114.345,00' '($ 103.146,00)' 'USD 75,00' '-103146' '1,549.80' -> número (NaN si no es un monto)
export function leerImporte(texto) {
  let t = String(texto ?? '').trim();
  let negativo = false;
  const entreParentesis = t.match(/^\((.*)\)$/);
  if (entreParentesis) {
    negativo = true;
    t = entreParentesis[1];
  }
  t = t.replace(/U\$S|USD|ARS|\$/gi, '').replace(/\s/g, '');
  if (t.startsWith('-')) {
    negativo = !negativo;
    t = t.slice(1);
  }
  const n = leerNumero(t, 'mep');
  return Number.isFinite(n) ? (negativo ? -n : n) : NaN;
}

// '21%' '0%' '0,21' '21' -> 0.21
function leerPorcentaje(texto) {
  const t = String(texto ?? '').trim();
  const n = leerNumero(t, 'ipc');
  if (!Number.isFinite(n)) return NaN;
  return t.includes('%') || n > 1 ? n / 100 : n;
}

const COLUMNAS = [
  ['factura', (c) => c.startsWith('FACTURA')],
  ['cliente', (c) => c === 'CLIENTE'],
  ['codigo', (c) => c.startsWith('COD')],
  ['producto', (c) => c.startsWith('PRODUCTO')],
  ['detalle', (c) => c.startsWith('DETALLE')],
  ['cantidad', (c) => c.startsWith('CANT')],
  ['moneda', (c) => c.startsWith('MON')],
  ['precio', (c) => /^P\.? ?UNIT|^PRECIO/.test(c)],
  ['ivaPct', (c) => /^IVA ?%/.test(c)],
];

const esEncabezado = (celdas) => {
  const n = celdas.map(normalizar);
  return n.includes('CLIENTE') && n.some((c) => c.startsWith('COD') && c.includes('DUX'));
};

// Moneda de una columna de montos según el título de arriba ("MONTO USD", "MONTO ARGENTINO"),
// que en Excel ocupa varias columnas y se copia solo en la primera.
function monedaDeColumna(superior, i) {
  for (let j = i; j >= 0; j--) {
    const t = normalizar(superior?.[j]);
    if (!t) continue;
    if (/USD|DOLAR/.test(t)) return 'USD';
    if (/ARG|ARS|PESO|\$/.test(t)) return 'ARS';
    return null;
  }
  return null;
}

// Columnas BRUTO / IVA / NETO de cada moneda. Sin títulos de arriba, el primer juego es en
// dólares y el segundo en pesos, como en la planilla; si hay uno solo, es en pesos.
function columnasDeMontos(encabezado, superior) {
  const montos = { USD: {}, ARS: {} };
  for (const campo of ['BRUTO', 'IVA', 'NETO']) {
    const indices = encabezado.flatMap((c, i) => (c === campo ? [i] : []));
    indices.forEach((i, n) => {
      const moneda = monedaDeColumna(superior, i) ?? (indices.length > 1 && n === 0 ? 'USD' : 'ARS');
      montos[moneda][campo.toLowerCase()] ??= i;
    });
  }
  return montos;
}

function buscarMep(filas) {
  for (const celdas of filas) {
    const i = celdas.findIndex((c) => normalizar(c).includes('MEP'));
    if (i < 0) continue;
    const valor = celdas.slice(i + 1).map((c) => leerImporte(c)).find((v) => v > 0);
    if (valor) return valor;
  }
  return null;
}

/**
 * Lee la hoja DETALLE pegada. Devuelve los renglones con sus montos en pesos (los de la planilla,
 * o cantidad x precio x dólar si faltan), el dólar MEP y el total que dice la planilla.
 *
 * @param texto   lo pegado (columnas separadas por tabulador, como copia Excel, o por punto y coma)
 * @param opciones { mep } para los renglones en dólares si la planilla no lo trae
 */
export function leerDetallePegado(texto, { mep: mepElegido } = {}) {
  const lineas = String(texto ?? '').split(/\r?\n/);
  if (!lineas.some((l) => l.trim())) throw new Error('No pegaste nada.');
  const separador = lineas.some((l) => l.includes('\t')) ? '\t' : ';';
  const filas = lineas.map((l) => l.split(separador));

  const iEncabezado = filas.findIndex(esEncabezado);
  if (iEncabezado < 0) {
    throw new Error('No encontré los títulos de la hoja DETALLE (FACTURA, CLIENTE, CÓDIGO DUX…). Copiá la hoja entera, con los títulos.');
  }
  const encabezado = filas[iEncabezado].map(normalizar);
  const col = {};
  encabezado.forEach((c, i) => {
    for (const [campo, es] of COLUMNAS) if (col[campo] == null && es(c)) col[campo] = i;
  });
  const montos = columnasDeMontos(encabezado, filas[iEncabezado - 1]);
  if (montos.ARS.bruto == null && (col.cantidad == null || col.precio == null)) {
    throw new Error('No encontré la columna BRUTO en pesos ni CANT. y P. UNIT. para calcularla.');
  }

  const celda = (celdas, i) => (i == null ? '' : String(celdas[i] ?? '').trim());
  const datos = [];
  const descartadas = [];
  let totalPlanilla = null;
  for (const celdas of filas.slice(iEncabezado + 1)) {
    const primera = normalizar(celdas.find((c) => String(c).trim()) ?? '');
    if (!primera) continue;
    if (primera.startsWith('TOTAL')) {
      const bruto = leerImporte(celda(celdas, montos.ARS.bruto));
      const neto = leerImporte(celda(celdas, montos.ARS.neto));
      if (Number.isFinite(bruto)) totalPlanilla = { brutoArs: bruto, netoArs: Number.isFinite(neto) ? neto : null };
      continue;
    }
    const cliente = celda(celdas, col.cliente);
    const codigo = celda(celdas, col.codigo);
    // Las notas al pie ocupan una sola celda: no son renglones.
    if (!cliente && !codigo) continue;
    if (!cliente || !codigo) {
      descartadas.push(celdas.join(' | ').trim());
      continue;
    }
    datos.push({ celdas, cliente, codigo });
  }

  // El dólar: el que figura en la planilla ("DÓLAR MEP VENTA"), el que surge de un renglón en
  // dólares que trae los dos montos o, si no, el que se escribió al importar.
  let mep = buscarMep(filas);
  if (!mep) {
    for (const { celdas } of datos) {
      const usd = leerImporte(celda(celdas, montos.USD.bruto));
      const ars = leerImporte(celda(celdas, montos.ARS.bruto));
      const enDolares = normalizar(celda(celdas, col.moneda)).startsWith('USD');
      if (enDolares && usd > 0 && ars > 0) {
        mep = redondear(ars / usd).toNumber();
        break;
      }
    }
  }
  if (!mep && Number(mepElegido) > 0) mep = Number(mepElegido);

  const renglones = [];
  for (const { celdas, cliente, codigo } of datos) {
    const moneda = /^(USD|U\$S|DOL)/.test(normalizar(celda(celdas, col.moneda))) ? 'USD' : 'ARS';
    const cantidad = leerImporte(celda(celdas, col.cantidad));
    const precio = leerImporte(celda(celdas, col.precio));
    let bruto = leerImporte(celda(celdas, montos.ARS.bruto));
    if (!Number.isFinite(bruto) && Number.isFinite(cantidad) && Number.isFinite(precio)) {
      if (moneda === 'ARS') bruto = cantidad * precio;
      else if (mep) bruto = cantidad * precio * mep;
    }
    if (!Number.isFinite(bruto)) {
      descartadas.push(celdas.join(' | ').trim());
      continue;
    }
    const ivaPlanilla = leerImporte(celda(celdas, montos.ARS.iva));
    let ivaPct = leerPorcentaje(celda(celdas, col.ivaPct));
    if (!Number.isFinite(ivaPct)) ivaPct = Number.isFinite(ivaPlanilla) && bruto ? redondear(ivaPlanilla / bruto).toNumber() : 0.21;
    const brutoArs = redondear(bruto);
    const ivaArs = redondear(Number.isFinite(ivaPlanilla) ? ivaPlanilla : brutoArs.times(ivaPct));
    const netoPlanilla = leerImporte(celda(celdas, montos.ARS.neto));
    renglones.push({
      factura: celda(celdas, col.factura) || null,
      clienteExcel: cliente,
      productoDux: codigo,
      productoDuxNombre: celda(celdas, col.producto) || null,
      detalle: celda(celdas, col.detalle),
      cantidad: Number.isFinite(cantidad) ? cantidad : 1,
      moneda,
      precioUnitario: Number.isFinite(precio) ? precio : null,
      ivaPct,
      brutoArs: brutoArs.toNumber(),
      ivaArs: ivaArs.toNumber(),
      netoArs: (Number.isFinite(netoPlanilla) ? redondear(netoPlanilla) : brutoArs.plus(ivaArs)).toNumber(),
    });
  }
  if (!renglones.length) throw new Error('No encontré renglones con cliente, código Dux y monto debajo de los títulos.');

  const suma = (campo) => renglones.reduce((s, r) => s.plus(r[campo]), redondear(0)).toNumber();
  return {
    mep,
    renglones,
    totales: { brutoArs: suma('brutoArs'), ivaArs: suma('ivaArs'), netoArs: suma('netoArs') },
    totalPlanilla,
    descartadas,
  };
}

const VACIAS = new Set(['LA', 'EL', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'S', 'A', 'R', 'L', 'SA', 'SRL', 'SAS']);
const palabras = (t) => new Set(normalizar(t).split(/[^A-Z0-9]+/).filter((p) => p && !VACIAS.has(p)));

// Facturas de lo importado (una por número de factura, o por cliente si no hay número) con lo que
// hace falta para elegir a qué cliente del sistema corresponde cada una.
export function facturasDe(renglones) {
  const facturas = new Map();
  for (const r of renglones) {
    const clave = `${r.factura ?? ''}|${r.clienteExcel}`;
    const f = facturas.get(clave) ?? { clave, factura: r.factura, cliente: r.clienteExcel, detalles: [], brutoArs: 0 };
    f.detalles.push(r.detalle);
    f.brutoArs = redondear(f.brutoArs + r.brutoArs).toNumber();
    facturas.set(clave, f);
  }
  return [...facturas.values()];
}

// Cliente del sistema que corresponde a una factura del Excel: tiene que tener todas las palabras
// del nombre del Excel (o el Excel todas las del suyo). Entre varios gana el que tenga más de su
// nombre en la factura (QUEM vs QUEM Central) y después el que ya tenía acuerdo ese mes.
export function sugerirCliente({ cliente, detalles = [] }, clientes, periodo) {
  const delExcel = palabras(cliente);
  if (!delExcel.size) return null;
  const enFactura = new Set([...delExcel, ...detalles.flatMap((d) => [...palabras(d)])]);
  const candidatos = clientes
    .map((c) => {
      const nombre = palabras(c.nombre);
      const todas = new Set([...nombre, ...palabras(c.razonSocial)]);
      const coincide = [...delExcel].every((p) => todas.has(p)) || (nombre.size > 0 && [...nombre].every((p) => delExcel.has(p)));
      const encontradas = [...nombre].filter((p) => enFactura.has(p)).length;
      const vigente = !periodo || (c.acuerdos ?? []).some((a) => a.vigenciaDesde <= periodo);
      return { c, coincide, proporcion: nombre.size ? encontradas / nombre.size : 0, encontradas, vigente };
    })
    .filter((x) => x.coincide);
  candidatos.sort((a, b) => b.proporcion - a.proporcion || b.encontradas - a.encontradas
    || Number(b.vigente) - Number(a.vigente) || a.c.nombre.localeCompare(b.c.nombre));
  return candidatos[0]?.c.id ?? null;
}

const slug = (t) => normalizar(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Pone a cada renglón el cliente del sistema elegido para su factura. Los que no tienen cliente en
// el sistema quedan con el nombre del Excel.
export function asignarClientes(renglones, elegidos, clientes) {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  return renglones.map((r) => {
    const c = porId.get(elegidos[`${r.factura ?? ''}|${r.clienteExcel}`]);
    return { ...r, clienteId: c ? c.id : `excel-${slug(r.clienteExcel)}`, clienteNombre: c ? c.nombre : r.clienteExcel };
  });
}
