// Store de documentos del servidor: misma forma que la base del artifact de claude.ai
// (rutas 'coleccion/id'), así el frontend usa la misma lógica con cualquiera de los dos.
import mongoose from 'mongoose';

export { validarRuta } from './rutas.js';

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

// Atlas da la dirección sin nombre de base y Mongo usaría "test": en ese caso va a "cobranza".
export const nombreDeBase = (uri) => (/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri) ? undefined : 'cobranza');

export async function crearDocumentosMongo(uri) {
  const dbName = nombreDeBase(uri);
  await mongoose.connect(uri, { ...(dbName && { dbName }), serverSelectionTimeoutMS: 15000 });
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
