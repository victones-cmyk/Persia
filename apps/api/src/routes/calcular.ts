// apps/api/src/routes/calcular.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listarTecidos,
  calcularPersianaController,
  calcularPersianaLoteController,
  listarTecidosCortina,
  listarAcessoriosCortinaController,
  calcularCortinaController,
} from '../controllers/calcularController';

const router = Router();

router.use(requireAuth);
router.get('/tecidos', listarTecidos);
router.post('/persiana', calcularPersianaController);
router.post('/persiana/lote', calcularPersianaLoteController);
router.get('/cortina/tecidos', listarTecidosCortina);
router.get('/cortina/acessorios', listarAcessoriosCortinaController);
router.post('/cortina', calcularCortinaController);

export default router;
