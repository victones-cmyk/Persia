// apps/api/src/controllers/calcularController.ts
// Cálculo de persiana (Fase 3) com tecidos REAIS do GestãoClick (Fase 4).

import type { Request, Response } from 'express';
import { calcularPersiana, RN01Error } from '../services/calc/persiana';
import { isTipoPersiana, type TipoPersiana } from '../services/calc/tipos';
import { tecidosParaTipo, buscarTecidoGc } from '../services/gc/tecidos';
import { roundHalfUp } from '../services/calc/arredondamento';
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

/** POST /api/calcular/persiana — recebe o formulário, retorna breakdown + valor_bruto. */
export async function calcularPersianaController(req: Request, res: Response): Promise<void> {
  const { tipo, largura, altura, cor_acessorio, acionamento, tc, tecido_id } = req.body ?? {};

  if (!isTipoPersiana(tipo)) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  }
  const larguraN = Number(largura);
  const alturaN = Number(altura);
  if (!(larguraN > 0) || !(alturaN > 0)) {
    throw new AppError(400, 'MEDIDAS_INVALIDAS', 'Largura e altura devem ser positivas.');
  }

  const tecido = await buscarTecidoGc(String(tecido_id));
  if (!tecido) {
    throw new AppError(400, 'TECIDO_INVALIDO', 'Selecione um tecido válido.');
  }

  try {
    const resultado = calcularPersiana({
      tipo,
      largura: larguraN,
      altura: alturaN,
      dimensao: tecido.dimensao_m,
      cor_acessorio,
      acionamento,
      tc: tc !== undefined && tc !== null && tc !== '' ? Number(tc) : undefined,
      preco_tecido: tecido.preco_venda,
    });
    res.json({
      resultado,
      tecido: {
        id: tecido.id,
        nome: tecido.nome,
        dimensao_m: tecido.dimensao_m,
        preco_venda: tecido.preco_venda,
      },
    });
  } catch (err) {
    if (err instanceof RN01Error) {
      const alternativos = (await tecidosParaTipo(tipo))
        .filter((t) => t.dimensao_m >= larguraN)
        .map((t) => ({ id: t.id, nome: t.nome, dimensao_m: t.dimensao_m }));
      res.status(422).json({
        error: 'RN01_LARGURA_EXCEDIDA',
        message: `Este tecido suporta até ${tecido.dimensao_m.toFixed(2)}m.`,
        dimensao_max: tecido.dimensao_m,
        alternativos,
      });
      return;
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
  const tipo = req.body?.tipo;
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

  if (!isTipoPersiana(tipo)) {
    throw new AppError(400, 'TIPO_INVALIDO', 'Tipo de persiana inválido.');
  }
  if (itens.length === 0) {
    throw new AppError(400, 'SEM_ITENS', 'Adicione ao menos um item.');
  }

  // Tecidos compatíveis (para sugestões RN-01) — carregados sob demanda só se precisar.
  let compatCache: { id: string; nome: string; dimensao_m: number }[] | null = null;
  const compatPara = async (larguraN: number) => {
    if (!compatCache) {
      compatCache = (await tecidosParaTipo(tipo as TipoPersiana)).map((t) => ({
        id: t.id,
        nome: t.nome,
        dimensao_m: t.dimensao_m,
      }));
    }
    return compatCache.filter((t) => t.dimensao_m >= larguraN);
  };

  const resultados = [];
  let totalBruto = 0;

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i] ?? {};
    const larguraN = Number(it.largura);
    const alturaN = Number(it.altura);

    if (!(larguraN > 0) || !(alturaN > 0)) {
      resultados.push({ ok: false, index: i, error: 'MEDIDAS_INVALIDAS', message: 'Largura e altura devem ser positivas.' });
      continue;
    }
    const tecido = await buscarTecidoGc(String(it.tecido_id));
    if (!tecido) {
      resultados.push({ ok: false, index: i, error: 'TECIDO_INVALIDO', message: 'Selecione um tecido válido.' });
      continue;
    }
    try {
      const resultado = calcularPersiana({
        tipo: tipo as TipoPersiana,
        largura: larguraN,
        altura: alturaN,
        dimensao: tecido.dimensao_m,
        cor_acessorio: it.cor_acessorio,
        acionamento: it.acionamento,
        tc: it.tc !== undefined && it.tc !== null && it.tc !== '' ? Number(it.tc) : undefined,
        preco_tecido: tecido.preco_venda,
      });
      totalBruto = roundHalfUp(totalBruto + (resultado.valor_bruto ?? 0));
      resultados.push({
        ok: true,
        index: i,
        resultado,
        tecido: { id: tecido.id, nome: tecido.nome, dimensao_m: tecido.dimensao_m, preco_venda: tecido.preco_venda },
      });
    } catch (err) {
      if (err instanceof RN01Error) {
        resultados.push({
          ok: false,
          index: i,
          error: 'RN01_LARGURA_EXCEDIDA',
          message: `Este tecido suporta até ${tecido.dimensao_m.toFixed(2)}m.`,
          dimensao_max: tecido.dimensao_m,
          alternativos: await compatPara(larguraN),
        });
      } else {
        throw err;
      }
    }
  }

  res.json({ itens: resultados, total_bruto: totalBruto });
}
