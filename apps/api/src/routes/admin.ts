// apps/api/src/routes/admin.ts
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  desativarUsuario,
  listarFuncionariosGc,
  listarConfiguracoes,
  salvarConfiguracoes,
  listarLogAcoes,
} from '../controllers/adminController';

const router = Router();
router.use(requireAdmin);

router.get('/usuarios', listarUsuarios);
router.post('/usuarios', criarUsuario);
router.put('/usuarios/:id', editarUsuario);
router.post('/usuarios/:id/desativar', desativarUsuario);
router.get('/funcionarios-gc', listarFuncionariosGc);

router.get('/configuracoes', listarConfiguracoes);
router.put('/configuracoes', salvarConfiguracoes);

router.get('/log-acoes', listarLogAcoes);

export default router;
