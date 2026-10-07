// El servidor: la API y la app ya armada (client/dist), todo detrás de usuario y clave cuando se
// configuran. index.js lo arranca; las pruebas lo usan con una base en memoria.
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { crearApi } from './routes/api.js';
import { pedirClave } from './clave.js';
import { actualizarEnBase, traerFuentes } from './cotizaciones/actualizar.js';
import { crearActualizacionDiaria } from './cotizaciones/diaria.js';

/**
 * @param docs      la base de documentos (Mongo o memoria)
 * @param clave     sin clave no pide nada (para probar en la compu)
 * @param dist      carpeta con la app armada; si no está, sirve solo la API
 * @param diaria    trae el dólar y el IPC la primera vez que se usa la app cada día
 * @param traer     de dónde salen el dólar y el IPC (las pruebas pasan uno falso)
 */
export function crearApp({ docs, usuario = 'deenex', clave = null, dist = null, diaria = false, traer = traerFuentes }) {
  // Las actualizaciones de dólar e IPC van de a una: la del día y la del botón pueden coincidir.
  let cola = Promise.resolve();
  const actualizar = (pedido) => {
    const corrida = cola.then(() => actualizarEnBase(docs, { pedido, traer }));
    cola = corrida.catch(() => {});
    return corrida;
  };

  const app = express();
  app.disable('x-powered-by');
  if (clave) app.use(pedirClave({ usuario, clave, libres: ['/api/salud'] }));
  if (diaria) {
    const alUsar = crearActualizacionDiaria({ docs, actualizar });
    app.use((req, _res, next) => {
      if (req.path !== '/api/salud') alUsar();
      next();
    });
  }
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', crearApi(docs, { actualizar }));
  if (dist && existsSync(join(dist, 'index.html'))) app.use(express.static(dist));
  return app;
}
