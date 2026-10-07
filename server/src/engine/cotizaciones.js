// Series de dólar MEP venta (por día, 'AAAA-MM-DD') e IPC (por mes, 'AAAA-MM', como fracción: 0.021 = 2,1%).
import { D, redondear } from './dinero.js';
import { periodoAnterior, compararPeriodos } from './periodos.js';

// Une capas de una serie, de la que menos manda a la que más: cada una pisa a las anteriores.
// `fuentes` dice de qué capa salió cada valor.
function combinarCapas(capas) {
  const valores = {};
  const fuentes = {};
  for (const [nombre, serie] of capas) {
    for (const [clave, valor] of Object.entries(serie ?? {})) {
      if (valor == null) continue;
      valores[clave] = valor;
      fuentes[clave] = nombre;
    }
  }
  return { valores, fuentes };
}

// IPC: la fuente (INDEC) manda y lo manual completa los huecos (un mes que todavía no se publicó).
export function combinarSerie(automatica = {}, manual = {}) {
  return combinarCapas([['manual', manual], ['automatica', automatica]]);
}

// MEP: manda lo tomado de dolarhoy, que es la referencia para facturar; después lo cargado a mano
// (también sale de dolarhoy) y por último el historial de ArgentinaDatos, que completa el resto.
export function combinarMep({ automatica = {}, manual = {}, dolarhoy = {} }) {
  return combinarCapas([['automatica', automatica], ['manual', manual], ['dolarhoy', dolarhoy]]);
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

// Lleva un monto del mes `desde` al mes `hasta` con el IPC de cada mes posterior a `desde`,
// hasta `hasta` inclusive (índice de `hasta` / índice de `desde`). El monto se redondea al centavo
// una sola vez, al final. `faltan` lista los meses sin IPC, que no entran en el cálculo.
export function actualizarPorIpc(monto, valores, desde, hasta) {
  let factor = D(1);
  let meses = 0;
  const faltan = [];
  for (let p = periodoAnterior(desde, -1); compararPeriodos(p, hasta) <= 0; p = periodoAnterior(p, -1)) {
    meses++;
    if (valores?.[p] == null) faltan.push(p);
    else factor = factor.times(D(1).plus(valores[p]));
  }
  return {
    monto: redondear(D(monto).times(factor)).toNumber(),
    factor: factor.toNumber(),
    variacion: factor.minus(1).toNumber(),
    meses,
    faltan,
  };
}
