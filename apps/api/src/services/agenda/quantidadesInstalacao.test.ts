import { describe, it, expect } from 'vitest';
import { contarInstalacoes, classificarInstalacao } from './quantidadesInstalacao';

describe('classificarInstalacao', () => {
  it('reconhece motorizada pelo nome', () => {
    expect(classificarInstalacao({ instalacao_nome: 'INSTALAÇÃO MOTORIZADA' })).toBe('motorizada');
  });

  it('reconhece manual', () => {
    expect(classificarInstalacao({ instalacao_nome: 'INSTALAÇÃO MANUAL' })).toBe('manual');
  });

  it('item sem instalação não é nem um nem outro', () => {
    // 186 dos 428 itens vendidos em produção estão assim: o cliente instala.
    expect(classificarInstalacao({})).toBe('nenhuma');
    expect(classificarInstalacao({ instalacao_nome: '' })).toBe('nenhuma');
    expect(classificarInstalacao({ instalacao_nome: '   ' })).toBe('nenhuma');
  });

  it('não depende do id, que muda quando o catálogo ressincroniza', () => {
    expect(classificarInstalacao({ instalacao_nome: 'INSTALAÇÃO MOTORIZADA', instalacao_id: '999' })).toBe('motorizada');
    expect(classificarInstalacao({ instalacao_nome: 'INSTALAÇÃO MANUAL', instalacao_id: '94575656' })).toBe('manual');
  });

  it('tolera acento, caixa e espaço', () => {
    expect(classificarInstalacao({ instalacao_nome: '  instalacao motorizada  ' })).toBe('motorizada');
    expect(classificarInstalacao({ instalacao_nome: 'Instalação Motorizada' })).toBe('motorizada');
  });
});

describe('contarInstalacoes', () => {
  it('conta manual e motorizada separadamente, sem somar uma na outra', () => {
    // São pagas separadamente e somadas na Agenda: se a manual incluísse as
    // motorizadas, a mesma peça seria paga duas vezes.
    const q = contarInstalacoes([
      { instalacao_nome: 'INSTALAÇÃO MANUAL' },
      { instalacao_nome: 'INSTALAÇÃO MANUAL' },
      { instalacao_nome: 'INSTALAÇÃO MOTORIZADA' },
    ]);
    expect(q).toEqual({ manual: 2, motorizada: 1, sem_instalacao: 0 });
  });

  it('deixa fora as peças que o cliente instala', () => {
    const q = contarInstalacoes([
      { instalacao_nome: 'INSTALAÇÃO MANUAL' },
      {},
      { instalacao_nome: null },
    ]);
    expect(q.manual).toBe(1);
    expect(q.sem_instalacao).toBe(2);
  });

  it('orçamento inteiro sem instalação não gera pagamento nenhum', () => {
    const q = contarInstalacoes([{}, {}, {}]);
    expect(q.manual).toBe(0);
    expect(q.motorizada).toBe(0);
  });

  it('lista vazia não quebra', () => {
    expect(contarInstalacoes([])).toEqual({ manual: 0, motorizada: 0, sem_instalacao: 0 });
  });

  it('produto complexo marcado como motorizado conta como motorizado', () => {
    // Caso que o Victor descreveu: o vendedor marca "instalação motorizada" numa
    // peça manual porque o serviço é difícil. O que vale é o que ele marcou.
    const q = contarInstalacoes([{ instalacao_nome: 'INSTALAÇÃO MOTORIZADA', acionamento: 'com_barra' } as never]);
    expect(q.motorizada).toBe(1);
    expect(q.manual).toBe(0);
  });
});
