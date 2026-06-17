# CLAUDE.md — Projeto Pérsia

## Contexto
Calculadora de orçamentos web interna para Rainha das Cortinas (Samar Cortinas Ltda.).
Substitui o DecorSoft. Integra ao GestãoClick via API REST bidirecional.
8 usuários (vendedores + admin). 10-15 orçamentos/dia. Desktop-first.
Critério central: "O que sai da calculadora é o que está no GestãoClick."

## Stack
- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Node.js 20 + Express 5
- Banco: PostgreSQL 16 + Prisma ORM
- Auth: express-session (8h) + bcrypt + connect-pg-simple (session store PostgreSQL)
- HTTP Client GestãoClick: axios + p-queue (concurrency:1, intervalCap:3, interval:1000ms)
- Testes: Vitest
- Hospedagem: Railway (App Node.js + PostgreSQL gerenciado)
- Ícones: @fortawesome/react-fontawesome + @fortawesome/free-solid-svg-icons
- Fontes: Source Sans Pro + JetBrains Mono (Google Fonts CDN — importar no index.html)
- Design: Design System Projeto Pérsia v4 (estética GestãoClick / AdminLTE 3)

## Estrutura de Pastas

persia/
  apps/
    web/                         # React 18 + Vite (frontend)
      src/
        pages/                   # Login, Orcamentos, OrcamentoNovo, OrcamentoDetalhe, Admin
        components/              # Navbar, Sidebar, Layout, GcIndicator, CalculadoraForm,
                                 # ResultadoPanel, BreakdownComponentes, ModalSenhaGerente...
        hooks/                   # useAuth, useGestaoClick, useCalculo
        lib/                     # formatacao.ts, validacao.ts (cliente)
      index.html                 # Importar Google Fonts aqui
      vite.config.ts
      tailwind.config.ts         # Config estendido do DS v4 §16
      src/globals.css            # CSS custom properties do DS v4 §15
    api/                         # Node.js 20 + Express 5 (backend)
      src/
        routes/                  # auth.ts, orcamentos.ts, admin.ts, gc.ts
        controllers/             # auth, orcamentos, admin, gc
        services/
          calc/
            persiana.ts          # fórmulas dos 7 tipos de persiana
            cortina.ts           # BLOQUEANTE-02: não implementar até regras definidas
            arredondamento.ts    # roundHalfUp() — único ponto de arredondamento
            componentes.ts       # componentes fixos e condicionais por tipo
          gc/
            client.ts            # axios + p-queue singleton (3 req/s)
            produtos.ts          # POST e PUT /api/produtos
            orcamentos.ts        # POST e PUT /api/orcamentos
            clientes.ts          # GET /api/clientes (debounced 300ms)
            catalogos.ts         # GET grupos, produtos, lojas, usuarios, situacoes
            health.ts            # GET /api/lojas como health check (cache 5s)
        middleware/
          auth.ts                # verificação de sessão e perfil
          errorHandler.ts        # tratamento centralizado de erros GC e internos
        prisma/
          schema.prisma
          migrations/
          seed.ts
      package.json
  .env                           # NUNCA commitar
  .env.example                   # commitar
  CLAUDE.md                      # este arquivo

## Comandos

### Instalar dependências
cd apps/api && npm install
cd apps/web && npm install

### Banco — primeira vez
cd apps/api
npx prisma migrate dev --name init
npx prisma db seed
# A tabela "session" do connect-pg-simple é criada automaticamente
# via createTableIfMissing: true no setup do express-session

### Rodar em desenvolvimento
# Terminal 1 — API (porta 3001)
cd apps/api && npm run dev

# Terminal 2 — Frontend (porta 5173)
cd apps/web && npm run dev

### Migrations após alteração de schema
cd apps/api && npx prisma migrate dev --name <descricao>

### Gerar Prisma client após schema change
cd apps/api && npx prisma generate

### Build produção (Railway executa automaticamente no git push)
npm ci && npx prisma migrate deploy && npm run build && npm start

## Convenções
- Valores monetários: sempre DECIMAL(10,2) no banco. NUNCA float.
- Arredondamento: roundHalfUp() de calc/arredondamento.ts em todos os cálculos. Nunca Math.round() direto.
- Larguras e alturas: metros, DECIMAL(6,2). Ex: 1,50m → 1.50
- IDs internos: UUID v4 via crypto.randomUUID()
- Datas: UTC no banco; exibição pt-BR via Intl.DateTimeFormat no frontend
- Erros da API GestãoClick: sempre logar console com payload completo antes de relançar
- Variáveis de ambiente: NUNCA acessar process.env no frontend; apenas via backend
- campo `codigo` nos POSTs ao GestãoClick: Math.floor(Date.now() / 1000)
- campo `codigo_interno` nos produtos GestãoClick: "PERSIA-{timestamp}"
- Tailwind: NUNCA construir classes via template string (bg-${cor}). Purge remove classes dinâmicas.
- TC (Tamanho do Comando): pré-calculado como Altura × 0.75 (TC_FATOR; Victor 17/06/2026, era 0.70) mas campo editável — NÃO usar readOnly
- Campos calculados (exceto TC): readOnly={true} + tabIndex={-1} + onClick={e=>e.target.select()} + font-mono + bg neutral-200
- Desconto: REMOVIDO da calculadora por completo (Victor 17/06/2026). O vendedor envia o valor cheio; o desconto é decidido no próprio GestãoClick. Sem campo de desconto, sem limite por perfil, sem modal de gerente; a tela admin de "Configurações" também foi removida. Colunas de banco (Usuario.desconto_max_pct, tabela Configuracao) mantidas como vestígio (sem migração).

