import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listarTecidos,
  listarInstalacoesController,
  listarComponentesController,
  listarProdutosOrcamentoController,
  calcularPersianaController,
  calcularPersianaLoteController,
  listarTecidosCortina,
  listarAcessoriosCortinaController,
  calcularCortinaController,
  calcularCortinaCompletaController,
  listarCalculadorasController,
  listarCalculadorasCortinaController,
  listarCalculadorasTrilhoEspecialController,
  calcularTrilhoEspecialController,
} from '../controllers/calcularController';

const router = Router();

router.use(requireAuth);
router.get('/calculadoras', listarCalculadorasController);
router.get('/calculadoras-cortina', listarCalculadorasCortinaController);
router.get('/calculadoras-trilho-especial', listarCalculadorasTrilhoEspecialController);
router.get('/tecidos', listarTecidos);
router.get('/instalacoes', listarInstalacoesController);
router.get('/componentes', listarComponentesController);
router.get('/produtos', listarProdutosOrcamentoController);
router.post('/persiana', calcularPersianaController);
router.post('/persiana/lote', calcularPersianaLoteController);
router.get('/cortina/tecidos', listarTecidosCortina);
router.get('/cortina/acessorios', listarAcessoriosCortinaController);
router.post('/cortina', calcularCortinaController);
router.post('/cortina/completa', calcularCortinaCompletaController);
router.post('/trilho-especial', calcularTrilhoEspecialController);

export default router;
