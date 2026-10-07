// Ventas por cliente, grupo de locales, mes y canal: { cliente_id, grupo, periodo, canal, total_con_iva }.
import { acuerdoVigente } from './liquidar.js';
import { gruposDeVentas, localesEn } from './clientes.js';

const clave = (v) => `${v.cliente_id}|${v.grupo}|${v.canal}`;

const CANALES = ['delivery', 'takeaway'];

// Lo cargado de un cliente en un mes, por grupo de venta y canal ('propios|delivery': 1244000).
// Si propios y franquiciados se cobran juntos pero llegaron por separado, el grupo suma sus partes.
// `grupos` son los de gruposDeVentas (clientes.js).
export function ventasPorGrupo(filas, clienteId, grupos) {
  const monto = (grupo, canal) => filas.find((f) => f.cliente_id === clienteId && f.grupo === grupo && f.canal === canal)?.total_con_iva;
  const valores = {};
  for (const g of grupos) {
    for (const canal of CANALES) {
      if (g.tasas[canal] == null) continue;
      let v = monto(g.id, canal);
      if (v == null && g.miembros.length > 1) {
        const partes = g.miembros.map((m) => monto(m, canal));
        if (partes.every((p) => p != null)) v = partes.reduce((s, p) => s + p, 0);
      }
      if (v != null) valores[`${g.id}|${canal}`] = v;
    }
  }
  return valores;
}

// Lo que hay que cargar de un cliente en un mes para cobrarle la comisión al mes siguiente: un
// casillero por grupo de locales y canal que cobra, con su tasa y lo cargado (null si falta). Usa el
// acuerdo y los locales de ese mes, igual que la liquidación. Recibe un cliente ya normalizado.
export function casillerosDeVentas(cliente, periodo, filas = []) {
  const acuerdo = acuerdoVigente(cliente, periodo);
  if (!acuerdo?.comision) return [];
  const grupos = gruposDeVentas(localesEn(cliente, periodo), acuerdo);
  const valores = ventasPorGrupo(filas.filter((f) => (f.periodo ?? periodo) === periodo), cliente.id, grupos);
  return grupos.flatMap((g) =>
    CANALES.filter((canal) => g.tasas[canal] != null).map((canal) => ({
      grupo: g.id,
      nombre: g.nombre,
      locales: g.locales,
      canal,
      tasa: g.tasas[canal],
      monto: valores[`${g.id}|${canal}`] ?? null,
    })),
  );
}

// Guarda las ventas de un cliente en un mes como se cargan en su cuenta: un monto por grupo y canal
// que cobra comisión (null o vacío = sin cargar). Reemplaza lo que había de esos grupos y canales,
// incluidos el total y lo separado por tipo de local de la marca, y deja todo lo demás como estaba.
export function reemplazarVentasCliente(filas, { clienteId, periodo, grupos, valores }) {
  const clave = (grupo, canal) => `${grupo}|${canal}`;
  const pisa = new Set();
  const nuevas = [];
  for (const g of grupos) {
    for (const canal of CANALES) {
      if (g.tasas[canal] == null) continue;
      for (const m of g.pagador === 'marca' ? ['todos', 'propios', 'franquiciados'] : [g.id]) pisa.add(clave(m, canal));
      const v = valores[clave(g.id, canal)];
      if (v != null && v !== '') nuevas.push({ cliente_id: clienteId, grupo: g.id, periodo, canal, total_con_iva: Number(v) });
    }
  }
  const quedan = filas.filter((f) => f.cliente_id !== clienteId || !pisa.has(clave(f.grupo, f.canal)));
  return [...quedan, ...nuevas];
}

// Suma filas nuevas a las de un mes: la de un mismo cliente, grupo y canal reemplaza a la que había.
// El total de todos los locales ('todos') y los de propios y franquiciados por separado también
// se reemplazan entre sí, para que un total viejo no tape ventas nuevas.
export function combinarVentas(actuales, nuevas) {
  const combinadas = new Map(actuales.map((v) => [clave(v), v]));
  for (const v of nuevas) {
    const pisa = v.grupo === 'todos' ? ['propios', 'franquiciados'] : ['propios', 'franquiciados'].includes(v.grupo) ? ['todos'] : [];
    for (const grupo of pisa) combinadas.delete(clave({ ...v, grupo }));
    combinadas.set(clave(v), v);
  }
  return [...combinadas.values()];
}
