import { Router } from 'express';
import { validarRuta } from '../store/documentos.js';
import { traerCotizaciones, documentosCotizaciones } from '../cotizaciones/fuentes.js';

export function crearApi(docs) {
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

  // Integración con la plataforma Deenex: una fila (o un array) por local x mes x canal.
  // Se suma a lo que ya haya en ventas/<periodo>, reemplazando local x canal repetidos.
  api.post('/ventas', async (req, res) => {
    const filas = Array.isArray(req.body) ? req.body : [req.body];
    const porPeriodo = new Map();
    for (const f of filas) {
      if (!f?.local_id || !/^\d{4}-\d{2}$/.test(f.periodo) || !['delivery', 'takeaway'].includes(f.canal) || typeof f.total_con_iva !== 'number') {
        return res.status(400).json({ error: `Fila inválida: ${JSON.stringify(f)}` });
      }
      if (!porPeriodo.has(f.periodo)) porPeriodo.set(f.periodo, []);
      porPeriodo.get(f.periodo).push(f);
    }
    for (const [periodo, nuevas] of porPeriodo) {
      const actual = (await docs.get(`ventas/${periodo}`))?.filas ?? [];
      const clave = (v) => `${v.local_id}|${v.canal}`;
      const combinadas = new Map(actual.map((v) => [clave(v), v]));
      for (const v of nuevas) combinadas.set(clave(v), v);
      await docs.set(`ventas/${periodo}`, { periodo, filas: [...combinadas.values()], actualizado: new Date().toISOString() });
    }
    res.json({ cargadas: filas.length });
  });

  // Trae el historial de dólar MEP e IPC de las fuentes públicas y lo guarda.
  api.post('/cotizaciones/actualizar', async (_req, res) => {
    const documentos = documentosCotizaciones(await traerCotizaciones());
    for (const { path, data } of documentos) await docs.set(path, data);
    res.json({ documentos: documentos.map((d) => ({ path: d.path, valores: Object.keys(d.data.valores).length })) });
  });

  api.use((err, _req, res, _next) => {
    if (!err.status) console.error(err);
    res.status(err.status ?? 500).json({ error: err.message });
  });

  return api;
}
