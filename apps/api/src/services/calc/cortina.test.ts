import { describe, it, expect } from 'vitest';
import {
  calcularCortina,
  calcularCortinaMultiCamada,
  NotImplementedError,
  type EntradaCortina,
  type ResultadoCortina,
  type ResultadoCortinaCompleta,
} from './cortina';

// Preços de exemplo da planilha "CORTINA SOB MEDIDA_v.3".
const PRECO: Record<string, number> = {
  Varão: 13,
  Trilho: 13,
  'Varão suíço': 13,
  Suporte: 5,
  'Suporte duplo': 5,
  Ilhoses: 0.3,
  Argolas: 0.3,
  'Rodízios/ganchos': 0.3,
  Ponteira: 5,
  'Entretela (KOS)': 1.5,
  'Tecido (frente)': 50,
  'Tecido (forro)': 20,
  'Tecido (trás)': 20,
};
const SUPORTE_MANUAL = 3;
const INSTALACAO = 140;

function precoDe(item: string): number {
  const base = item.replace(/\s*\(tras[ae]ir[ao]\)$/i, ''); // remove sufixo (traseiro/traseira)
  return PRECO[base] ?? 0;
}
function totalPlanilha(r: ResultadoCortina): number {
  let total = 0;
  for (const it of r.itens) {
    const qtd = it.auto ? it.quantidade : SUPORTE_MANUAL; // suporte é o único manual
    total += qtd * precoDe(it.item);
  }
  return total + INSTALACAO;
}
const qtd = (r: ResultadoCortina, item: string) => r.itens.find((i) => i.item === item)?.quantidade;

const BASE: EntradaCortina = {
  modelo: 'ilhos',
  fixacao: 'varao',
  config: 'um_tecido',
  largura: 3,
  altura: 2.6,
  largura_tecido: 3.0,
  franzido_frente: 3,
  franzido_tras: 2,
  tamanho_barra: 0.1,
  tipo_barra: 'dupla',
  aberturas: 1,
};

describe('Cortina Ilhós (com entretela) — planilha v.3', () => {
  it('um tecido → total R$ 685,50 (672 + entretela 13,50)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'um_tecido' });
    expect(r.metodo).toBe('normal');
    expect(r.barra_consumo).toBe(0.3);
    expect(r.metragem_frente).toBe(9);
    expect(qtd(r, 'Ilhoses')).toBe(60);
    expect(qtd(r, 'Entretela (KOS)')).toBe(9);
    expect(totalPlanilha(r)).toBe(685.5);
  });

  it('forro no mesmo varão → forro acompanha a frente (9 m)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'dois_tecidos_mesmo_varao' });
    expect(qtd(r, 'Tecido (forro)')).toBe(9);
  });

  it('varão duplo → frente ilhós (60) + trás argolas (30) + trás 6 m', () => {
    const r = calcularCortina({ ...BASE, modelo: 'ilhos', config: 'dois_tecidos_varao_duplo' });
    expect(qtd(r, 'Ilhoses')).toBe(60);
    expect(qtd(r, 'Argolas (traseiro)')).toBe(30);
    expect(qtd(r, 'Tecido (trás)')).toBe(6);
  });
});

describe('Cortina Prega (Americana/Macho/Fêmea) — planilha v.3', () => {
  it('um tecido no varão → total R$ 676,50 (ferragem = argolas)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'prega', fixacao: 'varao', config: 'um_tecido' });
    expect(r.barra_consumo).toBe(0.32); // cabeçote 0,12 + barra 0,20
    expect(qtd(r, 'Argolas')).toBe(30);
    expect(qtd(r, 'Entretela (KOS)')).toBe(9);
    expect(totalPlanilha(r)).toBe(676.5);
  });

  it('no trilho → usa rodízios e NÃO usa ponteira', () => {
    const r = calcularCortina({ ...BASE, modelo: 'prega', fixacao: 'trilho', config: 'um_tecido' });
    expect(qtd(r, 'Rodízios/ganchos')).toBe(30);
    expect(qtd(r, 'Ponteira')).toBeUndefined();
  });
});

describe('Cortina Franzido (sem entretela) — planilha v.3', () => {
  it('um tecido → sem entretela, folga 8 cm, total R$ 663', () => {
    const r = calcularCortina({ ...BASE, modelo: 'franzido', fixacao: 'varao', config: 'um_tecido' });
    expect(r.barra_consumo).toBe(0.28); // 0,08 + 0,20
    expect(qtd(r, 'Entretela (KOS)')).toBeUndefined();
    expect(totalPlanilha(r)).toBe(663);
  });
});

