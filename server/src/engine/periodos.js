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

// El mes que toca cerrar: el que tiene un cierre generado y todavía sin pasar a las cuentas
// corrientes (este mes o el que viene). Si no hay ninguno, este mes hasta el día 10, que es cuando
// se factura y vence, y después el que viene. `hoy` es 'AAAA-MM-DD'; `cierres`, [{ periodo, confirmado }].
export function mesACerrar(hoy, cierres = []) {
  const actual = hoy.slice(0, 7);
  const siguiente = periodoAnterior(actual, -1);
  const pendiente = [actual, siguiente].find((p) => cierres.some((c) => c?.periodo === p && !c.confirmado));
  if (pendiente) return pendiente;
  return Number(hoy.slice(8, 10)) <= 10 ? actual : siguiente;
}
