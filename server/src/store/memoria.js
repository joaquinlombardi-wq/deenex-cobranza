// Store en memoria para probar el sistema sin MongoDB (modo demo). Se pierde al reiniciar.
export function crearStoreMemoria({ clientes = [], ventas = [] } = {}) {
  const datos = { clientes: structuredClone(clientes), ventas: structuredClone(ventas), ipc: {}, cierres: new Map() };
  const clave = (v) => `${v.local_id}|${v.periodo}|${v.canal}`;
  return {
    listarClientes: async () => [...datos.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    obtenerCliente: async (id) => datos.clientes.find((c) => c.id === id) ?? null,
    crearCliente: async (cliente) => {
      if (datos.clientes.some((c) => c.id === cliente.id)) throw Object.assign(new Error('Ya existe un cliente con ese id'), { status: 409 });
      datos.clientes.push(cliente);
      return cliente;
    },
    actualizarCliente: async (id, cliente) => {
      const i = datos.clientes.findIndex((c) => c.id === id);
      if (i === -1) return null;
      datos.clientes[i] = { ...cliente, id };
      return datos.clientes[i];
    },
    cargarVentas: async (filas) => {
      const porClave = new Map(datos.ventas.map((v) => [clave(v), v]));
      for (const f of filas) porClave.set(clave(f), f);
      datos.ventas = [...porClave.values()];
    },
    listarVentas: async (periodo) => datos.ventas.filter((v) => !periodo || v.periodo === periodo),
    obtenerIpc: async () => datos.ipc,
    guardarIpc: async (valores) => { datos.ipc = valores; },
    obtenerCierre: async (periodo) => datos.cierres.get(periodo) ?? null,
    guardarCierre: async (cierre) => { datos.cierres.set(cierre.periodo, cierre); },
  };
}
