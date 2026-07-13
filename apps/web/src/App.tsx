// apps/web/src/App.tsx
// Roteamento (SRD §8). Rotas protegidas dentro de ProtectedRoute + Layout;
// seção /admin adicionalmente protegida por AdminRoute.

import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { TrocarSenha } from './pages/TrocarSenha';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute, SenhaDefinitivaRoute } from './components/ProtectedRoute';
import { OrcamentoNovo } from './pages/OrcamentoNovo';
import { Orcamentos, Vendas } from './pages/Orcamentos';
import { OrcamentoDetalhe } from './pages/OrcamentoDetalhe';
import { AdminUsuarios } from './pages/admin/AdminUsuarios';
import { AdminLog } from './pages/admin/AdminLog';
import { AdminRegras } from './pages/admin/AdminRegras';
import { AdminCalculadoras } from './pages/admin/AdminCalculadoras';
import { AdminMateriasPrimas } from './pages/admin/AdminMateriasPrimas';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        {/* Troca de senha fica fora do Layout (sem navbar/sidebar). */}
        <Route path="/trocar-senha" element={<TrocarSenha />} />

        {/* Demais rotas exigem senha definitiva (não provisória). */}
        <Route element={<SenhaDefinitivaRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/orcamentos" replace />} />
            <Route path="/orcamentos" element={<Orcamentos />} />
            <Route path="/orcamentos/novo" element={<OrcamentoNovo />} />
            <Route path="/orcamentos/:id" element={<OrcamentoDetalhe />} />
            <Route path="/vendas" element={<Vendas />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin/usuarios" element={<AdminUsuarios />} />
              <Route path="/admin/regras-calculo" element={<AdminRegras />} />
              <Route path="/admin/calculadoras" element={<AdminCalculadoras />} />
              <Route path="/admin/materias-primas" element={<AdminMateriasPrimas />} />
              <Route path="/admin/log-acoes" element={<AdminLog />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/orcamentos" replace />} />
    </Routes>
  );
}


export default App;
