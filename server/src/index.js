import { fileURLToPath } from 'node:url';
import { crearApp } from './app.js';
import { crearDocumentosMongo, crearDocumentosMemoria } from './store/documentos.js';
import { documentosDemo } from './demo.js';
import { limpiarDireccion, queRevisar, sinComillas } from './store/direccionMongo.js';

const PORT = process.env.PORT ?? 4000;
// Los valores se pegan a mano en Render: se perdonan las comillas, los espacios y los < > de Atlas.
const MONGODB_URI = limpiarDireccion(process.env.MONGODB_URI ?? '');
const APP_CLAVE = sinComillas(process.env.APP_CLAVE ?? '');
const APP_USUARIO = sinComillas(process.env.APP_USUARIO ?? '') || 'deenex';

// Con una base real la app queda en internet: sin clave no arranca.
if (MONGODB_URI && !APP_CLAVE) {
  console.error('Falta APP_CLAVE: con MONGODB_URI la app no arranca sin una clave para entrar.');
  process.exit(1);
}

// Sin MONGODB_URI arranca en modo demo, en memoria y con clientes de ejemplo.
let docs;
try {
  docs = MONGODB_URI ? await crearDocumentosMongo(MONGODB_URI) : crearDocumentosMemoria(documentosDemo());
} catch (e) {
  console.error(`No pude conectarme a MongoDB: ${e.message}`);
  console.error(queRevisar(e, MONGODB_URI));
  process.exit(1);
}

const app = crearApp({
  docs,
  usuario: APP_USUARIO,
  clave: APP_CLAVE || null,
  dist: fileURLToPath(new URL('../../client/dist', import.meta.url)),
  // Con la base real trae el dólar y el IPC solo, una vez por día; en el modo demo, solo con el botón.
  diaria: Boolean(MONGODB_URI),
});

app.listen(PORT, () =>
  console.log(`Cobranza en http://localhost:${PORT} (${MONGODB_URI ? 'MongoDB' : 'modo demo en memoria'}${APP_CLAVE ? ', con clave' : ''})`),
);
