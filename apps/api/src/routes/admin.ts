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
  listarCalculadoras,
  atualizarCalculadoras,
  previewCalculadoraPersiana,
  listarCalculadorasCortina,
  atualizarCalculadorasCortina,
  listarCalculadorasTrilhoEspecial,
  atualizarCalculadorasTrilhoEspecial,
  listarGruposProdutosGc,
  listarProdutosGc,
  getStatusCatalogoGc,
  sincronizarCatalogoGc,
  diagnosticarComponenteCatalogoGc,
  getVersao,
  listarLojas,
} from '../controllers/adminController';

const router = Router();
router.use(requireAdmin);

router.get('/usuarios', listarUsuarios);
router.post('/usuarios', criarUsuario);
router.put('/usuarios/:id', editarUsuario);
router.post('/usuarios/:id/desativar', desativarUsuario);
router.delete('/usuarios/:id', excluirUsuario);
router.get('/funcionarios-gc', listarFuncionariosGc);
router.get('/lojas', listarLojas);

router.get('/log-acoes', listarLogAcoes);
router.get('/versao', getVersao);

router.get('/regras-calculo', getRegrasCalculo);
router.put('/regras-calculo', salvarRegrasCalculo);

router.get('/calculadoras', listarCalculadoras);
router.put('/calculadoras', atualizarCalculadoras);
router.post('/calculadoras/preview-persiana', previewCalculadoraPersiana);

router.get('/calculadoras-cortina', listarCalculadorasCortina);
router.put('/calculadoras-cortina', atualizarCalculadorasCortina);
router.get('/calculadoras-trilho-especial', listarCalculadorasTrilhoEspecial);
router.put('/calculadoras-trilho-especial', atualizarCalculadorasTrilhoEspecial);

router.get('/gc/grupos-produtos', listarGruposProdutosGc);
router.get('/gc/produtos', listarProdutosGc);
router.get('/gc/catalogo-local/status', getStatusCatalogoGc);
router.post('/gc/catalogo-local/sincronizar', sincronizarCatalogoGc);
router.get('/gc/catalogo-local/diagnostico-componente', diagnosticarComponenteCatalogoGc);

export default router;
