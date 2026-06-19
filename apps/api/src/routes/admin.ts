// apps/api/src/routes/admin.ts
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  desativarUsuario,
  excluirUsuario,
  listarFuncionariosGc,
  listarLogAcoes,
  getRegrasCalculo,
  salvarRegrasCalculo,
  getVersao,
} from '../controllers/adminController';

const router = Router();
router.use(requireAdmin);

router.get('/usuarios', listarUsuarios);
router.post('/usuarios', criarUsuario);
router.put('/usuarios/:id', editarUsuario);
router.post('/usuarios/:id/desativar', desativarUsuario);
router.delete('/usuarios/:id', excluirUsuario);
router.get('/funcionarios-gc', listarFuncionariosGc);

router.get('/log-acoes', listarLogAcoes);
router.get('/versao', getVersao);

router.get('/regras-calculo', getRegrasCalculo);
router.put('/regras-calculo', salvarRegrasCalculo);

export default router;
