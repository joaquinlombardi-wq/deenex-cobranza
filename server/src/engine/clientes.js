// Forma financiera del cliente: no importa cada local, solo cuántos son propios y cuántos
// franquiciados, y quién los paga.
//
//   tieneFranquiciados   false si todos los locales son propios
//   quienPaga            'marca' o 'franquiciados' (cada franquiciado paga sus locales)
//   locales              { propios, franquiciados } (franquiciados: cuando los paga la marca)
//   franquiciados        [{ id, razonSocial, cuit, contacto, locales }] (cuando paga cada uno)
//   acuerdo.feePorLocal  { precio, precioFranquiciado } (sin precioFranquiciado pagan lo mismo)
//   acuerdo.comision     { delivery, takeaway } y acuerdo.comisionFranquiciado si pagan distinto

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
  };
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
