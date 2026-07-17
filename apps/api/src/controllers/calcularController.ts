// apps/api/src/controllers/calcularController.ts
// Cálculo de persiana (Fase 3) com tecidos REAIS do GestãoClick (Fase 4).

import type { Request, Response } from 'express';
import { ReceitaPendenteError } from '../services/calc/persianaPreco';
import {
  precoPersianaItem,
  mapasDePrecoComponentes,
  componentesSnapshot,
  type PrecoPersianaItem,
} from '../services/calc/persianaPrecoGc';
import {
  calcularCortina,
  calcularCortinaMultiCamada,
  NotImplementedError,
  type EntradaCortina,
  type CamadaCortina,
} from '../services/calc/cortina';
import { isTipoPersiana, type TipoPersiana } from '../services/calc/tipos';
import { exigeLarguraTecido, getCalculadorasAtivas } from '../services/calc/calculadoras';
import { getCalculadorasCortinaAtivas } from '../services/calc/calculadorasCortina';
import type { TecidoGc } from '../services/gc/tecidos';
import {
  tecidosParaTipo,
  buscarTecidoGc,
  tecidosCortina,
  buscarTecidoCortinaGc,
  precoByTier,
} from '../services/gc/tecidos';
import { listarProdutos } from '../services/gc/catalogos';
import { listarInstalacoes, indiceInstalacoes, type TipoInstalacao } from '../services/gc/instalacao';
import { linhaInstalacaoBreakdown, componenteInstalacao } from '../services/calc/instalacaoCalc';
import { listarAcessoriosCortina, categoriaDoItem, ehWaveFixo, resolverProdutoWaveFixo } from '../services/gc/acessorios';
import { roundHalfUp } from '../services/calc/arredondamento';
import { listarProdutosParaOrcamento } from '../services/calc/itensExtras';
import { AppError } from '../middleware/errorHandler';

/** GET /api/calcular/tecidos?tipo=persiana_rolo_blackout — tecidos reais do GestãoClick. */
export async function listarTecidos(req: Request, res: Response): Promise<void> {
  const tipo = String(req.query.tipo ?? '');
  if (!isTipoPersiana(tipo)) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  }
  const tecidos = await tecidosParaTipo(tipo);
  res.json({ tecidos });
}

/** GET /api/calcular/instalacoes — tipos de instalação (grupo INSTALAÇÃO do GestãoClick). */
export async function listarInstalacoesController(_req: Request, res: Response): Promise<void> {
  const instalacoes = await listarInstalacoes();
  res.json({ instalacoes });
}

/** GET /api/calcular/componentes?grupo_id=5969405 — produtos/componentes para escolhas do formulário. */
export async function listarComponentesController(req: Request, res: Response): Promise<void> {
  const grupoId = String(req.query.grupo_id ?? '').trim();
  if (!grupoId) throw new AppError(400, 'GRUPO_OBRIGATORIO', 'Informe o grupo do GestãoClick.');
  const produtos = await listarProdutos({ grupo_id: grupoId, ativo: 1 });
  const componentes = produtos.map((p) => {
    const preco = precoByTier(p, 'varejo');
    return {
      id: p.id,
      nome: p.nome,
      codigo_interno: String(p.codigo_interno ?? '').trim(),
      grupo_id: String(p.grupo_id ?? ''),
      preco_venda: preco.venda,
    };
  });
  res.json({ componentes });
}

export async function listarProdutosOrcamentoController(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? '').trim();
  const produtos = await listarProdutosParaOrcamento(q);
  res.json({ produtos });
}

/**
 * Resultado no formato que o frontend já consome: mantém `valor_bruto`, `qtd_venda`,
 * `tc`, `largura`, `altura`; `valor_bruto` agora é a SOMA dos componentes + tecido
 * (motor novo do Victor). Inclui também o breakdown novo (`itens` com preço).
 */
function montarResultado(item: PrecoPersianaItem, tecido: TecidoGc, largura: number, altura: number, inst?: TipoInstalacao | null) {
  const v = item.venda;
  // Instalação embutida (Victor 26/06/2026): entra como componente e soma no valor.
  const itens = inst ? [...v.itens, linhaInstalacaoBreakdown(inst)] : v.itens;
  const valor = inst ? roundHalfUp(item.valor + inst.preco) : item.valor;
  const componentes = inst ? [...componentesSnapshot(v), componenteInstalacao(inst)] : componentesSnapshot(v);
  return {
    largura,
    altura,
    dimensao: tecido.dimensao_m,
    tc: item.tc,
    qtd_venda: v.tecido.quantidade,
    qtd_producao: v.tecido.quantidade,
    preco_tecido: tecido.preco_venda,
    valor_bruto: valor, // SOMA de todos os componentes + tecido + instalação (VAREJO)
    valor,
    familia: v.familia,
    variante: v.variante,
    itens, // breakdown novo: componente × qtd × preço (+ instalação)
    tecido: v.tecido,
    componentes, // compat com o formato antigo
  };
}

