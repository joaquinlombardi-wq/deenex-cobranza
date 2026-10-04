import { Router } from 'express';
import { liquidarCliente, ErrorLiquidacion } from '../engine/liquidar.js';
import { periodoAnterior } from '../engine/periodos.js';

export function crearApi(store) {
  const api = Router();

  api.get('/clientes', async (_req, res) => res.json(await store.listarClientes()));

  api.get('/clientes/:id', async (req, res) => {
    const c = await store.obtenerCliente(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(c);
  });

  api.post('/clientes', async (req, res) => res.status(201).json(await store.crearCliente(req.body)));

  api.put('/clientes/:id', async (req, res) => {
    const c = await store.actualizarCliente(req.params.id, req.body);
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(c);
  });

  // Simula la liquidación de un cliente sin guardarlo (para validar el alta).
  api.post('/simular', (req, res) => {
    const { cliente, periodo, mep, ipc } = req.body;
    try {
      res.json(liquidarCliente(cliente, { periodo, mep, ipc, ventas: [] }));
    } catch (e) {
      if (!(e instanceof ErrorLiquidacion)) throw e;
      res.status(422).json({ error: e.message });
    }
  });

  // Carga de ventas desde la plataforma (upsert por local x periodo x canal).
  api.post('/ventas', async (req, res) => {
    const filas = Array.isArray(req.body) ? req.body : [req.body];
    await store.cargarVentas(filas);
    res.json({ cargadas: filas.length });
  });

  api.get('/ventas', async (req, res) => res.json(await store.listarVentas(req.query.periodo)));

  // Liquida todos los clientes para un periodo: { periodo, mep, ipc }.
  api.post('/liquidaciones', async (req, res) => {
    const { periodo, mep, ipc } = req.body;
    const clientes = await store.listarClientes();
    const ventas = await store.listarVentas(periodoAnterior(periodo));
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

  api.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message });
  });

  return api;
}
