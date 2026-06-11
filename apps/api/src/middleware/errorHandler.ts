// apps/api/src/middleware/errorHandler.ts
// Tratamento centralizado de erros internos e da integração GestãoClick (SRD §11).

import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NAO_ENCONTRADO', message: 'Rota não encontrada' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[errorHandler]', err);
  res.status(500).json({ error: 'ERRO_INTERNO', message: 'Erro interno do servidor' });
}
