// Un periodo es un mes en formato 'AAAA-MM'.

export function periodoAnterior(periodo, meses = 1) {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function diasDelMes(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

// Compara periodos 'AAAA-MM' (sirve también con fechas 'AAAA-MM-DD' cortadas).
export function compararPeriodos(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
