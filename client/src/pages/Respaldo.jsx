import { useEffect, useRef, useState } from 'react';
import Icono from '../Iconos.jsx';
import { api } from '../api.js';
import { puedeDescargar, ofrecerArchivo } from '../descargas.js';
import { resumenRespaldo } from '../backend/repositorio.js';
import { hoyLocal, fechaHora } from '../formato.js';

const contar = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// "6 clientes, 1 cierre, 6 cargos en cuentas corrientes y 2 pagos, más el dólar y el IPC"
function textoResumen({ cantidades: c }) {
  const partes = [
    contar(c.clientes, 'cliente', 'clientes'),
    contar(c.cierres, 'cierre', 'cierres'),
    contar(c.cargos, 'cargo en cuentas corrientes', 'cargos en cuentas corrientes'),
    contar(c.pagos, 'pago', 'pagos'),
  ];
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}${c.cotizaciones ? ', más el dólar y el IPC' : ''}`;
}

// Bajar todo lo guardado en un archivo, y cargar ese archivo en una base vacía (así se pasan los
// datos de la versión de claude.ai a la del servidor).
export default function Respaldo({ onCargado, onIrClientes }) {
  const [descargable, setDescargable] = useState(null);
  const [ocupadas, setOcupadas] = useState(null);
  const [bajando, setBajando] = useState(false);
  const [nota, setNota] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargado, setCargado] = useState(null);
  const [error, setError] = useState(null);
  const entrada = useRef(null);

  useEffect(() => {
    let vigente = true;
    puedeDescargar().then((si) => vigente && setDescargable(si));
    api.coleccionesConDatos()
      .then((c) => vigente && setOcupadas(c))
      .catch((e) => vigente && setError(`No pude revisar la base: ${e.message}`));
    return () => { vigente = false; };
  }, []);

  async function bajar() {
    setNota(null);
    setBajando(true);
    try {
      const respaldo = await api.respaldo();
      const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' });
      const r = await ofrecerArchivo(blob, `respaldo-cobranza-${hoyLocal()}.json`, 'el respaldo');
      if (r.estado === 'guardado') setNota({ tipo: 'ok', texto: `Listo: ${r.archivo}, con ${textoResumen(resumenRespaldo(respaldo))}.` });
    } catch (e) {
      setNota({ tipo: 'error', texto: e.message });
    } finally {
      setBajando(false);
    }
  }

  async function elegir(ev) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    setError(null);
    setElegido(null);
    if (!archivo) return;
    try {
      const respaldo = JSON.parse(await archivo.text());
      setElegido({ nombre: archivo.name, respaldo, resumen: resumenRespaldo(respaldo) });
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Ese archivo no es un respaldo de Deenex Cobranza.' : e.message);
    }
  }

  async function cargar() {
    setError(null);
    setCargando(true);
    try {
      setCargado(await api.restaurarRespaldo(elegido.respaldo));
      setElegido(null);
      onCargado?.();
    } catch (e) {
      const cortada = !/otros datos/.test(e.message);
      setError(`No se cargó todo: ${e.message}${cortada ? '. Volvé a cargar el mismo archivo y sigue donde quedó.' : ''}`);
    } finally {
      setCargando(false);
    }
  }

  return (
    <section>
      <h1>Respaldo</h1>
      <p className="ayuda">
        Un archivo con todo lo guardado: clientes, cierres, cuentas corrientes, pagos, ventas, dólar e IPC. Sirve para tener una copia
        o para pasar los datos a otra versión de la app.
      </p>

      <div className="panel">
        <h2>Bajar un respaldo</h2>
        <p className="ayuda nota">Bajarlo no cambia nada de lo guardado.</p>
        {descargable === false ? (
          <p className="cuit">Esta vista no permite descargar archivos.</p>
        ) : (
          <div className="boton-excel bajar-respaldo">
            <button className="primario con-icono" onClick={bajar} disabled={bajando || descargable === null}>
              <Icono nombre="descargar" tamano={18} />
              {bajando ? 'Armando el respaldo…' : 'Bajar respaldo'}
            </button>
            {nota && <span className={`nota-descarga ${nota.tipo}`} role="status">{nota.texto}</span>}
          </div>
        )}
      </div>

      <div className="panel cargar-respaldo">
        <h2>Cargar un respaldo</h2>
        {cargado ? (
          <>
            <div className="alerta ok">Listo: cargué {textoResumen(cargado)}.</div>
            <button className="primario" onClick={onIrClientes}>Ver los clientes</button>
          </>
        ) : ocupadas === null ? (
          !error && <p className="ayuda nota">Revisando la base…</p>
        ) : ocupadas.length ? (
          <p className="ayuda nota">
            Esta base ya tiene datos, así que acá no se carga un respaldo: se mezclarían dos bases. Se carga en una base vacía, como la de la
            versión nueva recién instalada.
          </p>
        ) : (
          <>
            <p className="ayuda nota">Esta base está vacía. Para traer tus datos, en la app de antes tocá «Bajar respaldo» y elegí acá ese archivo.</p>
            <input ref={entrada} type="file" accept=".json,application/json" onChange={elegir} hidden />
            <button className="secundario con-icono" onClick={() => entrada.current?.click()} disabled={cargando}>
              <Icono nombre="respaldo" tamano={18} />
              Elegir el archivo
            </button>
            {elegido && (
              <div className="vista-previa">
                <p>
                  <strong>{elegido.nombre}</strong>
                  {elegido.resumen.creadoEn && `, del ${fechaHora(elegido.resumen.creadoEn)}`}: {textoResumen(elegido.resumen)}.
                </p>
                <div className="botones sin-margen">
                  <button className="primario" onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Cargar estos datos'}</button>
                  <button className="secundario" onClick={() => setElegido(null)} disabled={cargando}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}
        {error && <div className="alerta error">{error}</div>}
      </div>
    </section>
  );
}
