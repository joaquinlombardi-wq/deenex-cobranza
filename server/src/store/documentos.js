// Store de documentos del servidor: misma forma que la base del artifact de claude.ai
// (rutas 'coleccion/id'), así el frontend usa la misma lógica con cualquiera de los dos.
import mongoose from 'mongoose';

const SEGMENTO = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

export function validarRuta(path, segmentos) {
  const partes = path.split('/');
  if (partes.length !== segmentos || !partes.every((p) => SEGMENTO.test(p) && p !== '.' && p !== '..')) {
    throw Object.assign(new Error(`Ruta inválida: ${path}`), { status: 400 });
  }
  return partes;
}

const coincide = (data, filtros) => filtros.every(([campo, valor]) => String(data?.[campo]) === String(valor));

export function crearDocumentosMemoria(semilla = []) {
  const docs = new Map(semilla.map(({ path, data }) => [path, structuredClone(data)]));
  return {
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

export async function crearDocumentosMongo(uri) {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('documentos');
  await col.createIndex({ coleccion: 1 });
  return {
    async get(path) { return (await col.findOne({ _id: path }))?.data ?? null; },
    async set(path, data) {
      const [coleccion, id] = path.split('/');
      await col.replaceOne({ _id: path }, { _id: path, coleccion, id, data, actualizado: new Date() }, { upsert: true });
    },
    async delete(path) { await col.deleteOne({ _id: path }); },
    async list(coleccion, filtros = []) {
      const filtro = { coleccion };
      for (const [campo, valor] of filtros) filtro[`data.${campo}`] = valor;
      return (await col.find(filtro).toArray()).map((d) => ({ id: d.id, data: d.data }));
    },
  };
}
