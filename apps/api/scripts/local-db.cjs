// apps/api/scripts/local-db.cjs
// PostgreSQL local para DESENVOLVIMENTO apenas.
//
// Decisão da Fase 1: o ambiente de dev não possui PostgreSQL/Docker instalados.
// Usamos embedded-postgres (devDependency) para subir um Postgres real e local,
// permitindo rodar `prisma migrate`, `prisma db seed` e bootar a API de forma
// verificável. PRODUÇÃO continua usando o PostgreSQL gerenciado do Railway via
// DATABASE_URL — este script NÃO roda em produção.
//
// Uso:
//   node scripts/local-db.cjs           # inicia e mantém o Postgres no ar (Ctrl+C para parar)
//   node scripts/local-db.cjs --once    # inicia, garante o database e encerra
//
// Connection string resultante (coloque no .env):
//   DATABASE_URL="postgresql://persia:persia@localhost:5433/persia_db"

const path = require('node:path');
const os = require('node:os');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

// IMPORTANTE: o data dir do cluster NÃO pode ficar dentro do OneDrive. O projeto
// vive em ~/Library/CloudStorage/OneDrive-Personal/..., e o OneDrive "evacua"
// arquivos frios do cluster para online-only (placeholders). Quando o Postgres
// tenta lê-los, o fetch sob demanda estoura o timeout de I/O e o banco quebra
// ("could not read blocks ... Operation timed out"). Por isso mantemos o cluster
// fora do OneDrive (igual ao projeto demand-flow). Override opcional via env.
const DATA_DIR = process.env.PERSIA_PGDATA || path.join(os.homedir(), '.persia-localdb');
const PORT = 5433;
const USER = 'persia';
const PASSWORD = 'persia';
const DB_NAME = 'persia_db';

const fs = require('node:fs');

async function main() {
  const onceMode = process.argv.includes('--once');

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  const jaInicializado = fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (!jaInicializado) {
    console.log('[local-db] Inicializando cluster PostgreSQL em', DATA_DIR);
    await pg.initialise();
  }

  console.log(`[local-db] Iniciando PostgreSQL na porta ${PORT}...`);
  await pg.start();

  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[local-db] Database "${DB_NAME}" criado.`);
  } catch (e) {
    if (/already exists/i.test(String(e && e.message))) {
      console.log(`[local-db] Database "${DB_NAME}" já existe.`);
    } else {
      throw e;
    }
  }

  console.log('[local-db] Pronto. DATABASE_URL:');
  console.log(`           postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`);

  if (onceMode) {
    await pg.stop();
    console.log('[local-db] Modo --once: encerrado.');
    return;
  }

  console.log('[local-db] Mantendo o servidor no ar. Ctrl+C para parar.');

  const parar = async () => {
    console.log('\n[local-db] Encerrando PostgreSQL...');
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);

  // Mantém o processo vivo.
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error('[local-db] Falha:', e);
  process.exit(1);
});
