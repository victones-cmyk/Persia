// apps/api/src/routes/cep.ts
// Consulta de CEP (ViaCEP) feita pelo BACKEND, não pelo navegador.
//
// A CSP do app fecha `connect-src` em 'self', então o navegador não fala com
// serviço externo — e afrouxar isso para um preenchimento de endereço seria
// trocar uma proteção real por comodidade. O backend consulta e devolve.
//
// Também evita que a indisponibilidade do ViaCEP apareça como erro estranho no
// console do vendedor: aqui vira uma resposta previsível que a tela sabe tratar.

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

export interface EnderecoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// CEP praticamente não muda; o cache evita repetir a consulta a cada dígito
// corrigido no formulário.
const cache = new Map<string, { valor: EnderecoCep | null; expira: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

router.get('/:cep', async (req: Request, res: Response) => {
  const cep = String(req.params.cep ?? '').replace(/\D/g, '');
  if (cep.length !== 8) {
    throw new AppError(400, 'CEP_INVALIDO', 'Informe os 8 dígitos do CEP.');
  }

  const emCache = cache.get(cep);
  if (emCache && emCache.expira > Date.now()) {
    res.json({ endereco: emCache.valor });
    return;
  }

  let endereco: EnderecoCep | null = null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) {
      const d = (await r.json()) as Record<string, unknown>;
      // ViaCEP responde 200 com { erro: true } para CEP inexistente.
      if (!d.erro) {
        endereco = {
          cep,
          logradouro: String(d.logradouro ?? ''),
          bairro: String(d.bairro ?? ''),
          cidade: String(d.localidade ?? ''),
          estado: String(d.uf ?? ''),
        };
      }
    }
  } catch {
    // Fora do ar ou lento: devolve vazio e o vendedor preenche à mão, em vez de
    // travar o cadastro por causa de um serviço de terceiro.
    res.json({ endereco: null, indisponivel: true });
    return;
  }

  cache.set(cep, { valor: endereco, expira: Date.now() + TTL_MS });
  res.json({ endereco });
});

export default router;
