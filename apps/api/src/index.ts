// apps/api/src/index.ts
// Servidor Express 5 — Projeto Pérsia
// Fase 1: boot do servidor, sessão persistida em PostgreSQL (connect-pg-simple),
// CORS para o frontend e endpoints de health check.

import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import pg from 'pg';

import { env, isProduction } from './config/env';
import { prisma } from './lib/prisma';
import authRouter from './routes/auth';
import calcularRouter from './routes/calcular';
import orcamentosRouter from './routes/orcamentos';
import adminRouter from './routes/admin';
import gcRouter from './routes/gc';
import { getGcHealth } from './services/gc/health';
import { carregarRegras } from './services/calc/regras';
import { carregarCalculadoras } from './services/calc/calculadoras';
import { carregarCalculadorasCortina } from './services/calc/calculadorasCortina';
import { iniciarAgendadorCatalogoLocal } from './services/gc/catalogoLocal';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// Railway/Proxy: necessário para cookies secure atrás de proxy TLS.
app.set('trust proxy', 1);

// Compressão gzip de todas as respostas (HTML, CSS, JS estático e JSON da API).
// Transparente para o cliente; reduz muito o tráfego do bundle (~365KB → ~110KB).
app.use(compression());

// Cabeçalhos de segurança HTTP (HSTS, X-Content-Type-Options, frameguard, CSP...).
// CSP liberando apenas o necessário: recursos próprios + Google Fonts (DS v4).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' em estilos: React/Tailwind aplicam estilos inline em runtime.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    // HSTS só faz sentido sob HTTPS (produção/Railway).
    hsts: isProduction,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Sessão — express-session + connect-pg-simple (store no PostgreSQL)
// A tabela "session" é criada automaticamente (createTableIfMissing: true).
// Persistir no banco evita logout forçado quando o processo Railway reinicia.
// ---------------------------------------------------------------------------
const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({ connectionString: env.DATABASE_URL });

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'persia.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: env.SESSION_MAX_AGE, // 8h
    },
  }),
);

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

// Saúde da própria API + conexão com o banco.
// Público (usado pelo health check do Railway) — NÃO expor versão/commit aqui,
// para não revelar a versão exata em uso a terceiros. O commit fica em /api/admin/versao.
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'offline', timestamp: new Date().toISOString() });
  }
});

// Saúde da integração GestãoClick (GET /api/lojas, cache 5s — services/gc/health.ts).
app.get('/api/gc/health', async (_req: Request, res: Response) => {
  res.json(await getGcHealth());
});

// Rotas de autenticação (login/logout/me).
app.use('/api/auth', authRouter);

// Rotas de cálculo de persiana (Fase 3).
app.use('/api/calcular', calcularRouter);

// Rotas de orçamento — envio/reenvio ao GestãoClick (Fase 5).
app.use('/api/orcamentos', orcamentosRouter);

// Rotas administrativas (somente admin) — usuários, configurações, log (Fase 6).
app.use('/api/admin', adminRouter);

// Rotas de leitura GestãoClick — clientes etc. (Fase 4).
app.use('/api/gc', gcRouter);

// ---------------------------------------------------------------------------
// Frontend estático (produção) — arquitetura "App Node.js único" no Railway.
// Em dev o frontend roda no Vite (porta 5173) com proxy /api.
// ---------------------------------------------------------------------------
if (isProduction) {
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA fallback: qualquer GET que não seja /api retorna o index.html.
    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    console.warn('[static] apps/web/dist não encontrado — frontend não será servido.');
  }
}

// ---------------------------------------------------------------------------
// 404 + tratamento centralizado de erros
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`🚀 API Pérsia ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  // Carrega as regras de cálculo (módulo admin) para a memória.
  void carregarRegras(prisma);
  // Carrega as calculadoras dinâmicas para a memória.
  void carregarCalculadoras(prisma);
  void carregarCalculadorasCortina(prisma);
  iniciarAgendadorCatalogoLocal();
});

// Encerramento gracioso.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    console.log(`\n${sinal} recebido — encerrando...`);
    server.close(() => {
      void sessionPool.end();
      void prisma.$disconnect();
      process.exit(0);
    });
  });
}

export { app };
