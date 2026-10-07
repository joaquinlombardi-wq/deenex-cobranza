// Forma financiera del cliente: no importa cada local, solo cuántos son propios y cuántos
// franquiciados, y quién los paga.
//
//   tieneFranquiciados   false si todos los locales son propios
//   quienPaga            'marca' o 'franquiciados' (cada franquiciado paga sus locales)
//   locales              { propios, franquiciados } (franquiciados: cuando los paga la marca)
//   franquiciados        [{ id, razonSocial, cuit, contacto, locales }] (cuando paga cada uno)
//   acuerdo.feePorLocal  { precio, precioFranquiciado } (sin precioFranquiciado pagan lo mismo)
//   acuerdo.comision     { delivery, takeaway } y acuerdo.comisionFranquiciado si pagan distinto
//   cambiosLocales       [{ desde: 'AAAA-MM', propios, franquiciados, porFranquiciado: { <id>: n } }]: cuántos
//                        locales tiene desde ese mes. Lo de arriba es la cantidad con la que arrancó.

import { compararPeriodos } from './periodos.js';

const CANALES = ['delivery', 'takeaway'];
const cantidad = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

// El acuerdo depende de los locales si cobra por local o comisión sobre las ventas.
export const usaLocales = (acuerdo) => Boolean(acuerdo?.feePorLocal || acuerdo?.comision);

function normalizarAcuerdo(a) {
  const acuerdo = { ...a };
  delete acuerdo.prorrateo;
  const fee = a.feePorLocal;
  // Antes había un precio general y uno opcional para propios; ahora el precio es el de los propios.
  if (fee?.precioPropio != null) {
    acuerdo.feePorLocal = { ...fee, precio: fee.precioPropio, precioFranquiciado: fee.precioFranquiciado ?? fee.precio };
    delete acuerdo.feePorLocal.precioPropio;
  }
  return acuerdo;
}

function normalizarCambio(cambio) {
  const porFranquiciado = Object.entries(cambio.porFranquiciado ?? {}).map(([id, n]) => [id, cantidad(n)]);
  return {
    ...cambio,
    propios: cantidad(cambio.propios),
    franquiciados: cantidad(cambio.franquiciados),
    porFranquiciado: Object.fromEntries(porFranquiciado),
  };
}

// Un cambio por mes (el último cargado manda), del más viejo al más nuevo.
function normalizarCambios(cambios) {
  const porMes = new Map();
  for (const x of cambios ?? []) if (/^\d{4}-\d{2}$/.test(x?.desde ?? '')) porMes.set(x.desde, normalizarCambio(x));
  return [...porMes.values()].sort((a, b) => compararPeriodos(a.desde, b.desde));
}

// Acepta también el formato anterior (un renglón por local) y lo pasa a cantidades.
export function normalizarCliente(c) {
  const franquiciados = c.franquiciados ?? [];
  let locales;
  let porFranquiciado = new Map();
  let tieneFranquiciados = c.tieneFranquiciados;

  if (Array.isArray(c.locales)) {
    const activos = c.locales.filter((l) => !l.baja);
    const deFranquicia = activos.filter((l) => l.tipo === 'franquiciado');
    for (const l of deFranquicia) porFranquiciado.set(l.franquiciadoId, (porFranquiciado.get(l.franquiciadoId) ?? 0) + 1);
    tieneFranquiciados ??= deFranquicia.length > 0 || franquiciados.length > 0;
    const paganEllos = c.quienPaga === 'franquiciados' && tieneFranquiciados;
    locales = { propios: activos.length - deFranquicia.length, franquiciados: paganEllos ? 0 : deFranquicia.length };
  } else {
    locales = { propios: cantidad(c.locales?.propios), franquiciados: cantidad(c.locales?.franquiciados) };
    porFranquiciado = new Map(franquiciados.map((f) => [f.id, cantidad(f.locales)]));
    tieneFranquiciados ??= franquiciados.length > 0 || locales.franquiciados > 0;
  }

  tieneFranquiciados = Boolean(tieneFranquiciados);
  return {
    ...c,
    tieneFranquiciados,
    quienPaga: tieneFranquiciados && c.quienPaga === 'franquiciados' ? 'franquiciados' : 'marca',
    locales: tieneFranquiciados ? locales : { propios: locales.propios, franquiciados: 0 },
    franquiciados: franquiciados.map((f) => ({ ...f, locales: porFranquiciado.get(f.id) ?? 0 })),
    acuerdos: (c.acuerdos ?? []).map(normalizarAcuerdo),
    extras: c.extras ?? [],
    cambiosLocales: normalizarCambios(c.cambiosLocales),
  };
}

