// apps/api/src/controllers/calcularController.ts
// Cálculo de persiana (Fase 3) com tecidos REAIS do GestãoClick (Fase 4).

import type { Request, Response } from 'express';
import { calcularPersiana, RN01Error } from '../services/calc/persiana';
import { isTipoPersiana } from '../services/calc/tipos';
import { tecidosParaTipo, buscarTecidoGc } from '../services/gc/tecidos';
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