describe('Cortina — método de emenda (altura > largura do tecido)', () => {
  it('3,50 × 3,00 em tecido 2,80 → 4 tiras × 3,30 = 13,20 m', () => {
    const r = calcularCortina({
      ...BASE,
      modelo: 'ilhos',
      largura: 3.5,
      altura: 3.0,
      largura_tecido: 2.8,
      franzido_frente: 2.6,
    });
    expect(r.metodo).toBe('emenda');
    expect(r.tiras_frente).toBe(4);
    expect(r.metragem_frente).toBe(13.2);
  });
});

describe('Cortina — emenda: nº de faixas = consumo ÷ largura do tecido (Victor v.5.1)', () => {
  // Exemplo do Victor (v.5.1): cortina 2,00 × 6,00, tecido 3,00 m, franzido 4 →
  // consumo 8,00 → 3 faixas (8 ÷ 3), NÃO 4 (antes inflava por um mínimo = franzido).
  it('2,00×6,00, tecido 3,00, franzido 4 → 3 faixas', () => {
    const r = calcularCortina({
      modelo: 'franzido', fixacao: 'trilho', config: 'um_tecido',
      largura: 2.0, altura: 6.0, largura_tecido: 3.0, franzido_frente: 4,
    });
    expect(r.metodo).toBe('emenda');
    expect(r.tiras_frente).toBe(3);
  });

  // Cortina menor (L2,00 × A4,00, tecido 3,00, faixa 4,32): com tecido largo, franzido
  // até 3 cabe em 2 faixas (2 larguras de 3 m = 6 m ≥ consumo). Só passa a 3 quando consumo > 6.
  const caso = (franzido: number) =>
    calcularCortina({
      modelo: 'prega', fixacao: 'trilho', config: 'um_tecido',
      largura: 2.0, altura: 4.0, largura_tecido: 3.0,
      franzido_frente: franzido, tamanho_barra: 0.1, tipo_barra: 'dupla',
    });
  it('franzido 2 → 2 faixas × 4,32 = 8,64 m; entretela na emenda = consumo (4,00)', () => {
    const r = caso(2);
    expect(r.metodo).toBe('emenda');
    expect(r.tiras_frente).toBe(2);
    expect(r.metragem_frente).toBe(8.64);
    // Entretela (Victor v.5.1): na emenda = a largura franzida (consumo 2×2 = 4), não a metragem.
    const ent = r.itens.find((i) => i.item === 'Entretela (KOS)');
    expect(ent?.quantidade).toBe(4);
  });
  it('franzido 3 → ainda 2 faixas (consumo 6 = 2×3) = 8,64 m', () => {
    const r = caso(3);
    expect(r.tiras_frente).toBe(2);
    expect(r.metragem_frente).toBe(8.64);
  });
  it('franzido 3,5 → 3 faixas (consumo 7 > 6) = 12,96 m', () => {
    const r = caso(3.5);
    expect(r.tiras_frente).toBe(3);
    expect(r.metragem_frente).toBe(12.96);
  });
});

describe('Cortina — método barra postiça', () => {
  it('quando abertura é central, soma metade da metragem normal arredondada', () => {
    const r = calcularCortina({
      modelo: 'franzido', fixacao: 'trilho', config: 'um_tecido',
      largura: 1.27, altura: 4.0, largura_tecido: 3.0,
      franzido_frente: 3, tamanho_barra: 0.1, tipo_barra: 'dupla',
      aberturas: 2, metodo_altura: 'barra_postica',
    });
    expect(r.metodo).toBe('barra_postica');
    expect(r.altura_excede_tecido).toBe(true);
    expect(r.barra_postica_base).toBe(3.85);
    expect(r.barra_postica_acrescimo).toBe(1.95);
    expect(r.metragem_frente).toBe(5.8);
    expect(r.tiras_frente).toBeNull();
  });

  it('quando é sem abertura, soma outra metragem normal completa', () => {
    const r = calcularCortina({
      modelo: 'franzido', fixacao: 'trilho', config: 'um_tecido',
      largura: 3, altura: 4.0, largura_tecido: 3.0,
      franzido_frente: 3, tamanho_barra: 0.1, tipo_barra: 'dupla',
      aberturas: 1, metodo_altura: 'barra_postica',
    });
    expect(r.metodo).toBe('barra_postica');
    expect(r.barra_postica_base).toBe(9);
    expect(r.barra_postica_acrescimo).toBe(9);
    expect(r.metragem_frente).toBe(18);
  });
});

