import mongoose from 'mongoose';
import { Cliente } from '../models/Cliente.js';
import { Venta } from '../models/Venta.js';

export async function crearStoreMongo(uri) {
  await mongoose.connect(uri);
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
  };
}
