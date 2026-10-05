// Ventas por cliente, grupo de locales, mes y canal: { cliente_id, grupo, periodo, canal, total_con_iva }.

const clave = (v) => `${v.cliente_id}|${v.grupo}|${v.canal}`;

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
