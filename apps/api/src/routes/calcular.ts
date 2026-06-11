// apps/api/src/routes/calcular.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listarTecidos, calcularPersianaController } from '../controllers/calcularController';

const router = Router();

router.use(requireAuth);
router.get('/tecidos', listarTecidos);
router.post('/persiana', calcularPersianaController);

export default router;
