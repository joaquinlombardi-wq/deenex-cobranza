import { api as http } from './backend/http.js';
import { api as artifact } from './backend/artifact.js';

// `vite build --mode artifact` arma la versión publicada en claude.ai; el resto usa la API Express.
export const api = import.meta.env.MODE === 'artifact' ? artifact : http;
