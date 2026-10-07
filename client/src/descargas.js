// Ofrecer un archivo para bajar. En claude.ai pasa por la capability `downloads` (la persona
// confirma); en la versión con servidor, por el navegador.
const enArtifact = import.meta.env.MODE === 'artifact';

let descargas = null;
const capacidadDescargas = () => {
  descargas ??= window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  return descargas;
};

// Si esta vista puede ofrecer archivos para bajar (si no, el botón no se muestra).
export const puedeDescargar = () => (enArtifact ? capacidadDescargas().then(Boolean) : Promise.resolve(true));

function descargaDelNavegador(blob, archivo) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: archivo });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Ofrece el archivo. Devuelve { estado: 'guardado' | 'cancelado', archivo }; `que` lo nombra en los errores.
export async function ofrecerArchivo(blob, archivo, que = 'el archivo') {
  if (!enArtifact) {
    descargaDelNavegador(blob, archivo);
    return { estado: 'guardado', archivo };
  }
  const d = await capacidadDescargas();
  if (!d) throw new Error('Esta vista no permite descargar archivos.');
  try {
    await d.save({ filename: archivo, data: blob });
    return { estado: 'guardado', archivo };
  } catch (e) {
    if (e?.code === 'declined') return { estado: 'cancelado', archivo };
    if (e?.code === 'rate_limited') throw new Error('Ya hay una descarga esperando que la confirmes.');
    throw new Error(`No pude descargar ${que}: ${e?.message || e?.code || 'error desconocido'}.`);
  }
}
