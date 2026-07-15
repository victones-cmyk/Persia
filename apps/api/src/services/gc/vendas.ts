import { gcRequest, type GcEnvelope } from './client';

interface VendaCriada {
  id: string;
  codigo?: string;
}

export interface ResultadoVenda {
  gc_pedido_id: string;
  gc_pedido_codigo: string | null;
  payload: Record<string, unknown>;
  resposta: unknown;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function produtoVenda(v: unknown): Record<string, unknown> {
  const p = objeto(v);
  const id = p.produto_id ?? p.id;
  return {
    ...p,
    ...(id ? { produto_id: id } : {}),
  };
}

function servicoVenda(v: unknown): Record<string, unknown> {
  const s = objeto(v);
  const id = s.servico_id ?? s.id;
  return {
    ...s,
    ...(id ? { servico_id: id } : {}),
  };
}

export const OBSERVACOES_CONTRATO_VENDA = `OBSERVAÇÕES PARA INSTALAÇÃO DE CORTINAS:
 - Garantia de instalação: 90 dias. Visitas solicitadas após este período terão custo da tabela vigente na época da solicitação. Caso haja solicitação de retorno em garantia em que o defeito tenha sido causado por mau uso ou qualquer tipo de acidente que não esteja vinculado à instalação, será cobrado o valor de R$200,00 a visita. Retornos fora da cidade de São Paulo, ABC paulista e Guarulhos, independentemente do prazo, terão custo de deslocamento, a ser consultado na data de requisição;
 - A empresa não se responsabiliza por danos causados a encanamentos durante a instalação que não tenham sido avisados previamente, bem como desníveis no piso, teto ou vão;
 - Caso o cliente opte por confirmação de medidas efetuadas pela loja, variações das medidas informadas no ato do pedido em relação às obtidas pela empresa podem gerar alteração do valor do pedido;
 - As instalações são feitas em horário comercial, de segunda à sexta, das 09:00 às 17:00 e aos sábados das 09:00 às 17:00. Para instalações com horário marcado ou fora do horário comercial, consultar a tabela de preços vigente no período. Apenas o turno(manhã, das 09:00 as 12:00 ou tarde, das 12:00 as 17:00) podem ser marcados com antecedência;
 - É indispensável que no ato de medição ou instalação haja pessoa responsável, ciente do serviço a ser realizado para orientar o instalador/medidor;
 - O instalador não está autorizado a subir mais do que 3 andares de escada com a mercadoria a ser entregue. Caso necessário, o instalador cortará o varão/trilho da cortina no meio ou na abertura adequada para que os mesmos possam ser instalados com segurança;
 - Em hipótese alguma nosso instalador está autorizado a içar, por corda ou guindaste qualquer mercadoria. Caso seja necessário, este procedimento é por conta do cliente;
 - Por padrão, cortinas feitas sob medida, que ocupem a parede toda, são instaladas a 1(um) centímetro do chão. Caso haja a necessidade de modificação, é necessário informar ao vendedor no ato da compra;
 - Ao agendar a instalação, o cliente se compromete em deixar o(s) ambiente(s) limpo(s), para que os produtos como cortinas e papel de parede não sejam danificados ou sujos;
 - No caso de instalação em teto de gesso, o cliente se responsabiliza que o mesmo suportará o peso da cortina ou persiana. No caso de cortinas persianas motorizadas, o cliente se compromete em deixar os pontos de energia sinalizados pela consultora de vendas para cada peça com motorização e deverá informar o tipo de automação residencial, se aplicável, ou informar o contato da empresa contratada;
 - Em caso de medição antes do gesso estar pronto, o cliente se compromete em deixar os cortineiros com as dimensões mínimas estabelecidas para a instalação do produto escolhido;
 - Varandas fechadas com vidro: Se na primeira medição a varanda ainda estiver sem os vidros, uma nova medição deverá ser feita assim que os mesmos forem instalados, somente após isso o pedido será realizado. Se o cliente mesmo assim desejar que as peças sejam produzidas, não nos responsabilizamos por alterações no vidro e puxadores. Móveis e rodapés instalados posteriormente a medição e não informados a consultora de vendas, podem implicar na instalação de cortinas/persianas, e essas mudanças são de total responsabilidade do cliente;
 - Os instaladores não estão autorizados a manipular tubulações elétricas, hidráulicas, telefônicas, de gás e também a não realizar obras civis. Em nenhuma hipótese nossos instaladores estão autorizados a fazer qualquer tipo de serviço que não seja o contratado pelo cliente no momento da venda.
IMPORTANTE: A empresa Rainha das Cortinas, está isenta de qualquer responsabilidade de serviços contratados “por fora“, ou seja, não contratados diretamente com nossa empresa e explícitos neste pedido. Assim sendo, não fornecemos garantia, assistência ou apoio quando a prestação de serviços não é feita diretamente com a nossa empresa.

OBSERVAÇÕES PARA CORTINAS E PERSIANAS:
 - Medidas incorretas informadas pelo cliente podem gerar custos de confecção;
 - Não é possível efetuar troca de mercadorias feitas sob medida;
 - Cortinas feitas sob medida apresentam medidas ligeiramente menores do que a quantidade de tecido orçada, pois o material é consumido para fazer as bainhas;
 - Como todo produto têxtil, os tecidos das cortinas estão sujeitos a algumas variações. Leves enrugamentos e pequenas irregularidades na trama, comumente encontrados em tecidos como linho, algodão e seda, são características inerentes ao produto têxtil e aceitáveis em nosso padrão de qualidade. Alguns tecidos naturais também podem sofrer alterações conforme mudanças climáticas, ou seja, alguns tecidos como o linho podem aumentar ou diminuir a barra conforme a incidência de luz solar. Ajustes de barra algumas vezes são necessários, devido ao desnivelamento de tetos e paredes. Tecidos tingidos podem apresentar pequenas variações de tom em relação ao mostruário;
 - Todo tecido que tenha fios naturais (algodão, linho, viscose ou seda) em sua composição pode sofrer leve encolhimento na primeira lavagem, mesmo sendo pré lavados pelo fabricante. Recomendamos lavagem profissional, mas caso feita em casa, seguir as seguintes instruções padronizadas para todos os tecidos: LAVAGEM EM MODO DE TECIDO DELICADO, EM ÁGUA FRIA(ATÉ 30°), NÃO ALVEJAR, NÃO SECAR EM SECADORA, PASSAR COM FERRO ATÉ 110°, NÃO LIMPAR A SECO.
 - As medidas das persianas compreendem todo o material utilizado para a confecção e perfeito funcionamento das mesmas. Isto inclui suportes, acionamentos e comandos. A largura dos tecidos será ligeiramente menor (aproximadamente 3,00 cm) que a largura dos acionamentos(rolo, trilho, bandô, etc).
 - Reformas, tais como barras, trocas de modelo de pregas e ajustes em geral podem ocasionar pequenos furos ou marcações no tecido. A empresa não se responsabiliza pelos mesmos.

OBSERVAÇÕES PARA PAPEL DE PAREDE:
 - Instalações de papel de parede requerem que a mesma esteja devidamente preparada para aplicação. Imperfeições, ondulações, emendas, defeitos na pintura podem ocasionar deformações e/ou o não casamento adequado do desenho. Uso de tintas escuras embaixo do papel podem alterar a tonalidade do papel. É recomendado que a parede esteja lisa, lixada e pintada de tinta látex branca;
 - A empresa não se responsabiliza por danos ao papel em caso de umidade e infiltrações na parede;
 - Ao agendar a instalação, o cliente se compromete em deixar o(s) ambiente(s) limpo(s), para que os produtos como cortinas e papel de parede não sejam danificados ou sujos.

OBSERVAÇÕES PARA TAPETES SOB MEDIDA:
 - Tapetes sob medida são fabricados em múltiplos de 5 cm;
 - Não é possível realizar troca de tapetes feitos sob encomenda;
 - Cortes de tapetes têm custo de debrum (consultar tabela vigente com vendedor);
 - A área total do tapete pode sofrer variação de até 2%, de acordo com a Portaria 149/2011 do INMETRO.`;

export function montarPayloadVenda(payloadOrcamento: unknown): Record<string, unknown> {
  const origem = objeto(payloadOrcamento);
  const produtos = Array.isArray(origem.produtos) ? origem.produtos : [];
  const servicos = Array.isArray(origem.servicos) ? origem.servicos : [];

  const payload: Record<string, unknown> = {
    ...origem,
    // Não enviamos "codigo": o GestãoClick gera o próximo número sequencial da venda.
    tipo: origem.tipo === 'ambos' ? 'produto' : origem.tipo ?? 'produto',
    observacoes: OBSERVACOES_CONTRATO_VENDA,
    produtos: produtos.map((p) => ({ produto: produtoVenda(p) })),
  };

  delete payload.codigo;
  delete payload.id;
  delete payload.hash;

  if (servicos.length > 0) {
    payload.servicos = servicos.map((s) => ({ servico: servicoVenda(s) }));
  } else {
    delete payload.servicos;
  }

  return payload;
}

export async function criarVendaDePayload(payloadOrcamento: unknown): Promise<ResultadoVenda> {
  const payload = montarPayloadVenda(payloadOrcamento);
  return criarVendaComPayload(payload);
}

export async function criarVendaComPayload(payload: Record<string, unknown>): Promise<ResultadoVenda> {
  const env = await gcRequest<GcEnvelope<VendaCriada>>({
    method: 'POST',
    url: '/api/vendas',
    data: payload,
  });
  const gc_pedido_id = env.data?.id;
  if (!gc_pedido_id) {
    throw new Error('GestãoClick não retornou o id da venda.');
  }
  return {
    gc_pedido_id,
    gc_pedido_codigo: env.data?.codigo ?? null,
    payload,
    resposta: env,
  };
}