function mensagemErroFormula(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  if (/Fórmula|Formula|MAX|Parêntese|Número esperado|Sobra de tokens/i.test(err.message)) {
    return err.message;
  }
  return null;
}

/** POST /api/calcular/persiana — recebe o formulário, retorna breakdown + valor_bruto. */
export async function calcularPersianaController(req: Request, res: Response): Promise<void> {
  const { tipo, largura, altura, acionamento, tc, tecido_id, instalacao_id, cor_acessorio, base } = req.body ?? {};

  if (!isTipoPersiana(tipo)) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  }
  const larguraN = Number(largura);
  const alturaN = Number(altura);
  if (!(larguraN > 0) || !(alturaN > 0)) {
    throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas.');
  }

  const tecido = await buscarTecidoGc(String(tecido_id), tipo);
  if (!tecido) {
    throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido.');
  }

  // RN-01: a largura não pode exceder a largura do rolo do tecido.
  if (exigeLarguraTecido(tipo) && larguraN > tecido.dimensao_m) {
    const alternativos = (await tecidosParaTipo(tipo))
      .filter((t) => t.dimensao_m >= larguraN)
      .map((t) => ({ id: t.id, nome: t.nome, dimensao_m: t.dimensao_m }));
    res.status(422).json({
      error: 'RN01_LARGURA_EXCEDIDA',
      message: `Este tecido suporta até ${tecido.dimensao_m.toFixed(2).replace('.', ',')} m.`,
      dimensao_max: tecido.dimensao_m,
      alternativos,
    });
    return;
  }

  const { precos, custos, componentesPorNome } = await mapasDePrecoComponentes();
  const inst = instalacao_id ? (await indiceInstalacoes()).get(String(instalacao_id)) ?? null : null;
  try {
    const item = precoPersianaItem({
      tipo,
      acionamento,
      largura: larguraN,
      altura: alturaN,
      tc: tc !== undefined && tc !== null && tc !== '' ? Number(tc) : undefined,
      preco_tecido: tecido.preco_venda,
      preco_tecido_custo: tecido.preco_custo,
      precos,
      custos,
      componentesPorNome,
      cor_acessorio,
      cor_base: base || cor_acessorio,
    });
    res.json({
      resultado: montarResultado(item, tecido, larguraN, alturaN, inst),
      tecido: { id: tecido.id, nome: tecido.nome, dimensao_m: tecido.dimensao_m, preco_venda: tecido.preco_venda },
    });
  } catch (err) {
    if (err instanceof ReceitaPendenteError) {
      throw new AppError(400, 'RECEITA_PENDENTE', err.message);
    }
    const msgFormula = mensagemErroFormula(err);
    if (msgFormula) {
      throw new AppError(400, 'FORMULA_INVALIDA', msgFormula);
    }
    throw err;
  }
}

/**
 * POST /api/calcular/persiana/lote — calcula vários itens (janelas) do mesmo
 * tipo de produto. Retorna o resultado por item (ou o erro RN-01 do item) e o
 * total bruto do orçamento. Não falha o lote inteiro por causa de um item.
 */
