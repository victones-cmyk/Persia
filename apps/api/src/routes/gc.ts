// apps/api/src/routes/gc.ts
// Rotas de leitura do GestãoClick (autenticadas). Fase 4.

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { buscarClientePorId, buscarClientes, criarCliente, type EnderecoCliente } from '../services/gc/clientes';
import { buscarRevendaPorClienteGc } from '../lib/permissaoRevenda';
import { cpfValido, cnpjValido } from '../lib/documentoBR';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

router.get('/clientes/:id/editar', (req: Request, res: Response) => {
  const id = String(req.params.id ?? '').trim();
  if (!/^[\w.-]+$/.test(id)) {
    throw new AppError(400, 'CLIENTE_INVALIDO', 'Cliente inválido.');
  }
  const url = env.GC_CLIENTE_URL_TEMPLATE.replace('{id}', encodeURIComponent(id));
  res.redirect(url);
});

// GET /api/gc/clientes/:id/revenda — cliente do GC está vinculado a uma revenda?
// Usado pelo vendedor/admin pra detectar automaticamente o desconto ao escolher o
// cliente no orçamento. Restrito a admin/vendedor: uma revenda logada não precisa
// (o desconto dela já vem da própria sessão) e não deve ver o % de outra revenda.
router.get('/clientes/:id/revenda', async (req: Request, res: Response) => {
  const sessao = req.session.usuario!;
  if (sessao.perfil === 'revenda') {
    throw new AppError(403, 'ACESSO_NEGADO', 'Não disponível para o perfil revenda.');
  }
  const id = String(req.params.id ?? '').trim();
  if (!id) throw new AppError(400, 'CLIENTE_INVALIDO', 'Cliente inválido.');
  const revenda = await buscarRevendaPorClienteGc(id);
  res.json({ revenda });
});

// GET /api/gc/clientes/:id/completo — cliente com endereço e telefone, para
// pré-preencher o agendamento de visita sem redigitar o que já está no GC.
router.get('/clientes/:id/completo', async (req: Request, res: Response) => {
  const sessao = req.session.usuario!;
  if (sessao.perfil === 'revenda') {
    throw new AppError(403, 'ACESSO_NEGADO', 'Não disponível para o perfil revenda.');
  }
  const id = String(req.params.id ?? '').trim();
  if (!id) throw new AppError(400, 'CLIENTE_INVALIDO', 'Cliente inválido.');
  const cliente = await buscarClientePorId(id);
  if (!cliente) throw new AppError(404, 'NAO_ENCONTRADO', 'Cliente não encontrado no GestãoClick.');
  res.json({ cliente });
});

// GET /api/gc/clientes?q=termo — busca de clientes (frontend faz debounce 300ms).
router.get('/clientes', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const clientes = await buscarClientes(q);
  res.json({ clientes });
});

// POST /api/gc/clientes — cadastro de cliente (PF ou PJ). Restrito a admin/vendedor:
// revenda tem cliente fixo vinculado à própria sessão, não cadastra outros (SRD §11).
router.post('/clientes', async (req: Request, res: Response) => {
  const sessao = req.session.usuario!;
  if (sessao.perfil === 'revenda') {
    throw new AppError(403, 'ACESSO_NEGADO', 'Não disponível para o perfil revenda.');
  }

  const body = req.body as Record<string, unknown> | null;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const tipoPessoaBruto = str(body?.tipo_pessoa);
  const tipoPessoa: 'PF' | 'PJ' = tipoPessoaBruto === 'PJ' ? 'PJ' : 'PF';
  const nome = str(body?.nome);
  const razaoSocial = str(body?.razao_social);
  const cpf = str(body?.cpf);
  const cnpj = str(body?.cnpj);
  const email = str(body?.email);
  const telefone = str(body?.telefone);
  const celular = str(body?.celular);

  if (nome.length < 2) {
    throw new AppError(400, 'NOME_CLIENTE_OBRIGATORIO', 'Informe o nome do cliente.');
  }
  if (nome.length > 150) {
    throw new AppError(400, 'NOME_CLIENTE_INVALIDO', 'O nome do cliente deve ter no máximo 150 caracteres.');
  }
  if (tipoPessoa === 'PJ') {
    if (razaoSocial.length > 150) {
      throw new AppError(400, 'RAZAO_SOCIAL_CLIENTE_INVALIDA', 'A razão social deve ter no máximo 150 caracteres.');
    }
    if (cnpj && !cnpjValido(cnpj)) {
      throw new AppError(400, 'CNPJ_CLIENTE_INVALIDO', 'CNPJ inválido.');
    }
  } else if (cpf && !cpfValido(cpf)) {
    throw new AppError(400, 'CPF_CLIENTE_INVALIDO', 'CPF inválido.');
  }
  if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new AppError(400, 'EMAIL_CLIENTE_INVALIDO', 'E-mail inválido.');
  }
  if (telefone.length > 30) {
    throw new AppError(400, 'TELEFONE_CLIENTE_INVALIDO', 'O telefone deve ter no máximo 30 caracteres.');
  }
  if (celular.length > 30) {
    throw new AppError(400, 'CELULAR_CLIENTE_INVALIDO', 'O celular deve ter no máximo 30 caracteres.');
  }

  const enderecoBruto = body?.endereco as Record<string, unknown> | undefined;
  let endereco: EnderecoCliente | undefined;
  if (enderecoBruto && typeof enderecoBruto === 'object') {
    const cep = str(enderecoBruto.cep);
    if (cep && cep.replace(/\D/g, '').length !== 8) {
      throw new AppError(400, 'CEP_CLIENTE_INVALIDO', 'CEP inválido — informe os 8 dígitos.');
    }
    endereco = {
      cep,
      logradouro: str(enderecoBruto.logradouro),
      numero: str(enderecoBruto.numero),
      complemento: str(enderecoBruto.complemento),
      bairro: str(enderecoBruto.bairro),
      cidade: str(enderecoBruto.cidade),
      estado: str(enderecoBruto.estado),
    };
  }

  const cliente = await criarCliente({
    tipo_pessoa: tipoPessoa,
    nome,
    razao_social: tipoPessoa === 'PJ' ? razaoSocial : undefined,
    cpf: tipoPessoa === 'PF' ? cpf : undefined,
    cnpj: tipoPessoa === 'PJ' ? cnpj : undefined,
    email,
    telefone,
    celular,
    endereco,
  });
  res.status(201).json({ cliente });
});

export default router;
