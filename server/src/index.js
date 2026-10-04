import express from 'express';
import mongoose from 'mongoose';
import { api } from './routes/api.js';

const PORT = process.env.PORT ?? 4000;
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/deenex-cobranza';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', api);

await mongoose.connect(MONGODB_URI);
app.listen(PORT, () => console.log(`API de cobranza en http://localhost:${PORT}`));
