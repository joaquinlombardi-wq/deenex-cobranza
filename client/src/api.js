import { crearRepositorio } from './backend/repositorio.js';
import { crearStoreArtifact } from './backend/store-artifact.js';
import { crearStoreHttp } from './backend/store-http.js';

// `vite build --mode artifact` arma la versión publicada en claude.ai; el resto usa la API Express.
const storePromesa = import.meta.env.MODE === 'artifact' ? crearStoreArtifact() : Promise.resolve(crearStoreHttp());
const repositorioPromesa = storePromesa.then(crearRepositorio);

// Cada función espera al store y delega en el repositorio.
export const api = new Proxy(
  {},
  { get: (_, nombre) => async (...args) => (await repositorioPromesa)[nombre](...args) },
);
