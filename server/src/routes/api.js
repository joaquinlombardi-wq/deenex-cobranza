import { Router } from 'express';
import { validarRuta } from '../store/rutas.js';
import { actualizarEnBase } from '../cotizaciones/actualizar.js';
import { combinarVentas } from '../engine/ventas.js';

// `actualizar(pedido)` trae el dólar y el IPC y los guarda; la app lo pasa para que las corridas no se pisen.
export function crearApi(docs, { actualizar = (pedido) => actualizarEnBase(docs, { pedido }) } = {}) {
  const api = Router();

  api.get('/salud', (_req, res) => res.json({ ok: true }));

  // Documentos genéricos: los usa el frontend (misma forma que la base del artifact).
  api.get('/docs/:coleccion', async (req, res) => {
    validarRuta(req.params.coleccion, 1);
    res.json(await docs.list(req.params.coleccion, Object.entries(req.query)));
  });

  api.get('/docs/:coleccion/:id', async (req, res) => {
    const path = `${req.params.coleccion}/${req.params.id}`;
    validarRuta(path, 2);
    const data = await docs.get(path);
    if (!data) return res.status(404).json({ error: 'No existe' });
    res.json(data);
  });

  api.put('/docs/:coleccion/:id', async (req, res) => {
    const path = `${req.params.coleccion}/${req.params.id}`;
    validarRuta(path, 2);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'El documento tiene que ser un objeto JSON' });
    }
    await docs.set(path, req.body);
    res.json(req.body);
  });

  api.delete('/docs/:coleccion/:id', async (req, res) => {
    const path = `${req.params.coleccion}/${req.params.id}`;
    validarRuta(path, 2);
    await docs.delete(path);
    res.status(204).end();
  });

  // Integración con la plataforma Deenex: una fila (o un array) por cliente x grupo de locales x mes x canal.
  // Se suma a lo que ya haya en ventas/<periodo> (ver combinarVentas).
  api.post('/ventas', async (req, res) => {
    const filas = Array.isArray(req.body) ? req.body : [req.body];
    const porPeriodo = new Map();
    for (const f of filas) {
      const valida = f?.cliente_id && f?.grupo && /^\d{4}-\d{2}$/.test(f.periodo) && ['delivery', 'takeaway'].includes(f.canal)
        && typeof f.total_con_iva === 'number' && f.total_con_iva >= 0;
      if (!valida) {
        return res.status(400).json({
          error: `Fila inválida: ${JSON.stringify(f)}. Cada fila lleva cliente_id, grupo (propios, franquiciados, todos o el id del franquiciado), periodo AAAA-MM, canal (delivery o takeaway) y total_con_iva.`,
        });
      }
      if (!porPeriodo.has(f.periodo)) porPeriodo.set(f.periodo, []);
      porPeriodo.get(f.periodo).push(f);
    }
    for (const [periodo, nuevas] of porPeriodo) {
      const actual = (await docs.get(`ventas/${periodo}`))?.filas ?? [];
      await docs.set(`ventas/${periodo}`, { periodo, filas: combinarVentas(actual, nuevas), actualizado: new Date().toISOString() });
    }
    res.json({ cargadas: filas.length });
  });

  // Trae el MEP de dolarhoy, el IPC del INDEC y el historial de ArgentinaDatos, y lo guarda (lo mismo
  // que hace la tarea programada en la versión de claude.ai). `{ pedido: 'boton' }` pisa el MEP del día.
  api.post('/cotizaciones/actualizar', async (req, res) => {
    res.json(await actualizar(req.body?.pedido === 'boton' ? 'boton' : 'automatico'));
  });

  api.use((err, _req, res, _next) => {
    if (!err.status) console.error(err);
    res.status(err.status ?? 500).json({ error: err.message });
  });

  return api;
}
