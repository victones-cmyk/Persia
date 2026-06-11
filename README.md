# Projeto Pérsia

Plataforma web interna B2B de orçamento de persianas e cortinas para a **Rainha das Cortinas**, com integração ao ERP **GestãoClick**. Substitui o DecorSoft.

> Critério central: *"O que sai da calculadora é o que está no GestãoClick."*
> Documentação completa: ver `CLAUDE.md` (memória do projeto) e o SRD em `srd_solution_requirements_document_projeto_persia_v.3.md`.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS (Design System Pérsia v4) |
| Backend | Node.js 20 + Express 5 |
| Banco | PostgreSQL 16 + Prisma ORM |
| Auth | express-session (8h) + bcrypt + connect-pg-simple |
| Hospedagem | Railway (App Node.js + PostgreSQL gerenciado) |

## Estrutura (monorepo npm workspaces)

```
.
├── apps/
│   ├── api/        # Express 5 + Prisma (porta 3001)
│   └── web/        # React 18 + Vite (porta 5173)
├── CLAUDE.md       # memória persistente do projeto
├── .env.example    # modelo de variáveis (commitar)
├── .env            # variáveis reais (NUNCA commitar)
└── railway.json    # configuração de deploy
```

## Desenvolvimento

### Pré-requisitos
- Node.js 20+ (ver `.nvmrc`)
- Um PostgreSQL acessível via `DATABASE_URL`

### Banco local
O ambiente de dev não exige Docker/Postgres instalados: há um PostgreSQL embarcado
(`embedded-postgres`) **apenas para desenvolvimento**.

```bash
npm install              # instala api + web (workspaces)
npm run db:local         # sobe um PostgreSQL local na porta 5433 (deixe rodando)
```

Aponte o `.env` para ele (já é o padrão do `.env` gerado):
```
DATABASE_URL="postgresql://persia:persia@localhost:5433/persia_db"
```

### Migrations e seed
```bash
npm run db:migrate -w apps/api    # cria/aplica migrations
npm run db:seed -w apps/api       # popula lojas, admin e vendedores
```

### Rodar API + frontend
```bash
npm run dev      # sobe API (3001) e frontend (5173) simultaneamente
```
- Frontend: http://localhost:5173
- API: http://localhost:3001/api/health

### Credenciais de homologação (seed)
| Perfil | Email | Senha |
|---|---|---|
| Admin (Victor) | victor@rainhadascortinas.com.br | `Admin@2026` |
| Vendedor SP | vendedor.sp@rainhadascortinas.com.br | `Vendedor@2026` |
| Vendedor SBC | vendedor.sbc@rainhadascortinas.com.br | `Vendedor@2026` |

## Deploy no Railway

1. Criar projeto no Railway e adicionar um serviço **PostgreSQL** (gerenciado).
2. Criar um serviço **App** apontando para este repositório (deploy via `git push`).
3. Definir as variáveis de ambiente do App (ver `.env.example`):
   - `DATABASE_URL` → referência ao Postgres do Railway (`${{Postgres.DATABASE_URL}}`)
   - `SESSION_SECRET` → string aleatória ≥ 64 caracteres
   - `NODE_ENV=production`
   - `FRONTEND_URL` → URL pública do App
   - `GESTAOCLICK_ACCESS_TOKEN`, `GESTAOCLICK_SECRET_ACCESS_TOKEN` (a partir da Fase 4)
   - `GC_LOJA_ID_SP=8274`, `GC_LOJA_ID_SBC=8284`
4. O `railway.json` já define:
   - **build:** `npm ci && npm run build`
   - **start:** `npm run db:migrate:deploy -w apps/api && npm run start` (migration antes do start)
   - **healthcheck:** `/api/health`

Em produção o backend Express serve o build estático do frontend (`apps/web/dist`),
mantendo a arquitetura de um único App Node.js + PostgreSQL.

## Testes
```bash
npm test         # Vitest (cobertura do motor de cálculo — a partir da Fase 3)
```
