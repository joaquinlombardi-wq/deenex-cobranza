// Store de documentos sobre la base del artifact de claude.ai (capability `db`).
// Si esta vista no tiene base (vista previa, sin sesión), guarda en memoria y lo avisa.

function storeMemoria() {
  const docs = new Map();
  const coincide = (data, filtros) => filtros.every(([campo, , valor]) => data?.[campo] === valor);
  return {
    guardaDatos: false,
    async get(path) { return docs.has(path) ? structuredClone(docs.get(path)) : null; },
    async set(path, data) { docs.set(path, structuredClone(data)); },
    async delete(path) { docs.delete(path); },
    async list(coleccion, filtros = []) {
      return [...docs]
        .filter(([p, d]) => p.startsWith(`${coleccion}/`) && p.split('/').length === 2 && coincide(d, filtros))
        .map(([p, d]) => ({ id: p.split('/')[1], data: structuredClone(d) }));
    },
  };
}

// Reintenta una vez los cortes momentáneos de la base, como pide la plataforma.
async function conReintento(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code !== 'unavailable') throw e;
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    return fn();
  }
}

export async function crearStoreArtifact() {
  const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
  if (!db) return storeMemoria();
  const limpio = (data) => JSON.parse(JSON.stringify(data));
  return {
    guardaDatos: true,
    async get(path) {
      const snap = await conReintento(() => db.doc(path).get());
      return snap.exists ? snap.data() : null;
    },
    set: (path, data) => conReintento(() => db.doc(path).set(limpio(data))),
    delete: (path) => conReintento(() => db.doc(path).delete()),
    async list(coleccion, filtros = []) {
      let q = db.collection(coleccion);
      for (const [campo, op, valor] of filtros) q = q.where(campo, op, valor);
      const snap = await conReintento(() => q.limit(1000).get());
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
  };
}
