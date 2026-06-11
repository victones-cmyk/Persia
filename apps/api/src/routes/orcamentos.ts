// apps/api/src/routes/orcamentos.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { criarOrcamento, reenviarOrcamento, getOrcamento } from '../controllers/orcamentoController';

const router = Router();
router.use(requireAuth);

router.post('/', criarOrcamento);
router.post('/:id/reenviar', reenviarOrcamento);
router.get('/:id', getOrcamento);

export default router;
