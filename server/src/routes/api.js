import { Router } from 'express';
import { Cliente } from '../models/Cliente.js';
import { Venta } from '../models/Venta.js';
import { liquidarCliente, ErrorLiquidacion } from '../engine/liquidar.js';

export const api = Router();

api.get('/clientes', async (_req, res) => {
  res.json(await Cliente.find().sort({ nombre: 1 }).lean());
});

api.post('/clientes', async (req, res) => {
  res.status(201).json(await Cliente.create(req.body));
});

api.put('/clientes/:id', async (req, res) => {
  const c = await Cliente.findOneAndUpdate({ id: req.params.id }, req.body, { new: true, runValidators: true });
  if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(c);
});

// Carga de ventas desde la plataforma (upsert por local x periodo x canal).
api.post('/ventas', async (req, res) => {
  const filas = Array.isArray(req.body) ? req.body : [req.body];
  await Venta.bulkWrite(
    filas.map((f) => ({
      updateOne: { filter: { local_id: f.local_id, periodo: f.periodo, canal: f.canal }, update: { $set: f }, upsert: true },
    })),
  );
  res.json({ cargadas: filas.length });
});

// Liquida todos los clientes para un periodo: { periodo, mep, ipc }.
api.post('/liquidaciones', async (req, res) => {
  const { periodo, mep, ipc } = req.body;
  const clientes = await Cliente.find().lean();
  const ventas = await Venta.find().lean();
  const resultados = clientes.map((c) => {
    try {
      return liquidarCliente(c, { periodo, mep, ipc, ventas });
    } catch (e) {
      if (!(e instanceof ErrorLiquidacion)) throw e;
      return { cliente: { id: c.id, nombre: c.nombre }, periodo, error: e.message, liquidaciones: [], avisos: [] };
    }
  });
  res.json(resultados);
});
