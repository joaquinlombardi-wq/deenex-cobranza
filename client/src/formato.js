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

export const periodoActual = () => new Date().toISOString().slice(0, 7);

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
  if (a.feePorLocal?.precio != null) partes.push(`${a.moneda} ${a.feePorLocal.precio} por local`);
  if (a.comision) {
    const c = ['delivery', 'takeaway'].filter((k) => a.comision[k] != null).map((k) => `${+(a.comision[k] * 100).toFixed(4)}% ${k}`);
    if (c.length) partes.push(c.join(' + '));
  }
  if (a.feeFijo?.monto != null) partes.push(`${a.moneda} ${numero(a.feeFijo.monto)} fijo`);
  if (a.ajusteIpc?.activo) partes.push('ajusta por IPC');
  return partes.join(' · ') || 'Solo extras';
}
