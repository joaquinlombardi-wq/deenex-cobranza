import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { firmaCierre } from '../backend/repositorio.js';
import { compararPeriodos } from '../../../server/src/engine/periodos.js';
import { D } from '../../../server/src/engine/dinero.js';
import { pesos, numero, nombrePeriodo, fechaCorta, fechaHora } from '../formato.js';
import Liquidacion from './Liquidacion.jsx';
import BotonExcel from '../BotonExcel.jsx';

const sumar = (montos) => montos.reduce((s, v) => s.plus(v ?? 0), D(0)).toNumber();

const ESTADOS = {
  pasado: { texto: 'En cuentas corrientes', clase: 'ok' },
  generado: { texto: 'Generado, sin pasar', clase: 'aviso' },
  cambio: { texto: 'Cambió después de pasarlo', clase: 'aviso' },
  excel: { texto: 'Importado del Excel', clase: 'neutro' },
};

function deCierre(c) {
  const clientes = c.resultados
    .map((r) => ({
      id: r.cliente.id,
      nombre: r.cliente.nombre,
      liquidaciones: r.liquidaciones,
      avisos: [...(r.error ? [r.error] : []), ...r.avisos],
      total: sumar(r.liquidaciones.map((l) => l.totales.netoArs)),
    }))
    .filter((x) => x.liquidaciones.length || x.avisos.length);
  const estado = !c.confirmado ? 'generado' : c.confirmado.firma === firmaCierre(c.resultados) ? 'pasado' : 'cambio';
  return { periodo: c.periodo, estado, cierre: c, mep: c.mep, fechaMep: c.fechaMep, cuando: c.generadoEn, clientes, total: sumar(clientes.map((x) => x.total)) };
}

// Un mes importado del Excel del contador: cada factura se muestra como la liquidación de un pagador.
function deImportado(f) {
  const porCliente = new Map();
  for (const r of f.renglones ?? []) {
    const cliente = porCliente.get(r.clienteId) ?? { id: r.clienteId, nombre: r.clienteNombre, facturas: new Map() };
    const clave = r.factura ?? r.clienteExcel;
    const factura = cliente.facturas.get(clave) ?? {
      pagador: { id: clave, tipo: 'marca', nombre: r.factura ? `${r.factura} · ${r.clienteExcel}` : r.clienteExcel },
      renglones: [],
    };
    factura.renglones.push(r);
    cliente.facturas.set(clave, factura);
    porCliente.set(r.clienteId, cliente);
  }
  const clientes = [...porCliente.values()].map((c) => {
    const liquidaciones = [...c.facturas.values()].map((x) => ({
      ...x,
      totales: {
        brutoArs: sumar(x.renglones.map((r) => r.brutoArs)),
        ivaArs: sumar(x.renglones.map((r) => r.ivaArs)),
        netoArs: sumar(x.renglones.map((r) => r.netoArs)),
      },
    }));
    return { id: c.id, nombre: c.nombre, liquidaciones, avisos: [], total: sumar(liquidaciones.map((l) => l.totales.netoArs)) };
  });
  return { periodo: f.periodo, estado: 'excel', mep: f.mep, cuando: f.importadoEn, clientes, total: sumar(clientes.map((x) => x.total)) };
}

// Cada mes, del cierre del sistema o, si no hay, de lo importado del Excel. Del más nuevo al más viejo.
function armarMeses({ cierres, importados }) {
  const meses = new Map();
  for (const f of importados) meses.set(f.periodo, deImportado(f));
  for (const c of cierres) if (c.resultados?.length) meses.set(c.periodo, deCierre(c));
  return [...meses.values()].sort((a, b) => compararPeriodos(b.periodo, a.periodo));
}

