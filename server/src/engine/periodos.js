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

export function periodoDe(fecha) {
  return fecha.slice(0, 7);
}

// Días del periodo en que el local estuvo activo (alta y baja inclusive).
export function diasActivos(local, periodo) {
  const total = diasDelMes(periodo);
  const inicioMes = `${periodo}-01`;
  const finMes = `${periodo}-${String(total).padStart(2, '0')}`;
  const desde = local.alta > inicioMes ? local.alta : inicioMes;
  const hasta = local.baja && local.baja < finMes ? local.baja : finMes;
  if (desde > hasta) return 0;
  return Number(hasta.slice(8, 10)) - Number(desde.slice(8, 10)) + 1;
}
