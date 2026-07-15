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
  duplicarOrcamento,
  gerarVendaOrcamento,
} from '../controllers/orcamentoController';
import { criarOrcamentoCortina } from '../controllers/orcamentoCortinaController';
import { criarOrcamentoMisto } from '../controllers/orcamentoMistoController';
import {
  atualizarPedidoOrcamento,
  baixarPdfOrdem,
  baixarPdfOrdensOrcamento,
  baixarZplEtiqueta,
  criarOrdensProducao,
  decidirAbsorcaoMedicao,
  gerarVendaAjusteMedicao,
  getProducaoOrcamento,
  imprimirEtiquetaOrdem,
  imprimirEtiquetasOrcamento,
  listarOrdensProducao,
  preverMedicaoProducao,
  solicitarAbsorcaoMedicao,
} from '../controllers/producaoController';

const router = Router();
router.use(requireAuth);

router.get('/', listarOrcamentos);
router.post('/', criarOrcamento);
router.post('/cortina', criarOrcamentoCortina);
router.post('/misto', criarOrcamentoMisto);
router.get('/ordens-producao/:id/pdf', baixarPdfOrdem);
router.get('/ordens-producao/:id/etiqueta.zpl', baixarZplEtiqueta);
router.post('/ordens-producao/:id/imprimir-etiqueta', imprimirEtiquetaOrdem);
router.get('/ordens-producao', listarOrdensProducao);
router.get('/:id/producao', getProducaoOrcamento);
router.get('/:id/ordens-producao/pdf', baixarPdfOrdensOrcamento);
router.post('/:id/ordens-producao/imprimir-etiquetas', imprimirEtiquetasOrcamento);
router.post('/:id/producao/medicao/preview', preverMedicaoProducao);
router.post('/:id/producao/medicao/venda-ajuste', gerarVendaAjusteMedicao);
router.post('/:id/producao/medicao/solicitar-absorcao', solicitarAbsorcaoMedicao);
router.post('/:id/producao/medicao/decidir-absorcao', decidirAbsorcaoMedicao);
router.put('/:id/pedido', atualizarPedidoOrcamento);
router.post('/:id/gerar-venda', gerarVendaOrcamento);
router.post('/:id/ordens-producao', criarOrdensProducao);
router.post('/:id/reenviar', reenviarOrcamento);
router.post('/:id/cancelar', cancelarOrcamento);
router.post('/:id/duplicar', duplicarOrcamento);
router.put('/:id', atualizarOrcamento);
router.get('/:id', getOrcamento);

export default router;
