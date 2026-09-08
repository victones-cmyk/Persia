// apps/api/src/services/agenda/quantidadesInstalacao.ts
// Quantas peças o técnico instala, separadas por tipo de instalação.
//
// É disso que sai o pagamento dele na Agenda: manual e motorizada têm valores
// diferentes e são SOMADAS, então a contagem manual não pode incluir as
// motorizadas — sairia peça paga duas vezes.
//
// A classificação é pela INSTALAÇÃO ESCOLHIDA no item, não pelo produto. O
// Victor foi explícito: em produto mais complexo o vendedor marca "instalação
// motorizada" mesmo sendo manual, porque o que se está cobrando ali é a
// dificuldade do serviço, não o motor. Classificar por `acionamento` pagaria o
// técnico a menos justamente nos casos difíceis.
//
// Item SEM instalação fica fora das duas contas. Não é detalhe: hoje em
// produção 186 dos 428 itens vendidos não têm instalação — o cliente mesmo
// instala. Contá-los pagaria o técnico por peça em que ele nem encosta.

export interface ItemInstalavel {
  instalacao_nome?: unknown;
  instalacao_id?: unknown;
}

export interface QuantidadesInstalacao {
  /** Peças de instalação manual. */
  manual: number;
  /** Peças de instalação motorizada. */
  motorizada: number;
  /** Peças sem instalação — o cliente instala. Fora do pagamento. */
  sem_instalacao: number;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Classifica pelo NOME da instalação, não pelo id.
 *
 * O id do produto muda quando o catálogo é ressincronizado — é a mesma razão
 * pela qual o motor de preço casa componentes por codigo_interno e nunca por
 * id. O nome é o que o vendedor escolhe na tela e o que sobrevive à sincronia.
 */
export function classificarInstalacao(item: ItemInstalavel): 'manual' | 'motorizada' | 'nenhuma' {
  const nome = typeof item.instalacao_nome === 'string' ? item.instalacao_nome.trim() : '';
  if (!nome) return 'nenhuma';
  return semAcento(nome).includes('motoriz') ? 'motorizada' : 'manual';
}

/** Conta as peças de um orçamento, uma linha por peça instalada. */
export function contarInstalacoes(itens: ItemInstalavel[]): QuantidadesInstalacao {
  const q: QuantidadesInstalacao = { manual: 0, motorizada: 0, sem_instalacao: 0 };
  for (const item of itens) {
    const c = classificarInstalacao(item);
    if (c === 'manual') q.manual += 1;
    else if (c === 'motorizada') q.motorizada += 1;
    else q.sem_instalacao += 1;
  }
  return q;
}
