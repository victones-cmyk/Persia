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
// legítimos, nenhum agrupamento falso.
//
// Mesmo funcionando, o nome falha em SILÊNCIO: um tecido novo cadastrado sem o
// sufixo de largura não agrupa, e ninguém vê erro — a recomendação só deixa de
// aparecer. Por isso existe o campo extra "COD TECIDO" (Victor, 12/09/2026):
// quando os dois rolos o tiverem, ele manda; enquanto não, o nome segura. Ver
// mesmoTecido.

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
  /** Campo extra "COD TECIDO" do GestãoClick. Vazio = não cadastrado. */
  codigo_tecido?: string;
}

/**
 * a e b são o mesmo tecido em rolos diferentes?
 *
 * É uma comparação par a par, e não uma chave única, por causa do preenchimento
 * PARCIAL: enquanto o cadastro está em andamento, um rolo tem o código e o
 * outro ainda não. Com chave única esse par se separaria e a recomendação
 * sumiria da tela sem nenhum aviso — a falha silenciosa que o campo veio
 * justamente evitar.
 *
 *   os dois têm código   -> manda o código (permite separar tecidos que o nome
 *                           juntaria, e juntar os que o nome separa)
 *   nenhum tem           -> cai no nome, como sempre foi
 *   só um tem            -> cai no nome, até o outro ser preenchido
 */
export function mesmoTecido(a: TecidoDoCatalogo, b: TecidoDoCatalogo): boolean {
  const ca = (a.codigo_tecido ?? '').trim();
  const cb = (b.codigo_tecido ?? '').trim();
  if (ca && cb) return ca.toUpperCase() === cb.toUpperCase();
  return chaveDoTecido(a.nome) === chaveDoTecido(b.nome);
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
  const irmaos = args.catalogo.filter((t) => mesmoTecido(args.selecionado, t));
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

export interface GrupoDeTecido {
  /** Como a Pérsia enxerga o grupo: o código, quando há; senão o nome-base. */
  chave: string;
  por_codigo: boolean;
  rolos: { id: string; nome: string; dimensao_m: number; codigo_tecido: string }[];
}

/**
 * Como a Pérsia agrupa TODO o catálogo — material do diagnóstico no admin.
 *
 * Existe porque o agrupamento errado não dá erro: ele só deixa de recomendar,
 * ou recomenda o rolo de outra cor. As duas coisas passam despercebidas na
 * operação. Aqui o Victor vê a conta fechada e confere o próprio cadastro.
 *
 * O(n²) de propósito: a relação é par a par (ver mesmoTecido), o catálogo tem
 * ordem de duzentos tecidos, e isto roda numa tela de administração.
 */
export function agruparTecidos(catalogo: TecidoDoCatalogo[]): GrupoDeTecido[] {
  const pendentes = [...catalogo];
  const grupos: GrupoDeTecido[] = [];

  while (pendentes.length > 0) {
    const primeiro = pendentes.shift()!;
    const membros = [primeiro];
    for (let i = pendentes.length - 1; i >= 0; i--) {
      if (mesmoTecido(primeiro, pendentes[i])) membros.push(...pendentes.splice(i, 1));
    }
    const codigo = (primeiro.codigo_tecido ?? '').trim();
    grupos.push({
      chave: codigo || chaveDoTecido(primeiro.nome),
      por_codigo: Boolean(codigo) && membros.every((m) => (m.codigo_tecido ?? '').trim()),
      rolos: membros
        .map((m) => ({ id: m.id, nome: m.nome, dimensao_m: m.dimensao_m, codigo_tecido: (m.codigo_tecido ?? '').trim() }))
        .sort((a, b) => a.dimensao_m - b.dimensao_m),
    });
  }

  return grupos.sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
}

/**
 * Tecidos com código cadastrado que mesmo assim ficaram sozinhos.
 *
 * É o sinal mais útil do diagnóstico: quem preenche um código espera parear com
 * alguém. Sozinho, quase sempre é erro de digitação num dos dois rolos — e sem
 * esta lista isso não aparece em lugar nenhum.
 */
export function codigosOrfaos(grupos: GrupoDeTecido[]): GrupoDeTecido[] {
  return grupos.filter((g) => g.rolos.length === 1 && g.rolos[0].codigo_tecido !== '');
}
