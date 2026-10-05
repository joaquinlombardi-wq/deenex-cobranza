const ars = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pesos = (v) => `$ ${ars.format(v ?? 0)}`;
export const numero = (v) => ars.format(v ?? 0);

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombrePeriodo = (p) => {
  const [a, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
};

export const periodoMas = (p, n) => {
  const [a, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Fecha de hoy en la hora local de quien usa el sistema ('AAAA-MM-DD').
export const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const periodoActual = () => hoyLocal().slice(0, 7);

// '2026-10-05' -> '05/10/2026'
export const fechaCorta = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const diaSemana = (f) => DIAS[new Date(`${f}T12:00:00`).getDay()];

export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }) : '');

// 0.021 -> '2,1'
export const porcentaje = (fraccion, decimales = 2) =>
  fraccion == null ? '' : (+(fraccion * 100).toFixed(decimales)).toLocaleString('es-AR', { maximumFractionDigits: decimales });

export const ESTADOS_CUENTA = {
  'al-dia': { texto: 'Al día', clase: 'ok' },
  pendiente: { texto: 'Pendiente', clase: 'aviso' },
  parcial: { texto: 'Pago parcial', clase: 'aviso' },
  vencido: { texto: 'Vencido', clase: 'error' },
  pagado: { texto: 'Pagado', clase: 'ok' },
  'sin-movimientos': { texto: 'Sin movimientos', clase: 'neutro' },
};

export const slug = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Resumen en una línea del modelo de cobro de un acuerdo.
export function resumenAcuerdo(a) {
  if (!a) return 'Sin acuerdo';
  const partes = [];
  const tasas = (c) => ['delivery', 'takeaway'].filter((k) => c?.[k] != null).map((k) => `${+(c[k] * 100).toFixed(4)}% ${k}`).join(' + ');
  if (a.feeFijo?.monto != null) partes.push(`${a.moneda} ${numero(a.feeFijo.monto)} fijo`);
  if (a.feePorLocal?.precio != null) {
    const { precio, precioFranquiciado } = a.feePorLocal;
    partes.push(precioFranquiciado != null && precioFranquiciado !== precio
      ? `${a.moneda} ${precio} por local propio, ${precioFranquiciado} por franquiciado`
      : `${a.moneda} ${precio} por local`);
  }
  if (a.comision && tasas(a.comision)) {
    partes.push(a.comisionFranquiciado ? `${tasas(a.comision)} propios, ${tasas(a.comisionFranquiciado) || 'sin comisión'} franquiciados` : tasas(a.comision));
  }
  if (a.ajusteIpc?.activo) partes.push('ajusta por IPC');
  return partes.join(' · ') || 'Solo extras';
}

// Total de locales franquiciados: los que paga la marca o la suma de los de cada franquiciado.
export const localesFranquiciados = (c) =>
  c.quienPaga === 'franquiciados' ? (c.franquiciados ?? []).reduce((s, f) => s + (f.locales ?? 0), 0) : c.locales?.franquiciados ?? 0;

// '12 locales propios · 5 franquiciados'
export function resumenLocales(c) {
  const propios = c.locales?.propios ?? 0;
  const franquiciados = c.tieneFranquiciados ? localesFranquiciados(c) : 0;
  const partes = [];
  if (propios) partes.push(`${propios} ${propios === 1 ? 'local propio' : 'locales propios'}`);
  if (franquiciados) partes.push(`${franquiciados} ${franquiciados === 1 ? 'local franquiciado' : 'locales franquiciados'}`);
  return partes.join(' · ');
}

// Lee montos escritos a la argentina ("1.244.000,50") o con punto decimal ("1244000.50").
export function leerMonto(texto) {
  if (texto == null) return NaN;
  let t = String(texto).trim().replace(/[$\s]/g, '');
  if (t === '') return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}
