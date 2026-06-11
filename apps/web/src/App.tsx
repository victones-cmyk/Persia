// apps/web/src/App.tsx
// Roteamento (SRD §8). Rotas protegidas dentro de ProtectedRoute + Layout;
// seção /admin adicionalmente protegida por AdminRoute.

import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { OrcamentoNovo } from './pages/OrcamentoNovo';
import { Orcamentos } from './pages/Orcamentos';
import { OrcamentoDetalhe } from './pages/OrcamentoDetalhe';
import { AdminUsuarios } from './pages/admin/AdminUsuarios';
import { AdminConfiguracoes } from './pages/admin/AdminConfiguracoes';
import { AdminLog } from './pages/admin/AdminLog';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/orcamentos" replace />} />
          <Route path="/orcamentos" element={<Orcamentos />} />
          <Route path="/orcamentos/novo" element={<OrcamentoNovo />} />
          <Route path="/orcamentos/:id" element={<OrcamentoDetalhe />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
            <Route path="/admin/log-acoes" element={<AdminLog />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/orcamentos" replace />} />
    </Routes>
  );
}

export default App;
