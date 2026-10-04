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
  clientes: () => pedir('GET', '/clientes'),
  crearCliente: (c) => pedir('POST', '/clientes', c),
  actualizarCliente: (c) => pedir('PUT', `/clientes/${c.id}`, c),
  simular: (cuerpo) => pedir('POST', '/simular', cuerpo),
  liquidar: (cuerpo) => pedir('POST', '/liquidaciones', cuerpo),
};
