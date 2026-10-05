// Store de documentos contra la API Express (/api/docs), para la versión con servidor y MongoDB.
async function pedir(metodo, url, cuerpo) {
  const res = await fetch(`/api${url}`, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (res.status === 404 && metodo === 'GET') return null;
  const datos = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(datos?.error ?? `Error ${res.status}`);
  return datos;
}

export function crearStoreHttp() {
  return {
    guardaDatos: true,
    get: (path) => pedir('GET', `/docs/${path}`),
    set: (path, data) => pedir('PUT', `/docs/${path}`, data),
    delete: (path) => pedir('DELETE', `/docs/${path}`),
    list: async (coleccion, filtros = []) => {
      const q = new URLSearchParams(filtros.map(([campo, , valor]) => [campo, valor])).toString();
      return (await pedir('GET', `/docs/${coleccion}${q ? `?${q}` : ''}`)) ?? [];
    },
  };
}
