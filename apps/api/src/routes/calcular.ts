// apps/api/src/routes/calcular.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listarTecidos,
  listarInstalacoesController,
  calcularPersianaController,
  calcularPersianaLoteController,
  listarTecidosCortina,
  listarAcessoriosCortinaController,
  calcularCortinaController,
  calcularCortinaCompletaController,
} from '../controllers/calcularController';

const router = Router();

router.use(requireAuth);
router.get('/tecidos', listarTecidos);
router.get('/instalacoes', listarInstalacoesController);
router.post('/persiana', calcularPersianaController);
router.post('/persiana/lote', calcularPersianaLoteController);
router.get('/cortina/tecidos', listarTecidosCortina);
router.get('/cortina/acessorios', listarAcessoriosCortinaController);
router.post('/cortina', calcularCortinaController);
router.post('/cortina/completa', calcularCortinaCompletaController);

export default router;
