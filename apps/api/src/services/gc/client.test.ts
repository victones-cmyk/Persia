// apps/api/src/services/gc/client.test.ts
// Trava do modo leitura do GestãoClick.
//
// O staging aponta para o GC REAL — não existe sandbox dele. A proteção antes
// era deixar o token vazio, o que derrubava tudo no staging, inclusive a busca
// de cliente. Agora o token é real e a escrita morre aqui.
//
// gcRequest é a ÚNICA saída para o GC (nenhum serviço chama axios direto), então
// este arquivo é o que separa "ambiente de teste" de "criou um orçamento de
// verdade na conta do cliente". Se algum dia estes testes ficarem vermelhos, é
// isso que está em jogo.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: {
    GESTAOCLICK_ACCESS_TOKEN: 'token',
    GESTAOCLICK_SECRET_ACCESS_TOKEN: 'secret',
    GC_API_BASE_URL: 'https://api.gestaoclick.com',
    GC_TIMEOUT_MS: 10000,
    GC_DEBUG_LOG: false,
    GC_SOMENTE_LEITURA: true,
  },
}));

const { gcRequest, gcSomenteLeitura, GcError } = await import('./client');

describe('GC_SOMENTE_LEITURA', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reconhece o modo leitura', () => {
    expect(gcSomenteLeitura()).toBe(true);
  });

  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    it(`recusa ${metodo} sem chegar na rede`, async () => {
      await expect(gcRequest({ method: metodo, url: '/vendas' })).rejects.toMatchObject({
        status: 403,
      });
      await expect(gcRequest({ method: metodo, url: '/vendas' })).rejects.toBeInstanceOf(GcError);
    });
  }

  it('recusa metodo em minusculas — axios aceita os dois', async () => {
    await expect(gcRequest({ method: 'post', url: '/clientes' })).rejects.toMatchObject({ status: 403 });
  });

  it('a mensagem diz o que foi recusado, para nao virar "erro desconhecido"', async () => {
    await expect(gcRequest({ method: 'POST', url: '/vendas' })).rejects.toThrow(/POST \/vendas/);
  });
});
