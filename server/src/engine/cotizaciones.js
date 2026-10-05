// Series de dólar MEP venta (por día, 'AAAA-MM-DD') e IPC (por mes, 'AAAA-MM', como fracción: 0.021 = 2,1%).

// Une la serie que llega de la fuente con la cargada a mano: la fuente manda y lo manual
// completa los huecos (días sin cotización, IPC que todavía no se publicó).
export function combinarSerie(automatica = {}, manual = {}) {
  const valores = {};
  const fuentes = {};
  for (const [clave, valor] of Object.entries(manual ?? {})) {
    if (valor == null) continue;
    valores[clave] = valor;
    fuentes[clave] = 'manual';
  }
  for (const [clave, valor] of Object.entries(automatica ?? {})) {
    if (valor == null) continue;
    valores[clave] = valor;
    fuentes[clave] = 'automatica';
  }
  return { valores, fuentes };
}

const DIA_MS = 86400000;

// MEP venta de una fecha. Si ese día no hubo cotización (fin de semana, feriado) usa la última
// anterior, siempre que no tenga más de `maxDias` de antigüedad.
export function mepEnFecha(valores, fecha, maxDias = 10) {
  let mejor = null;
  for (const f of Object.keys(valores ?? {})) {
    if (f <= fecha && (mejor === null || f > mejor)) mejor = f;
  }
  if (mejor === null) return null;
  if ((Date.parse(fecha) - Date.parse(mejor)) / DIA_MS > maxDias) return null;
  return { fecha: mejor, valor: valores[mejor] };
}

// Últimas `n` entradas de una serie, de la más nueva a la más vieja.
export function ultimos(valores, n) {
  return Object.keys(valores ?? {})
    .sort()
    .reverse()
    .slice(0, n)
    .map((clave) => ({ clave, valor: valores[clave] }));
}
