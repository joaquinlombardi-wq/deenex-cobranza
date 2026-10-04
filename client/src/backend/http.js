// Backend contra la API Express (desarrollo local y despliegue con MongoDB).
async function pedir(metodo, url, cuerpo) {
  const res = await fetch(`/api${url}`, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json();
  if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`);
  return datos;
}

export const api = {
  estado: async () => ({ guardaDatos: true }),
  clientes: () => pedir('GET', '/clientes'),
  crearCliente: (c) => pedir('POST', '/clientes', c),
  actualizarCliente: (c) => pedir('PUT', `/clientes/${c.id}`, c),
  simular: (cuerpo) => pedir('POST', '/simular', cuerpo),
  liquidar: (cuerpo) => pedir('POST', '/liquidaciones', cuerpo),
  ventas: (periodo) => pedir('GET', `/ventas?periodo=${periodo}`),
  guardarVentas: (_periodo, filas) => pedir('POST', '/ventas', filas),
  ipc: () => pedir('GET', '/ipc'),
  guardarIpc: (valores) => pedir('PUT', '/ipc', valores),
  cierre: (periodo) => pedir('GET', `/cierres/${periodo}`),
};
