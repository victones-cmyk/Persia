// apps/web/src/App.tsx
// Roteamento (SRD §8). Rotas protegidas dentro de ProtectedRoute + Layout;
// seção /admin adicionalmente protegida por AdminRoute.

import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { Placeholder } from './pages/Placeholder';
import { OrcamentoNovo } from './pages/OrcamentoNovo';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/orcamentos" replace />} />
          <Route path="/orcamentos" element={<Placeholder titulo="Orçamentos" fase="Fase 6" />} />
          <Route path="/orcamentos/novo" element={<OrcamentoNovo />} />
          <Route
            path="/orcamentos/:id"
            element={<Placeholder titulo="Detalhe do Orçamento" fase="Fase 6" />}
          />

          <Route element={<AdminRoute />}>
            <Route
              path="/admin/usuarios"
              element={<Placeholder titulo="Usuários" fase="Fase 6" />}
            />
            <Route
              path="/admin/configuracoes"
              element={<Placeholder titulo="Configurações" fase="Fase 6" />}
            />
            <Route
              path="/admin/log-acoes"
              element={<Placeholder titulo="Log de Ações" fase="Fase 6" />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/orcamentos" replace />} />
    </Routes>
  );
}

export default App;
