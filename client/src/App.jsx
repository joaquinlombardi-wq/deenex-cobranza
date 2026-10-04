import { useState } from 'react';
import CierreMes from './pages/CierreMes.jsx';
import Clientes from './pages/Clientes.jsx';
import AltaCliente from './pages/AltaCliente.jsx';

export default function App() {
  const [vista, setVista] = useState({ pagina: 'cierre' });
  const ir = (pagina, extra = {}) => setVista({ pagina, ...extra });

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <span className="logo">D</span> Deenex <span className="sub">Cobranza</span>
        </div>
        <nav>
          <button className={vista.pagina === 'cierre' ? 'activo' : ''} onClick={() => ir('cierre')}>Cierre del mes</button>
          <button className={vista.pagina !== 'cierre' ? 'activo' : ''} onClick={() => ir('clientes')}>Clientes</button>
        </nav>
      </header>
      <main>
        {vista.pagina === 'cierre' && <CierreMes />}
        {vista.pagina === 'clientes' && <Clientes onNuevo={() => ir('alta')} onEditar={(c) => ir('alta', { cliente: c })} />}
        {vista.pagina === 'alta' && <AltaCliente inicial={vista.cliente} onListo={() => ir('clientes')} />}
      </main>
    </div>
  );
}