// Los mismos meses ordenados por cliente.
function armarClientes(meses) {
  const porCliente = new Map();
  for (const m of meses) {
    for (const c of m.clientes) {
      const x = porCliente.get(c.id) ?? { id: c.id, nombre: c.nombre, meses: [] };
      x.meses.push({ ...c, periodo: m.periodo, estado: m.estado });
      porCliente.set(c.id, x);
    }
  }
  return [...porCliente.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function ChipMes({ estado }) {
  const e = ESTADOS[estado];
  return <span className={`estado ${e.clase}`}>{e.texto}</span>;
}

// Renglón que se abre y se cierra: título a la izquierda, monto a la derecha.
function Desplegable({ abierto, onAlternar, titulo, detalle, chip, monto, children, clase = '' }) {
  return (
    <div className={`desplegable ${clase}${abierto ? ' abierto' : ''}`}>
      <button className="fila-desplegable" aria-expanded={abierto} onClick={onAlternar}>
        <span className="flecha">{abierto ? '▾' : '▸'}</span>
        <span className="titulo-desplegable">
          <strong>{titulo}</strong>
          {detalle && <span className="cuit">{detalle}</span>}
        </span>
        {chip}
        <span className="monto">{monto}</span>
      </button>
      {abierto && <div className="cuerpo-desplegable">{children}</div>}
    </div>
  );
}

function DetalleCliente({ cliente }) {
  return (
    <>
      {cliente.avisos.map((a, i) => <div className="alerta aviso" key={i}>{a}</div>)}
      {!cliente.liquidaciones.length && <p className="ayuda sin-margen">Sin cargos ese mes.</p>}
      {cliente.liquidaciones.map((l) => <Liquidacion key={l.pagador.id} liquidacion={l} />)}
    </>
  );
}

function Mes({ mes: m, onIrCierre }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <>
      <div className="datos-mes">
        <span className="cuit">
          {[
            m.mep ? `Dólar MEP ${numero(m.mep)}${m.fechaMep ? ` del ${fechaCorta(m.fechaMep)}` : ''}` : null,
            m.cuando && `${m.estado === 'excel' ? 'Importado' : 'Generado'} el ${fechaHora(m.cuando)}`,
          ].filter(Boolean).join(' · ')}
        </span>
        <div className="botones sin-margen">
          {m.cierre && <BotonExcel cierre={m.cierre} clase="secundario" texto="Excel para el contador" />}
          {m.cierre && <button className="secundario" onClick={() => onIrCierre(m.periodo)}>Abrir en Cierre del mes</button>}
        </div>
      </div>
      {m.clientes.map((c) => (
        <Desplegable
          key={c.id}
          clase="cliente-mes"
          abierto={abierto === c.id}
          onAlternar={() => setAbierto(abierto === c.id ? null : c.id)}
          titulo={c.nombre}
          detalle={[
            `${c.liquidaciones.length} ${c.liquidaciones.length === 1 ? 'factura' : 'facturas'}`,
            c.avisos.length && `${c.avisos.length} para revisar`,
          ].filter(Boolean).join(' · ')}
          monto={pesos(c.total)}
        >
          <DetalleCliente cliente={c} />
        </Desplegable>
      ))}
    </>
  );
}

function Cliente({ cliente }) {
  const [abierto, setAbierto] = useState(null);
  return cliente.meses.map((m) => (
    <Desplegable
      key={m.periodo}
      clase="cliente-mes"
      abierto={abierto === m.periodo}
      onAlternar={() => setAbierto(abierto === m.periodo ? null : m.periodo)}
      titulo={nombrePeriodo(m.periodo)}
      chip={<ChipMes estado={m.estado} />}
      monto={pesos(m.total)}
    >
      <DetalleCliente cliente={m} />
    </Desplegable>
  ));
}

export default function Historial({ onIrCierre }) {
  const [meses, setMeses] = useState(null);
  const [error, setError] = useState('');
  const [vista, setVista] = useState('mes');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    api.historial().then((h) => setMeses(armarMeses(h))).catch((e) => {
      setMeses([]);
      setError(`No pude leer el historial: ${e.message}`);
    });
  }, []);

  const alternar = (id) => setAbierto(abierto === id ? null : id);
  const elegirVista = (v) => {
    setVista(v);
    setAbierto(null);
  };

  if (!meses) return <section><h1>Historial</h1><p className="ayuda">Cargando los cierres…</p></section>;

  const clientes = armarClientes(meses);
  return (
    <section>
      <h1>Historial</h1>
      <p className="ayuda">
        Los cierres de cada mes, igual que en Cierre del mes. Tocá un mes para ver lo que se le cobró a cada cliente, o mirá todo por cliente.
      </p>
      {error && <div className="alerta error">{error}</div>}

      {meses.length === 0 ? (
        <div className="panel vacio">
          <strong>Todavía no hay cierres.</strong>
          <p>Cuando generes el primero en Cierre del mes, queda acá con lo que se le cobró a cada uno.</p>
        </div>
      ) : (
        <>
          <div className="filtros">
            <div className="segmentado" role="group" aria-label="Ver el historial">
              <button className={vista === 'mes' ? 'activo' : ''} aria-pressed={vista === 'mes'} onClick={() => elegirVista('mes')}>Por mes</button>
              <button className={vista === 'cliente' ? 'activo' : ''} aria-pressed={vista === 'cliente'} onClick={() => elegirVista('cliente')}>Por cliente</button>
            </div>
          </div>

          {vista === 'mes' && meses.map((m) => (
            <Desplegable
              key={m.periodo}
              clase="panel mes-historial"
              abierto={abierto === m.periodo}
              onAlternar={() => alternar(m.periodo)}
              titulo={nombrePeriodo(m.periodo)}
              detalle={`${m.clientes.length} ${m.clientes.length === 1 ? 'cliente' : 'clientes'}`}
              chip={<ChipMes estado={m.estado} />}
              monto={pesos(m.total)}
            >
              <Mes mes={m} onIrCierre={onIrCierre} />
            </Desplegable>
          ))}

          {vista === 'cliente' && clientes.map((c) => (
            <Desplegable
              key={c.id}
              clase="panel mes-historial"
              abierto={abierto === c.id}
              onAlternar={() => alternar(c.id)}
              titulo={c.nombre}
              detalle={`${c.meses.length} ${c.meses.length === 1 ? 'mes' : 'meses'} · último ${nombrePeriodo(c.meses[0].periodo)}`}
              monto={pesos(c.meses[0].total)}
            >
              <Cliente cliente={c} />
            </Desplegable>
          ))}
          <p className="ayuda nota">Los montos son con IVA, como en Cierre del mes.</p>
        </>
      )}
    </section>
  );
}
