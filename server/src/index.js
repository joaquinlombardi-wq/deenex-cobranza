import { fileURLToPath } from 'node:url';
import { crearApp } from './app.js';
import { crearDocumentosMongo, crearDocumentosMemoria } from './store/documentos.js';
import { documentosDemo } from './demo.js';

const PORT = process.env.PORT ?? 4000;
const { MONGODB_URI, APP_CLAVE, APP_USUARIO = 'deenex' } = process.env;

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
  console.error('Revisá MONGODB_URI (usuario y contraseña incluidos) y que en Atlas, Network Access, esté permitida la entrada desde 0.0.0.0/0.');
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
