// apps/api/src/routes/orcamentos.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  criarOrcamento,
  reenviarOrcamento,
  getOrcamento,
  listarOrcamentos,
  cancelarOrcamento,
  atualizarOrcamento,
} from '../controllers/orcamentoController';
import { criarOrcamentoCortina } from '../controllers/orcamentoCortinaController';

const router = Router();
router.use(requireAuth);

router.get('/', listarOrcamentos);
router.post('/', criarOrcamento);
router.post('/cortina', criarOrcamentoCortina);
router.post('/:id/reenviar', reenviarOrcamento);
router.post('/:id/cancelar', cancelarOrcamento);
router.put('/:id', atualizarOrcamento);
router.get('/:id', getOrcamento);

export default router;
