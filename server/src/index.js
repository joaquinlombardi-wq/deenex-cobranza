import express from 'express';
import { crearApi } from './routes/api.js';
import { crearDocumentosMongo, crearDocumentosMemoria } from './store/documentos.js';
import { documentosDemo } from './demo.js';

const PORT = process.env.PORT ?? 4000;
const { MONGODB_URI } = process.env;

// Sin MONGODB_URI arranca en modo demo, en memoria y con clientes de ejemplo.
const docs = MONGODB_URI ? await crearDocumentosMongo(MONGODB_URI) : crearDocumentosMemoria(documentosDemo());

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', crearApi(docs));

app.listen(PORT, () =>
  console.log(`API de cobranza en http://localhost:${PORT} (${MONGODB_URI ? 'MongoDB' : 'modo demo en memoria'})`),
);