describe('Cortina Wave (fator de tecido medido pelo Victor + acessórios deduzidos)', () => {
  it('trilho 3 m → tecido/entretela 8,10 m (fator 2,7), 64 botões, cordão 3,15 m', () => {
    const r = calcularCortina({ ...BASE, modelo: 'wave', fixacao: 'trilho', largura: 3, largura_tecido: 3.0 });
    expect(r.metodo).toBe('normal');
    expect(r.metragem_frente).toBe(8.1); // 3,00 × 2,7 (Victor 16/06)
    expect(qtd(r, 'Entretela (KOS)')).toBe(8.1);
    expect(qtd(r, 'Rodízio wave')).toBe(64);
    expect(qtd(r, 'Base click')).toBe(64);
    expect(qtd(r, 'Cordão wave')).toBe(3.15);
    expect(qtd(r, 'Terminais')).toBe(4);
    expect(qtd(r, 'Ponteira')).toBeUndefined(); // trilho não usa
  });

  it('no varão suíço usa ponteira (2)', () => {
    const r = calcularCortina({ ...BASE, modelo: 'wave', fixacao: 'varao_suico', largura: 3, largura_tecido: 3.0 });
    expect(qtd(r, 'Ponteira')).toBe(2);
  });
});

describe('Cortina — tecido cortado de 5 em 5 cm (Victor 16/06)', () => {
  it('consumo 3,81 m (1,27 × 3) arredonda p/ cima → 3,85 m', () => {
    const r = calcularCortina({ ...BASE, modelo: 'franzido', largura: 1.27, altura: 2.0, largura_tecido: 3.0, franzido_frente: 3 });
    expect(r.metodo).toBe('normal');
    expect(r.consumo_frente).toBe(3.81);
    expect(r.metragem_frente).toBe(3.85); // múltiplo de 0,05 m
  });
});

