// apps/api/src/services/calc/seletorTecido.ts
// O mesmo tecido em rolos de larguras diferentes — qual sai mais barato nesta peça.
//
// POR QUE PELO NOME. Um rolo de 1,80 m e um de 2,25 m do mesmo tecido são dois
// produtos sem nenhuma ligação no GestãoClick: ids diferentes e codigo_interno
// de formatos completamente diferentes entre si (2024550525002 contra
// 17520-02457-0485 no mesmo tecido). Não existe campo que os ligue. O nome é o
// único sinal, e nele a largura aparece só onde precisa — justamente nos
// tecidos que têm mais de um rolo:
//
//   DOUBLE VISION BRANCO AM-3640 1,80M   \  mesmo tecido
//   DOUBLE VISION BRANCO AM-3640 2,25M   /
//   DOUBLE VISION BEGE ESCURO AM-4478B 2,25M   <- outro tecido, outro código
//
// Medido no catálogo real em 12/09/2026: 9 grupos com mais de um rolo, todos
// legítimos, nenhum agrupamento falso. Se um dia o Victor criar um campo de
// "código do tecido" no GC (como já fez com LARGURA), é só trocar chaveDoTecido
// — o resto deste arquivo não muda.

/** Sufixo de largura no fim do nome: "2,00m", "1,80 M", "2,25M". */
const SUFIXO_LARGURA = /\s*\d+[,.]\d+\s*m\s*$/i;

/**
 * Identidade do tecido, ignorando o rolo.
 *
 * Exige a vírgula/ponto de propósito: sem isso "…AM-3640" e outros códigos que
 * terminam em dígito+M entrariam na regra e tecidos diferentes virariam um só.
 */
export function chaveDoTecido(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SUFIXO_LARGURA, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface TecidoDoCatalogo {
  id: string;
  nome: string;
  dimensao_m: number;
  preco_venda: number;
  preco_custo?: number;
}

export interface RoloDoTecido {
  id: string;
  nome: string;
  dimensao_m: number;
  /** A peça cabe na largura deste rolo. */
  cabe: boolean;
  /** Quanto sobra do rolo depois da peça (m). Negativo quando não cabe. */
  folga_m: number;
  /** Preço da peça inteira com este rolo. */
  valor: number;
  /** Diferença contra o rolo selecionado hoje. */
  diferenca: number;
  selecionado: boolean;
  /** O mais barato entre os que cabem. */
  recomendado: boolean;
}

const arredondar = (n: number): number => Math.round(n * 100) / 100;

/**
 * Os rolos do mesmo tecido, com o preço desta peça em cada um.
 *
 * Devolve lista vazia quando só existe um rolo: não há escolha a oferecer, e
 * mostrar uma opção única só ocupa espaço na tela.
 *
 * `precoDaPeca` é injetado para este módulo não depender do motor de preço nem
 * do GestãoClick — quem chama já tem os mapas de preço carregados.
 */
export function rolosDoMesmoTecido(args: {
  selecionado: TecidoDoCatalogo;
  catalogo: TecidoDoCatalogo[];
  largura: number;
  precoDaPeca: (tecido: TecidoDoCatalogo) => number;
}): RoloDoTecido[] {
  const chave = chaveDoTecido(args.selecionado.nome);
  const irmaos = args.catalogo.filter((t) => chaveDoTecido(t.nome) === chave);
  if (irmaos.length < 2) return [];

  const valorSelecionado = args.precoDaPeca(args.selecionado);

  const rolos: RoloDoTecido[] = irmaos.map((t) => {
    const selecionado = t.id === args.selecionado.id;
    const valor = selecionado ? valorSelecionado : arredondar(args.precoDaPeca(t));
    return {
      id: t.id,
      nome: t.nome,
      dimensao_m: t.dimensao_m,
      cabe: args.largura <= t.dimensao_m,
      folga_m: arredondar(t.dimensao_m - args.largura),
      valor,
      diferenca: arredondar(valor - valorSelecionado),
      selecionado,
      recomendado: false,
    };
  });

  // Mais barato entre os que cabem. Empate fica com o rolo mais estreito: sobra
  // menos material na ponta, e o rolo largo continua disponível para a peça que
  // realmente precisa dele.
  const cabem = rolos.filter((r) => r.cabe);
  if (cabem.length > 0) {
    const melhor = cabem.reduce((a, b) =>
      b.valor < a.valor || (b.valor === a.valor && b.dimensao_m < a.dimensao_m) ? b : a,
    );
    melhor.recomendado = true;
  }

  // Do mais estreito para o mais largo: é a ordem em que o vendedor pensa, e
  // costuma coincidir com a ordem de preço.
  return rolos.sort((a, b) => a.dimensao_m - b.dimensao_m);
}

/** Há uma troca que vale a pena? (o recomendado não é o que está escolhido) */
export function temEconomia(rolos: RoloDoTecido[]): boolean {
  return rolos.some((r) => r.recomendado && !r.selecionado && r.diferenca < 0);
}
