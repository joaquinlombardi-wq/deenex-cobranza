import { useEffect, useState } from 'react';
import Icono from './Iconos.jsx';
import { descargarExcelContador, puedeDescargar } from './excel.js';

// Botón que arma y ofrece el Excel para el contador de un cierre.
export default function BotonExcel({ cierre, clase = 'primario', texto = 'Descargar Excel' }) {
  const [disponible, setDisponible] = useState(null);
  const [armando, setArmando] = useState(false);
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    let vigente = true;
    puedeDescargar().then((si) => vigente && setDisponible(si));
    return () => { vigente = false; };
  }, []);

  async function descargar() {
    setEstado(null);
    setArmando(true);
    try {
      const r = await descargarExcelContador(cierre);
      if (r.estado === 'guardado') setEstado({ tipo: 'ok', texto: `Listo: ${r.archivo}` });
    } catch (e) {
      setEstado({ tipo: 'error', texto: e.message });
    } finally {
      setArmando(false);
    }
  }

  if (disponible === false) return null;
  return (
    <div className="boton-excel">
      <button className={`${clase} con-icono`} onClick={descargar} disabled={armando}>
        <Icono nombre="descargar" tamano={18} />
        {armando ? 'Armando el Excel…' : texto}
      </button>
      {estado && <span className={`nota-descarga ${estado.tipo}`} role="status">{estado.texto}</span>}
    </div>
  );
}