describe('Cortina multi-camada (modelo "+" do Victor)', () => {
  const accQtd = (r: ResultadoCortinaCompleta, item: string) => r.acessorios.find((i) => i.item === item)?.quantidade;

  it('simples (1 camada) → mesma metragem/ferragem da cortina única', () => {
    const r = calcularCortinaMultiCamada({
      modelo: 'ilhos', fixacao: 'varao', largura: 3, altura: 2.6,
      camadas: [{ largura_tecido: 3.0, franzido: 3 }],
    });
    expect(r.n_camadas).toBe(1);
    expect(r.camadas[0].metragem).toBe(9);
    expect(accQtd(r, 'Ilhoses')).toBe(60);
    expect(accQtd(r, 'Entretela (KOS)')).toBe(9);
    expect(accQtd(r, 'Varão')).toBe(3);
    expect(accQtd(r, 'Ponteira')).toBe(2);
  });

  it('dupla (2 camadas) → varão POR CAMADA; ferragem soma; entretela POR CAMADA (Victor v.4.1)', () => {
    const r = calcularCortinaMultiCamada({
      modelo: 'ilhos', fixacao: 'varao', largura: 3, altura: 2.6,
      camadas: [{ largura_tecido: 3.0, franzido: 3 }, { largura_tecido: 3.0, franzido: 3 }],
    });
    expect(r.n_camadas).toBe(2);
    expect(r.camadas).toHaveLength(2);
    // Varão NÃO é agregado (Victor 19/06): 1 linha por camada, escolhido individualmente.
    expect(accQtd(r, 'Varão')).toBeUndefined();
    expect(accQtd(r, 'Varão (camada 1)')).toBe(3);
    expect(accQtd(r, 'Varão (camada 2)')).toBe(3);
    expect(accQtd(r, 'Ilhoses')).toBe(120); // 60 + 60 (por tecido)
    expect(accQtd(r, 'Ponteira')).toBe(4); // 2 + 2 (por tecido)
    // Entretela agora entra em CADA camada com entretela (Victor v.4.1): 9 + 9 = 18.
    expect(accQtd(r, 'Entretela (KOS)')).toBe(18);
  });

  it('frente WAVE + fundo FRANZIDO (modelo por camada, Victor v.4.1)', () => {
    const r = calcularCortinaMultiCamada({
      modelo: 'wave', fixacao: 'trilho', largura: 3, altura: 2,
      camadas: [{ largura_tecido: 2.8, modelo: 'wave' }, { largura_tecido: 2.8, modelo: 'franzido', franzido: 2.5 }],
    });
    expect(r.n_camadas).toBe(2);
    // Camada wave → itens do wave (incl. fita wave); camada franzido → rodízios.
    expect(accQtd(r, 'Cordão wave')).toBeGreaterThan(0);
    expect(accQtd(r, 'Fita wave')).toBeGreaterThan(0);
    expect(accQtd(r, 'Rodízios/ganchos')).toBe(30);
    // Trilho conta 1 vez e os Terminais também (1 rail só), mesmo com 2 camadas.
    expect(accQtd(r, 'Trilho')).toBe(3);
    expect(accQtd(r, 'Terminais')).toBe(4);
    // Entretela só da camada wave (franzido não tem entretela).
    expect(accQtd(r, 'Entretela (KOS)')).toBe(r.camadas[0].metragem);
  });

  it('varão suíço → por camada; trilho conta 1 vez (duplo/triplo, Victor 19/06)', () => {
    const suico = calcularCortinaMultiCamada({
      modelo: 'prega', fixacao: 'varao_suico', largura: 3, altura: 2.6,
      camadas: [{ largura_tecido: 3.0, franzido: 2 }, { largura_tecido: 3.0, franzido: 2 }],
    });
    expect(accQtd(suico, 'Varão suíço (camada 1)')).toBe(3);
    expect(accQtd(suico, 'Varão suíço (camada 2)')).toBe(3);

    const trilho = calcularCortinaMultiCamada({
      modelo: 'prega', fixacao: 'trilho', largura: 3, altura: 2.6,
      camadas: [{ largura_tecido: 3.0, franzido: 2 }, { largura_tecido: 3.0, franzido: 2 }],
    });
    // Trilho = 1 trilho duplo/triplo: conta UMA vez (largura), não soma por camada.
    expect(accQtd(trilho, 'Trilho')).toBe(3);
    expect(trilho.acessorios.filter((a) => a.item === 'Trilho')).toHaveLength(1);
    // Rodízios/ganchos continuam por tecido.
    expect(accQtd(trilho, 'Rodízios/ganchos')).toBe(60); // 30 + 30
  });

  it('costurado junto na camada 2 calcula só tecido, sem acessórios próprios', () => {
    const mesmaQtd = calcularCortinaMultiCamada({
      modelo: 'prega', fixacao: 'trilho', largura: 3, altura: 2.6,
      camadas: [
        { largura_tecido: 3.0, modelo: 'prega', franzido: 3 },
        { largura_tecido: 3.0, modelo: 'costurado_junto', costurado_quantidade: 'mesma_quantidade' },
      ],
    });
    expect(mesmaQtd.camadas[1].costurado_junto).toBe(true);
    expect(mesmaQtd.camadas[1].metragem).toBe(mesmaQtd.camadas[0].metragem);
    expect(accQtd(mesmaQtd, 'Trilho')).toBe(3);
    expect(accQtd(mesmaQtd, 'Rodízios/ganchos')).toBe(30);
    expect(accQtd(mesmaQtd, 'Entretela (KOS)')).toBe(9);

    const proporcao = calcularCortinaMultiCamada({
      modelo: 'prega', fixacao: 'trilho', largura: 3, altura: 2.6,
      camadas: [
        { largura_tecido: 3.0, modelo: 'prega', franzido: 3 },
        { largura_tecido: 3.0, modelo: 'costurado_junto', franzido: 2, costurado_quantidade: 'proporcao_franzido' },
      ],
    });
    expect(proporcao.camadas[1].metragem).toBe(6);
    expect(proporcao.camadas[1].barra_consumo).toBe(0.28);
    expect(accQtd(proporcao, 'Rodízios/ganchos')).toBe(30);
  });

  it('rejeita 0 ou mais de 3 camadas', () => {
    expect(() => calcularCortinaMultiCamada({ modelo: 'ilhos', fixacao: 'varao', largura: 3, altura: 2.6, camadas: [] })).toThrow();
    expect(() => calcularCortinaMultiCamada({ modelo: 'ilhos', fixacao: 'varao', largura: 3, altura: 2.6, camadas: Array(4).fill({ largura_tecido: 3 }) })).toThrow();
  });
});

describe('Cortina — modelos não implementados', () => {
  it('modelo desconhecido lança NotImplementedError', () => {
    expect(() => calcularCortina({ ...BASE, modelo: 'persiana' as unknown as EntradaCortina['modelo'] })).toThrow(NotImplementedError);
  });
});