export async function calcularPersianaLoteController(req: Request, res: Response): Promise<void> {
  // Tipo POR ITEM (Victor 26/06/2026): cada janela escolhe seu produto. `req.body.tipo`
  // fica só como fallback (rascunhos antigos enviavam um tipo único para o lote).
  const tipoFallback = isTipoPersiana(req.body?.tipo) ? (req.body.tipo as TipoPersiana) : null;
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

  if (itens.length === 0) {
    throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos um item.');
  }

  // Tecidos compatíveis (para sugestões RN-01) — carregados sob demanda, por tipo.
  const compatCache = new Map<TipoPersiana, { id: string; nome: string; dimensao_m: number }[]>();
  const compatPara = async (tipo: TipoPersiana, larguraN: number) => {
    if (!compatCache.has(tipo)) {
      compatCache.set(tipo, (await tecidosParaTipo(tipo)).map((t) => ({ id: t.id, nome: t.nome, dimensao_m: t.dimensao_m })));
    }
    return compatCache.get(tipo)!.filter((t) => t.dimensao_m >= larguraN);
  };

  const { precos, custos, componentesPorNome } = await mapasDePrecoComponentes();
  const idxInst = await indiceInstalacoes();
  const resultados = [];
  let totalBruto = 0;

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i] ?? {};
    const tipo = isTipoPersiana(it.tipo) ? (it.tipo as TipoPersiana) : tipoFallback;
    if (!tipo) {
      resultados.push({ ok: false, index: i, error: 'TIPO_INVALIDO', message: 'Selecione o produto sob medida do item.' });
      continue;
    }
    const larguraN = Number(it.largura);
    const alturaN = Number(it.altura);

    if (!(larguraN > 0) || !(alturaN > 0)) {
      resultados.push({ ok: false, index: i, error: 'MEDIDAS_INVALIDAS', message: 'Largura e altura devem ser positivas.' });
      continue;
    }
    const tecido = await buscarTecidoGc(String(it.tecido_id), tipo);
    if (!tecido) {
      resultados.push({ ok: false, index: i, error: 'TECIDO_INVALIDO', message: 'Selecione um tecido válido.' });
      continue;
    }
    // RN-01: largura não pode exceder a largura do rolo do tecido.
    if (exigeLarguraTecido(tipo) && larguraN > tecido.dimensao_m) {
      resultados.push({
        ok: false,
        index: i,
        error: 'RN01_LARGURA_EXCEDIDA',
        message: `Este tecido suporta até ${tecido.dimensao_m.toFixed(2).replace('.', ',')} m.`,
        dimensao_max: tecido.dimensao_m,
        alternativos: await compatPara(tipo, larguraN),
      });
      continue;
    }
    const inst = it.instalacao_id ? idxInst.get(String(it.instalacao_id)) ?? null : null;
    try {
      const item = precoPersianaItem({
        tipo,
        acionamento: it.acionamento,
        largura: larguraN,
        altura: alturaN,
        tc: it.tc !== undefined && it.tc !== null && it.tc !== '' ? Number(it.tc) : undefined,
        preco_tecido: tecido.preco_venda,
        preco_tecido_custo: tecido.preco_custo,
        precos,
        custos,
        componentesPorNome,
        componente_bando: it.bando_codigo ? { codigo_interno: String(it.bando_codigo), descricao: String(it.bando_nome || 'Bando') } : null,
        cor_acessorio: it.cor_acessorio,
        cor_base: it.base || it.cor_acessorio,
      });
      const resultado = montarResultado(item, tecido, larguraN, alturaN, inst);
      totalBruto = roundHalfUp(totalBruto + resultado.valor);
      resultados.push({
        ok: true,
        index: i,
        resultado,
        tecido: { id: tecido.id, nome: tecido.nome, dimensao_m: tecido.dimensao_m, preco_venda: tecido.preco_venda },
      });
    } catch (err) {
      if (err instanceof ReceitaPendenteError) {
        resultados.push({ ok: false, index: i, error: 'RECEITA_PENDENTE', message: err.message });
      } else if (mensagemErroFormula(err)) {
        resultados.push({ ok: false, index: i, error: 'FORMULA_INVALIDA', message: mensagemErroFormula(err)! });
      } else {
        throw err;
      }
    }
  }

  res.json({ itens: resultados, total_bruto: totalBruto });
}

// ---------------------------------------------------------------------------
// CORTINA (Fase 7) — calculadora dos modelos Ilhós/Prega/Franzido/Wave.
// Tecido = SOB MEDIDA (grupo pai "TECIDOS PARA CORTINA"); acessórios virão do GC.
// ---------------------------------------------------------------------------

/** GET /api/calcular/cortina/tecidos — tecidos de cortina (grupo 5913111). */
export async function listarTecidosCortina(_req: Request, res: Response): Promise<void> {
  const tecidos = await tecidosCortina();
  res.json({ tecidos });
}

/** GET /api/calcular/cortina/acessorios — opções de acessório por grupo + serviços de instalação. */
export async function listarAcessoriosCortinaController(_req: Request, res: Response): Promise<void> {
  const dados = await listarAcessoriosCortina();
  res.json(dados);
}

