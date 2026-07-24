import { describe, expect, it } from 'vitest';
import { produtosSinteticosDoOrcamento, respostaComProdutosCriados, CHAVE_PRODUTOS_CRIADOS } from './limpezaProdutos';

type OrcLimpeza = Parameters<typeof produtosSinteticosDoOrcamento>[0];

function orc(parcial: Partial<OrcLimpeza>): OrcLimpeza {
  return { resposta_gc: null, payload_gc_enviado: null, itens_json: null, ...parcial } as OrcLimpeza;
}

describe('respostaComProdutosCriados', () => {
  it('mescla a lista na resposta do GC preservando os campos originais', () => {
    const r = respostaComProdutosCriados({ code: 200, data: { id: '1' } }, ['10', '20']);
    expect(r.code).toBe(200);
    expect(r[CHAVE_PRODUTOS_CRIADOS]).toEqual(['10', '20']);
  });

  it('embrulha respostas não-objeto sem perder a lista', () => {
    const r = respostaComProdutosCriados(null, ['10']);
    expect(r[CHAVE_PRODUTOS_CRIADOS]).toEqual(['10']);
  });
});

describe('produtosSinteticosDoOrcamento', () => {
  it('prefere a lista explícita gravada no envio', () => {
    expect(produtosSinteticosDoOrcamento(orc({
      resposta_gc: { [CHAVE_PRODUTOS_CRIADOS]: ['111', '222'] },
      payload_gc_enviado: { produtos: [{ produto_id: '111' }, { produto_id: '222' }, { produto_id: '999' }] },
    }))).toEqual(['111', '222']);
  });

  it('legado: deriva do payload excluindo produtos REAIS dos itens extras', () => {
    expect(produtosSinteticosDoOrcamento(orc({
      payload_gc_enviado: { produtos: [{ produto_id: '111' }, { produto_id: '555' }, { produto_id: '777' }] },
      itens_json: {
        persiana: { itens: [{ gc_produto_id: '111' }] },
        produtos_avulsos: [{ produto_id: '555' }],
        trilhos_especiais: [{ produto_id: '777' }, { produto_id: '' }],
      },
    }))).toEqual(['111']);
  });

  it('legado persiana/cortina: todo o payload é sintético', () => {
    expect(produtosSinteticosDoOrcamento(orc({
      payload_gc_enviado: { produtos: [{ produto_id: '1' }, { produto_id: '2' }] },
      itens_json: [{ gc_produto_id: '1' }, { gc_produto_id: '2' }],
    }))).toEqual(['1', '2']);
  });

  it('sem envio (rascunho): lista vazia', () => {
    expect(produtosSinteticosDoOrcamento(orc({}))).toEqual([]);
  });

  it('lista explícita vazia não cai no fallback do payload', () => {
    expect(produtosSinteticosDoOrcamento(orc({
      resposta_gc: { [CHAVE_PRODUTOS_CRIADOS]: [] },
      payload_gc_enviado: { produtos: [{ produto_id: '999' }] },
    }))).toEqual([]);
  });
});