// El cliente con la cantidad de locales que tiene en un mes: la del último cambio que empezó en
// o antes de ese mes, o la del alta si todavía no cambió. Un franquiciado que no figura en el
// cambio conserva la suya. Recibe un cliente ya normalizado.
export function localesEn(cliente, periodo) {
  const cambio = (cliente.cambiosLocales ?? []).filter((x) => compararPeriodos(x.desde, periodo) <= 0).at(-1);
  if (!cambio) return cliente;
  return {
    ...cliente,
    locales: { propios: cambio.propios, franquiciados: cliente.tieneFranquiciados ? cambio.franquiciados : 0 },
    franquiciados: cliente.franquiciados.map((f) => ({ ...f, locales: cambio.porFranquiciado[f.id] ?? f.locales })),
  };
}

// Los locales de un mes cargados desde su cuenta: rigen desde ese mes hasta el próximo cambio.
// Si son los mismos que ya traía del mes anterior, el cambio de ese mes sobra y se saca.
// Devuelve la lista nueva de cambiosLocales. Recibe un cliente ya normalizado.
export function conLocalesEnMes(cliente, periodo, { propios, franquiciados = 0, porFranquiciado = {} }) {
  const otros = cliente.cambiosLocales.filter((x) => x.desde !== periodo);
  const previo = localesEn({ ...cliente, cambiosLocales: otros }, periodo);
  const nuevo = normalizarCambio({ desde: periodo, propios, franquiciados: cliente.tieneFranquiciados ? franquiciados : 0, porFranquiciado });
  const igual =
    nuevo.propios === previo.locales.propios &&
    nuevo.franquiciados === previo.locales.franquiciados &&
    previo.franquiciados.every((f) => (nuevo.porFranquiciado[f.id] ?? f.locales) === f.locales);
  return igual ? otros : normalizarCambios([...otros, nuevo]);
}

// Grupos de locales que se cobran juntos: los propios, los franquiciados que paga la marca
// o los de cada franquiciado que paga. `id` es el que usan las ventas (campo `grupo`).
export function gruposDeLocales(cliente) {
  const grupos = [];
  if (cliente.locales.propios > 0) {
    grupos.push({ id: 'propios', pagador: 'marca', locales: cliente.locales.propios, franquicia: false, nombre: 'los locales propios' });
  }
  if (!cliente.tieneFranquiciados) return grupos;
  if (cliente.quienPaga === 'franquiciados') {
    for (const f of cliente.franquiciados) {
      if (f.locales > 0) grupos.push({ id: f.id, pagador: f.id, locales: f.locales, franquicia: true, nombre: f.razonSocial || 'un franquiciado sin nombre' });
    }
  } else if (cliente.locales.franquiciados > 0) {
    grupos.push({ id: 'franquiciados', pagador: 'marca', locales: cliente.locales.franquiciados, franquicia: true, nombre: 'los locales franquiciados' });
  }
  return grupos;
}

// Tasas de comisión que se le aplican a un grupo.
export const tasasDeGrupo = (acuerdo, grupo) =>
  (grupo.franquicia && acuerdo.comisionFranquiciado ? acuerdo.comisionFranquiciado : acuerdo.comision) ?? {};

const mismasTasas = (a, b) => CANALES.every((k) => (a[k] ?? null) === (b[k] ?? null));

// Grupos en que se cargan las ventas para cobrar la comisión. Si la marca paga propios y
// franquiciados con las mismas tasas alcanza con un total ('todos'); si no, uno por grupo.
// `miembros` son los grupos de locales que entran: sus ventas por separado también sirven.
export function gruposDeVentas(cliente, acuerdo) {
  const grupos = [];
  for (const g of gruposDeLocales(cliente)) {
    const tasas = tasasDeGrupo(acuerdo, g);
    if (!CANALES.some((k) => tasas[k] != null)) continue;
    const junto = grupos.find((x) => x.pagador === g.pagador && mismasTasas(x.tasas, tasas));
    if (junto) {
      Object.assign(junto, { id: 'todos', nombre: 'todos los locales', locales: junto.locales + g.locales, miembros: [...junto.miembros, g.id] });
    } else {
      grupos.push({ id: g.id, pagador: g.pagador, nombre: g.nombre, locales: g.locales, franquicia: g.franquicia, tasas, miembros: [g.id] });
    }
  }
  return grupos;
}