/** POST /api/calcular/cortina — calcula uma cortina e devolve metragem + itens. */
export async function calcularCortinaController(req: Request, res: Response): Promise<void> {
  const b = req.body ?? {};

  const tecidoFrente = await buscarTecidoCortinaGc(String(b.tecido_frente_id));
  if (!tecidoFrente) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido.');

  const doisTecidos = b.config === 'dois_tecidos_mesmo_varao' || b.config === 'dois_tecidos_varao_duplo';
  const tecidoTras = doisTecidos && b.tecido_tras_id ? await buscarTecidoCortinaGc(String(b.tecido_tras_id)) : undefined;
  if (doisTecidos && !tecidoTras) throw new AppError(400, 'TECIDO_TRAS_INVALIDO', 'Selecione o 2º tecido.');

  const entrada: EntradaCortina = {
    modelo: b.modelo,
    fixacao: b.fixacao,
    config: b.config,
    largura: Number(b.largura),
    altura: Number(b.altura),
    largura_tecido: tecidoFrente.dimensao_m,
    largura_tecido_tras: tecidoTras?.dimensao_m,
    franzido_frente: b.franzido_frente !== undefined && b.franzido_frente !== '' ? Number(b.franzido_frente) : undefined,
    franzido_tras: b.franzido_tras !== undefined && b.franzido_tras !== '' ? Number(b.franzido_tras) : undefined,
    tamanho_barra: b.tamanho_barra !== undefined && b.tamanho_barra !== '' ? Number(b.tamanho_barra) : undefined,
    tipo_barra: b.tipo_barra,
    aberturas: b.aberturas !== undefined && b.aberturas !== '' ? Number(b.aberturas) : undefined,
    metodo_altura: b.metodo_altura === 'barra_postica' ? 'barra_postica' : b.metodo_altura === 'emenda' ? 'emenda' : undefined,
  };

  try {
    const resultado = calcularCortina(entrada);
    // Valor do tecido (SOB MEDIDA). Acessórios vêm do GestãoClick na etapa de orçamento.
    const valorFrente = roundHalfUp(resultado.metragem_frente * tecidoFrente.preco_venda);
    const valorTras = resultado.metragem_tras !== null && tecidoTras
      ? roundHalfUp(resultado.metragem_tras * tecidoTras.preco_venda)
      : 0;
    res.json({
      resultado,
      tecido_frente: { id: tecidoFrente.id, nome: tecidoFrente.nome, dimensao_m: tecidoFrente.dimensao_m, preco_venda: tecidoFrente.preco_venda },
      tecido_tras: tecidoTras ? { id: tecidoTras.id, nome: tecidoTras.nome, dimensao_m: tecidoTras.dimensao_m, preco_venda: tecidoTras.preco_venda } : null,
      valor_tecido: roundHalfUp(valorFrente + valorTras),
    });
  } catch (err) {
    if (err instanceof NotImplementedError) {
      throw new AppError(400, 'MODELO_NAO_SUPORTADO', err.message);
    }
    if (err instanceof Error && /positivas/.test(err.message)) {
      throw new AppError(400, 'MEDIDAS_INVALIDAS', err.message);
    }
    throw err;
  }
}

/**
 * POST /api/calcular/cortina/completa — cortina com N camadas (modelo "+").
 * Body: { modelo, fixacao, largura, altura, camadas:[{tecido_id, franzido?}], barra... }
 * Devolve tecido por camada (com valor) + acessórios agregados (com categoria p/ o seletor).
 */
