// apps/api/src/services/calc/calculadorasCortina.test.ts
// Testes unitários para o gerenciador de calculadoras de cortina dinâmicas.

import { describe, it, expect, vi } from 'vitest';
import {
  getCalculadorasCortina,
  getCalculadorasCortinaAtivas,
  encontrarCalculadoraCortina,
  carregarCalculadorasCortina,
  CALCULADORAS_CORTINA_DEFAULT,
} from './calculadorasCortina';
import type { PrismaClient } from '@prisma/client';

describe('CalculadorasCortina Service', () => {
  it('retorna os valores padrões inicialmente', () => {
    const list = getCalculadorasCortina();
    expect(list).toEqual(CALCULADORAS_CORTINA_DEFAULT);
  });

  it('encontra uma calculadora padrão pelo ID', () => {
    const calc = encontrarCalculadoraCortina('cortina_wave_simples');
    expect(calc).toBeDefined();
    expect(calc?.nome).toBe('Cortina Wave Simples (Trilho)');
    expect(calc?.codigo_gc).toBe('5913');
    expect(calc?.db_tipo_produto).toBe('cortina');
    expect(calc?.modelo_base).toBe('wave');
    expect(calc?.fixacao_default).toBe('trilho');
  });

  it('carrega calculadoras do banco e atualiza cache em memória', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      valor: JSON.stringify([{
        id: 'cortina_teste_custom',
        nome: 'Cortina Teste Customizada',
        db_tipo_produto: 'cortina',
        codigo_gc: '9999',
        modelo_base: 'wave',
        fixacao_default: 'varao',
        tamanho_barra_default: 0.15,
        tipo_barra_default: 'simples',
        aberturas_default: 2,
        camadas: [
          {
            id: 'camada_1',
            nome: 'Camada Unica',
            modelo_default: 'wave',
            franzido_default: 3
          }
        ]
      }])
    });

    const mockPrisma = {
      configuracao: {
        findUnique: mockFindUnique,
      }
    } as unknown as PrismaClient;

    await carregarCalculadorasCortina(mockPrisma);

    const calc = encontrarCalculadoraCortina('cortina_teste_custom');
    expect(calc).toBeDefined();
    expect(calc?.nome).toBe('Cortina Teste Customizada');
    expect(calc?.codigo_gc).toBe('9999');
    expect(calc?.tamanho_barra_default).toBe(0.15);
    expect(calc?.bainhas_laterais_default).toBe(0);
    expect(calc?.camadas[0].nome).toBe('Camada Unica');

    // Restaura o estado em memória para evitar poluir outros testes
    const mockFindUniqueEmpty = vi.fn().mockResolvedValue(null);
    const mockUpsert = vi.fn().mockResolvedValue({});
    const mockPrismaEmpty = {
      configuracao: {
        findUnique: mockFindUniqueEmpty,
        upsert: mockUpsert,
      }
    } as unknown as PrismaClient;
    await carregarCalculadorasCortina(mockPrismaEmpty);
    expect(encontrarCalculadoraCortina('cortina_teste_custom')).toBeUndefined();
  });

  it('filtra modelos de cortina inativos na lista pública', async () => {
    const base = {
      db_tipo_produto: 'cortina',
      codigo_gc: '9999',
      modelo_base: 'wave',
      fixacao_default: 'trilho',
      tamanho_barra_default: 0.1,
      tipo_barra_default: 'dupla',
      aberturas_default: 1,
      camadas: [{ id: 'camada_1', nome: 'Frente', modelo_default: 'wave', franzido_default: 2.7 }],
    };
    const mockFindUnique = vi.fn().mockResolvedValue({
      valor: JSON.stringify([
        { ...base, id: 'cortina_ativa', nome: 'Cortina Ativa', ativo: true },
        { ...base, id: 'cortina_inativa', nome: 'Cortina Inativa', ativo: false },
      ]),
    });
    const mockPrisma = { configuracao: { findUnique: mockFindUnique } } as unknown as PrismaClient;

    await carregarCalculadorasCortina(mockPrisma);

    expect(getCalculadorasCortina().map((c) => c.id)).toContain('cortina_inativa');
    expect(getCalculadorasCortinaAtivas().map((c) => c.id)).toEqual(['cortina_ativa']);
  });
});
