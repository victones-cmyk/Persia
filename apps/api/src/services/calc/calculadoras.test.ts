// apps/api/src/services/calc/calculadoras.test.ts
// Testes unitários para o gerenciador de calculadoras e receitas dinâmicas.

import { describe, it, expect, vi } from 'vitest';
import { getCalculadoras, getCalculadorasAtivas, encontrarCalculadora, carregarCalculadoras, CALCULADORAS_DEFAULT } from './calculadoras';
import type { PrismaClient } from '@prisma/client';

describe('Calculadoras Service', () => {
  it('retorna os valores padrões inicialmente', () => {
    const list = getCalculadoras();
    expect(list).toEqual(CALCULADORAS_DEFAULT);
  });

  it('encontra uma calculadora padrão pelo ID', () => {
    const calc = encontrarCalculadora('persiana_rolo_blackout');
    expect(calc).toBeDefined();
    expect(calc?.nome).toBe('Persiana Rolo Blackout');
    expect(calc?.codigo_gc).toBe('2591');
    expect(calc?.db_tipo_produto).toBe('persiana_rolo_blackout');
  });

  it('carrega calculadoras do banco e atualiza cache em memória', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      valor: JSON.stringify([{
        id: 'calc_teste_custom',
        nome: 'Persiana Teste Customizada',
        db_tipo_produto: 'persiana_rolo_blackout',
        codigo_gc: '9999',
        familia: 'rolo_bk_translucido',
        margem: 0.20,
        dobrar_altura: false,
        base_venda: 'dimensao',
        fator_venda: 1.0,
        mao_de_obra: 'MÃO DE OBRA CUSTOM',
        receitas: {}
      }])
    });

    const mockPrisma = {
      configuracao: {
        findUnique: mockFindUnique,
      }
    } as unknown as PrismaClient;

    await carregarCalculadoras(mockPrisma);

    const calc = encontrarCalculadora('calc_teste_custom');
    expect(calc).toBeDefined();
    expect(calc?.nome).toBe('Persiana Teste Customizada');
    expect(calc?.codigo_gc).toBe('9999');
    expect(calc?.margem).toBe(0.20);
    expect(calc?.mao_de_obra).toBe('MÃO DE OBRA CUSTOM');

    // Restaura o estado em memória para evitar poluir outros testes
    const mockFindUniqueEmpty = vi.fn().mockResolvedValue(null);
    const mockUpsert = vi.fn().mockResolvedValue({});
    const mockPrismaEmpty = {
      configuracao: {
        findUnique: mockFindUniqueEmpty,
        upsert: mockUpsert,
      }
    } as unknown as PrismaClient;
    await carregarCalculadoras(mockPrismaEmpty);
    expect(encontrarCalculadora('calc_teste_custom')).toBeUndefined();
  });

  it('filtra calculadoras inativas na lista pública', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      valor: JSON.stringify([
        {
          id: 'calc_ativa',
          nome: 'Persiana Ativa',
          db_tipo_produto: 'persiana_rolo_blackout',
          codigo_gc: '1',
          familia: 'rolo_bk_translucido',
          margem: 0.2,
          dobrar_altura: false,
          base_venda: 'dimensao',
          fator_venda: 1,
          mao_de_obra: 'MÃO DE OBRA',
          ativo: true,
          receitas: {},
        },
        {
          id: 'calc_inativa',
          nome: 'Persiana Inativa',
          db_tipo_produto: 'persiana_rolo_blackout',
          codigo_gc: '2',
          familia: 'rolo_bk_translucido',
          margem: 0.2,
          dobrar_altura: false,
          base_venda: 'dimensao',
          fator_venda: 1,
          mao_de_obra: 'MÃO DE OBRA',
          ativo: false,
          receitas: {},
        },
      ]),
    });
    const mockPrisma = { configuracao: { findUnique: mockFindUnique } } as unknown as PrismaClient;

    await carregarCalculadoras(mockPrisma);

    expect(getCalculadoras().map((c) => c.id)).toContain('calc_inativa');
    expect(getCalculadorasAtivas().map((c) => c.id)).toContain('calc_ativa');
    expect(getCalculadorasAtivas().map((c) => c.id)).not.toContain('calc_inativa');
  });
});

// As receitas que já estão no banco nasceram com a perda de corte dentro da fórmula
// da quantidade. Este teste trava a separação — e trava também o que ela NÃO faz.
describe('migração: perda de corte embutida na fórmula do tecido', () => {
  const calculadoraCom = (tecido_qtd: string, tecido_perda?: number) => ({
    id: 'persiana_rolo_screen', nome: 'Screen', db_tipo_produto: 'persiana_rolo_screen',
    codigo_gc: '2592', familia: 'tela_solar', margem: 0.15, dobrar_altura: false,
    base_venda: 'largura', fator_venda: 1.3, mao_de_obra: 'MÃO DE OBRA PERSIANA',
    receitas: { com_bando: { componentes: [], tecido_qtd, ...(tecido_perda ? { tecido_perda } : {}) } },
  });

  const carregar = async (calc: unknown) => {
    const prisma = {
      configuracao: {
        findUnique: vi.fn().mockResolvedValue({ valor: JSON.stringify([calc]) }),
        update: vi.fn(), upsert: vi.fn(),
      },
    } as unknown as PrismaClient;
    await carregarCalculadoras(prisma);
    return encontrarCalculadora('persiana_rolo_screen')?.receitas.com_bando;
  };

  it('tira o *1.2 da quantidade e o registra como perda', async () => {
    const r = await carregar(calculadoraCom('LARGURA*(ALTURA+0.2)*1.2'));
    expect(r?.tecido_qtd).toBe('LARGURA*(ALTURA+0.2)');
    expect(r?.tecido_perda).toBe(1.2);
  });

  it('não mexe em fórmula que alguém já ajustou à mão', async () => {
    const r = await carregar(calculadoraCom('LARGURA*(ALTURA+0.3)*1.15'));
    expect(r?.tecido_qtd).toBe('LARGURA*(ALTURA+0.3)*1.15');
    expect(r?.tecido_perda).toBeUndefined();
  });

  it('não roda de novo em receita que já tem perda declarada', async () => {
    const r = await carregar(calculadoraCom('LARGURA*(ALTURA+0.2)*1.2', 1.2));
    expect(r?.tecido_qtd).toBe('LARGURA*(ALTURA+0.2)*1.2');
    expect(r?.tecido_perda).toBe(1.2);
  });
});
