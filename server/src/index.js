import express from 'express';
import { crearApi } from './routes/api.js';
import { crearStoreMongo } from './store/mongo.js';
import { crearStoreMemoria } from './store/memoria.js';
import { datosDemo } from './demo.js';

const PORT = process.env.PORT ?? 4000;
const { MONGODB_URI } = process.env;

// Sin MONGODB_URI arranca en modo demo, en memoria y con clientes de ejemplo.
const store = MONGODB_URI ? await crearStoreMongo(MONGODB_URI) : crearStoreMemoria(datosDemo());

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', crearApi(store));

app.listen(PORT, () =>
  console.log(`API de cobranza en http://localhost:${PORT} (${MONGODB_URI ? 'MongoDB' : 'modo demo en memoria'})`),
);
