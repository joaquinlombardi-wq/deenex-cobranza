import mongoose from 'mongoose';
import { Cliente } from '../models/Cliente.js';
import { Venta } from '../models/Venta.js';

export async function crearStoreMongo(uri) {
  await mongoose.connect(uri);
  const parametros = mongoose.connection.collection('parametros');
  const cierres = mongoose.connection.collection('cierres');
  return {
    listarClientes: () => Cliente.find().sort({ nombre: 1 }).lean(),
    obtenerCliente: (id) => Cliente.findOne({ id }).lean(),
    crearCliente: async (datos) => (await Cliente.create(datos)).toObject(),
    actualizarCliente: (id, datos) => Cliente.findOneAndUpdate({ id }, datos, { new: true, runValidators: true }).lean(),
    cargarVentas: (filas) =>
      Venta.bulkWrite(
        filas.map((f) => ({
          updateOne: { filter: { local_id: f.local_id, periodo: f.periodo, canal: f.canal }, update: { $set: f }, upsert: true },
        })),
      ),
    listarVentas: (periodo) => Venta.find(periodo ? { periodo } : {}).lean(),
    obtenerIpc: async () => (await parametros.findOne({ _id: 'ipc' }))?.valores ?? {},
    guardarIpc: (valores) => parametros.updateOne({ _id: 'ipc' }, { $set: { valores } }, { upsert: true }),
    obtenerCierre: (periodo) => cierres.findOne({ _id: periodo }, { projection: { _id: 0 } }),
    guardarCierre: (cierre) => cierres.replaceOne({ _id: cierre.periodo }, cierre, { upsert: true }),
  };
}