export async function calcularCortinaCompletaController(req: Request, res: Response): Promise<void> {
  const b = req.body ?? {};
  const camadasIn = Array.isArray(b.camadas) ? b.camadas : [];
  if (camadasIn.length < 1 || camadasIn.length > 3) {
    throw new AppError(400, 'CAMADAS_INVALIDAS', 'A cortina deve ter de 1 a 3 tecidos (camadas).');
  }

  // Resolve o tecido de cada camada (de uma vez, sem repetir chamadas iguais).
  const cacheTecido = new Map<string, Awaited<ReturnType<typeof buscarTecidoCortinaGc>>>();
  const tecidos: NonNullable<Awaited<ReturnType<typeof buscarTecidoCortinaGc>>>[] = [];
  for (const c of camadasIn) {
    const id = String(c.tecido_id ?? '');
    if (!cacheTecido.has(id)) cacheTecido.set(id, await buscarTecidoCortinaGc(id));
    const t = cacheTecido.get(id);
    if (!t) throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido em todas as camadas.');
    tecidos.push(t);
  }

  const camadasCalc: CamadaCortina[] = camadasIn.map((c: { franzido?: number | string; modelo?: string; metodo_altura?: string; costurado_quantidade?: string }, i: number) => ({
    largura_tecido: tecidos[i]!.dimensao_m,
    franzido: c.franzido !== undefined && c.franzido !== '' ? Number(c.franzido) : undefined,
    modelo: c.modelo ? (c.modelo as CamadaCortina['modelo']) : undefined, // modelo PRÓPRIO da camada (Victor v.4.1)
    metodo_altura: c.metodo_altura === 'barra_postica' ? 'barra_postica' : c.metodo_altura === 'emenda' ? 'emenda' : undefined,
    costurado_quantidade: c.costurado_quantidade === 'proporcao_franzido' ? 'proporcao_franzido' : c.costurado_quantidade === 'mesma_quantidade' ? 'mesma_quantidade' : undefined,
  }));

  try {
    const r = calcularCortinaMultiCamada({
      modelo: b.modelo ?? (camadasCalc[0]?.modelo === 'costurado_junto' ? 'franzido' : camadasCalc[0]?.modelo), // fallback = modelo da 1ª camada
      fixacao: b.fixacao,
      largura: Number(b.largura),
      altura: Number(b.altura),
      camadas: camadasCalc,
      tamanho_barra: b.tamanho_barra !== undefined && b.tamanho_barra !== '' ? Number(b.tamanho_barra) : undefined,
      tipo_barra: b.tipo_barra,
      aberturas: b.aberturas !== undefined && b.aberturas !== '' ? Number(b.aberturas) : undefined,
      bainhas_laterais: b.bainhas_laterais !== undefined && b.bainhas_laterais !== '' ? Number(b.bainhas_laterais) : undefined,
    });

    const camadas = r.camadas.map((cam, i) => {
      const t = tecidos[i]!;
      return {
        tecido: { id: t.id, nome: t.nome, dimensao_m: t.dimensao_m, preco_venda: t.preco_venda },
        metodo: cam.metodo,
        altura_excede_tecido: cam.altura_excede_tecido,
        metragem: cam.metragem,
        valor_tecido: roundHalfUp(cam.metragem * t.preco_venda),
        tiras: cam.tiras,
        barra_consumo: cam.barra_consumo,
        barra_postica_base: cam.barra_postica_base,
        barra_postica_acrescimo: cam.barra_postica_acrescimo,
        bainhas_laterais_acrescimo: cam.bainhas_laterais_acrescimo,
        consumo: cam.consumo,
      };
    });
    const valorTecidoTotal = roundHalfUp(camadas.reduce((s, c) => s + c.valor_tecido, 0));

    // Acessórios: os itens obrigatórios do wave já vêm com produto + preço resolvidos pelo
    // servidor (busca SÓ o grupo WAVE, em cache — leve, não trava). Assim o preço aparece
    // mesmo se o navegador estiver com JS antigo em cache. Os demais o vendedor escolhe.
    const acessorios = await Promise.all(r.acessorios.map(async (a) => {
      const base = {
        item: a.item,
        categoria: categoriaDoItem(a.item, b.fixacao),
        quantidade: a.quantidade,
        unidade: a.unidade,
        auto: a.auto,
      };
      if (ehWaveFixo(a.item)) {
        const prod = await resolverProdutoWaveFixo(a.item);
        return { ...base, auto_produto: true, produto_id: prod?.id ?? '', produto_nome: prod?.nome ?? '', preco: prod?.preco ?? 0 };
      }
      return base;
    }));

    res.json({ modelo: r.modelo, fixacao: r.fixacao, n_camadas: r.n_camadas, camadas, acessorios, valor_tecido_total: valorTecidoTotal });
  } catch (err) {
    if (err instanceof NotImplementedError) throw new AppError(400, 'MODELO_NAO_SUPORTADO', err.message);
    if (err instanceof Error && /(positivas|camadas)/.test(err.message)) throw new AppError(400, 'ENTRADA_INVALIDA', err.message);
    throw err;
  }
}

export async function listarCalculadorasController(_req: Request, res: Response): Promise<void> {
  res.json({ calculadoras: getCalculadorasAtivas() });
}

export async function listarCalculadorasCortinaController(_req: Request, res: Response): Promise<void> {
  res.json({ calculadoras: getCalculadorasCortinaAtivas() });
}
