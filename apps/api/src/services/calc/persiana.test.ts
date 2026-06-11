import { describe, it, expect } from 'vitest';
import { calcularPersiana, aplicarDesconto, RN01Error, type EntradaPersiana } from './persiana';
import { roundHalfUp } from './arredondamento';

const base = (over: Partial<EntradaPersiana>): EntradaPersiana => ({
  tipo: 'persiana_rolo_blackout',
  largura: 1.5,
  altura: 2.0,
  dimensao: 2.0,
  cor_acessorio: 'Branco',
  acionamento: 'com_bando',
  ...over,
});

describe('Rolo Blackout (2591)', () => {
  it('qtd_venda = [Dimensao]×([Altura]+0.15)', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_rolo_blackout' }));
    expect(r.qtd_venda).toBe(roundHalfUp(2.0 * (2.0 + 0.15))); // 4.30
    expect(r.qtd_venda).toBe(4.3);
  });
  it('qtd_producao = [Largura]×([Altura]+0.15)', () => {
    const r = calcularPersiana(base({}));
    expect(r.qtd_producao).toBe(roundHalfUp(1.5 * (2.0 + 0.15)));
  });
  it('codigo_gc e familia', () => {
    const r = calcularPersiana(base({}));
    expect(r.codigo_gc).toBe('2591');
    expect(r.familia).toBe('rolo');
  });
});

describe('Rolo Screen (2592) — usa [Largura] na venda', () => {
  it('qtd_venda = [Largura]×([Altura]+0.15)×1.3', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_rolo_screen' }));
    expect(r.qtd_venda).toBe(roundHalfUp(1.5 * (2.0 + 0.15) * 1.3)); // 4.19
    expect(r.qtd_venda).toBe(4.19);
  });
});

describe('Rolo Translúcido (2608)', () => {
  it('qtd_venda = [Dimensao]×([Altura]+0.15)', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_rolo_translucido' }));
    expect(r.qtd_venda).toBe(roundHalfUp(2.0 * (2.0 + 0.15)));
  });
});

describe('Double Vision (2606) — altura ×2', () => {
  it('altura_efetiva dobrada e venda = [Dimensao]×((A×2)+0.15)', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_rolo_double_vision' }));
    expect(r.altura_efetiva).toBe(4.0);
    expect(r.qtd_venda).toBe(roundHalfUp(2.0 * (2.0 * 2 + 0.15))); // 8.30
    expect(r.qtd_producao).toBe(roundHalfUp(1.5 * (2.0 * 2 + 0.15)));
  });
});

describe('Romana Blackout (2611)', () => {
  it('margem 0.08, venda = [Dimensao]×([Altura]+0.08)×1.3', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_romana_blackout' }));
    expect(r.margem).toBe(0.08);
    expect(r.familia).toBe('romana');
    expect(r.qtd_venda).toBe(roundHalfUp(2.0 * (2.0 + 0.08) * 1.3));
  });
});

describe('Romana Screen (2612) — usa [Largura]', () => {
  it('venda = [Largura]×([Altura]+0.08)×1.2', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_romana_screen' }));
    expect(r.qtd_venda).toBe(roundHalfUp(1.5 * (2.0 + 0.08) * 1.2));
  });
});

describe('Romana Translúcido (2601)', () => {
  it('venda = [Dimensao]×([Altura]+0.08)×1.2', () => {
    const r = calcularPersiana(base({ tipo: 'persiana_romana_translucido' }));
    expect(r.qtd_venda).toBe(roundHalfUp(2.0 * (2.0 + 0.08) * 1.2));
  });
});

describe('RN-01 — largura > dimensão', () => {
  it('lança RN01Error com código', () => {
    expect(() => calcularPersiana(base({ largura: 2.2, dimensao: 2.0 }))).toThrow(RN01Error);
    try {
      calcularPersiana(base({ largura: 2.2, dimensao: 2.0 }));
    } catch (e) {
      expect((e as RN01Error).code).toBe('RN01_LARGURA_EXCEDIDA');
      expect((e as RN01Error).largura).toBe(2.2);
      expect((e as RN01Error).dimensao).toBe(2.0);
    }
  });
  it('largura == dimensão é permitido', () => {
    expect(() => calcularPersiana(base({ largura: 2.0, dimensao: 2.0 }))).not.toThrow();
  });
});

describe('Validações de entrada', () => {
  it('rejeita dimensões não positivas', () => {
    expect(() => calcularPersiana(base({ largura: 0 }))).toThrow();
    expect(() => calcularPersiana(base({ altura: -1 }))).toThrow();
    expect(() => calcularPersiana(base({ dimensao: 0 }))).toThrow();
  });

  it('rejeita tipo inválido', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calcularPersiana(base({ tipo: 'cortina' as any }))).toThrow('Tipo de persiana inválido');
  });
});

describe('RN-04 — TC (Tamanho do Comando)', () => {
  it('padrão = 70% da altura', () => {
    expect(calcularPersiana(base({ altura: 2.0 })).tc).toBe(roundHalfUp(2.0 * 0.7)); // 1.40
  });
  it('usa o TC informado quando editado', () => {
    expect(calcularPersiana(base({ altura: 2.0, tc: 1.55 })).tc).toBe(1.55);
  });
});

describe('RN-03 — Valor Bruto e desconto', () => {
  it('valor_bruto = qtd_venda × preço tecido', () => {
    const r = calcularPersiana(base({ preco_tecido: 69 }));
    expect(r.valor_bruto).toBe(roundHalfUp(r.qtd_venda * 69));
  });
  it('valor_bruto null sem preço', () => {
    expect(calcularPersiana(base({})).valor_bruto).toBeNull();
    expect(calcularPersiana(base({})).preco_tecido).toBeNull();
  });
  it('aplicarDesconto (RN-10)', () => {
    expect(aplicarDesconto(100, 10)).toBe(90);
    expect(aplicarDesconto(297, 30)).toBe(roundHalfUp(297 * 0.7));
    expect(aplicarDesconto(100, 0)).toBe(100);
  });
});

describe('Breakdown de componentes presente', () => {
  it('inclui fixos, base e (quando aplicável) condicionais', () => {
    const r = calcularPersiana(base({}));
    expect(r.componentes.some((c) => c.grupo === 'fixo')).toBe(true);
    expect(r.componentes.some((c) => c.grupo === 'base')).toBe(true);
    expect(r.componentes.length).toBeGreaterThan(5);
  });
});