## Decisões Registradas
- Railway: processo Node.js persistente necessário para express-session
- connect-pg-simple: Railway reinicia processo; sessões in-memory seriam perdidas no restart
- JWT descartado: interna sem mobile; sessão 8h é suficiente
- PDF descartado: GestãoClick gera OS, etiqueta e PDF após receber orçamento via API
- Catálogo de tecidos: não replicado localmente; lido do GestãoClick por sessão de formulário
- p-queue singleton: concurrency:1, intervalCap:3, interval:1000ms
- Estado calculadora: React state (in-memory); sem rascunho persistido; orçamento vai ao GC imediatamente

## BLOQUEANTES ATIVOS
- ~~BLOQUEANTE-01: Credenciais GestãoClick~~ — RESOLVIDO em 11/06/2026. Preencher GESTAOCLICK_ACCESS_TOKEN e GESTAOCLICK_SECRET_ACCESS_TOKEN no .env.
- ~~BLOQUEANTE-02: Regras de cálculo de cortina~~ — RESOLVIDO em 16/06/2026 com Victor. 4 modelos no motor (Ilhós/Prega/Franzido/Wave). "Argolas" do DecorSoft = Franzido no varão. Inversão de tecido = método de emenda (altura > largura do tecido). Entretela só na frente. Tecido cortado de 5 em 5 cm. Deslizante: tipo escolhido pelo usuário, qtd automática.
- ~~BLOQUEANTE-03: Percentuais reais de desconto máximo~~ RESOLVIDO em 17/06/2026: não controlar na calculadora; limite/aprovação fica no GestãoClick. Campo de desconto é livre. Removido limite por perfil + modal de senha de gerente.
- BLOQUEANTE-04: Confirmar se CORTINA WAVE FÁCIL (cód. 24) é 16º tipo ativo ou duplicata de CORTINA WAVE FACIL 2.4
- BLOQUEANTE-05: Fator de tecido do WAVE = 2,7 (Victor mediu 3,00 m → 8,10 m). TENTATIVO — ele vai medir mais larguras para confirmar se o fator se mantém.
- BLOQUEANTE-06: Envio de cortina ao GestãoClick. (a) ~~acessórios cadastrados/agrupados no GC~~ RESOLVIDO em 17/06/2026 — todos agrupados (mapa grupo→grupo_id em decisions.md §9.6); (b) cortinas duplas/triplas = modelo "+" do Victor (cada tecido = 1 cortina simples). Resta a IMPLEMENTAÇÃO: modelo "+" na UI + seletor de acessório por grupo + montagem do orçamento (1 linha sintética "MODELO • TECIDO • L×A" + serviço de instalação) + teste controlado de escrita (1 orçamento real, como na persiana).

## PLACEHOLDERS PENDENTES
- ~~PLACEHOLDER-01~~ RESOLVIDO em 11/06/2026. gc_loja_id Matriz (SP): "8274", FILIAL SBC: "8284"
- ~~PLACEHOLDER-02: gc_usuario_id de cada vendedor~~ ESCLARECIDO em 17/06/2026. O vendedor do orçamento vem do cadastro de FUNCIONÁRIOS (GET /api/funcionarios = 30, inclui todas as vendedoras: Rafaela, Leila, Amanda, Isabella, Priscila, Alessandro Bispo 1125449, etc.), NÃO de /api/usuarios (só 3 logins do ERP: Victor 10512, Caixa 11420, Estoque 652101). O vínculo já está pronto (Admin → Usuários, seletor por nome → grava gc_usuario_id = id do funcionário → orçamento envia vendedor_id). Resta só o passo interno de, ao criar cada login da calculadora, escolher o funcionário correspondente. Nada a cadastrar no GC.
- PLACEHOLDER-03: Percentuais de desconto por perfil (padrão temporário: 10% vendedor, 30% admin)
- ~~PLACEHOLDER-04: Fórmulas de cálculo de cortina~~ RESOLVIDO em 16/06/2026 — ver calc/cortina.ts (Ilhós/Prega/Franzido/Wave). Resta só o envio ao GC (BLOQUEANTE-06).
