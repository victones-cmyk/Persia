// apps/api/src/routes/orcamentos.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  criarOrcamento,
  reenviarOrcamento,
  getOrcamento,
  listarOrcamentos,
  cancelarOrcamento,
} from '../controllers/orcamentoController';

const router = Router();
router.use(requireAuth);

router.get('/', listarOrcamentos);
router.post('/', criarOrcamento);
router.post('/:id/reenviar', reenviarOrcamento);
router.post('/:id/cancelar', cancelarOrcamento);
router.get('/:id', getOrcamento);

export default router;
