# SRD — Projeto Pérsia v3.0
## Solution Requirements Document
### Plataforma de Orçamento e Integração Comercial · Rainha das Cortinas
### Stratos Lab · 2026

---

**Versão:** 3.0
**Data:** 11/06/2026
**Status:** Aprovado para desenvolvimento
**Executor:** Claude Code (Anthropic CLI)
**Fontes:** documentacao_projeto_persia_v.3.md · especificacoes_tecnicas_projeto_persia_para_srd.md · api_documentation_gestao_click_projeto_persia.md · design_system_projeto_persia_v.4.md
**Confidencial — uso interno Stratos Lab (PH Figueiredo + Antonio Figueiredo)**

---

## 2. VISÃO GERAL

Desenvolver uma plataforma web interna B2B que substitua o DecorSoft como calculadora de orçamentos de persianas e cortinas, integrando automaticamente os resultados ao ERP GestãoClick via API REST. A plataforma elimina lançamento manual de valores, erros de arredondamento entre vendedores e divergências de estoque causadas pela falta de baixa automática de componentes. Após confirmação do vendedor, o orçamento calculado é enviado diretamente ao GestãoClick com valor exato — o GestãoClick gera OS, etiqueta e PDF internamente.

**Critério de sucesso:** "O que sai da calculadora é o que está no GestãoClick." (Victor Nogueira Pavoni)

**Escopo V1 incluído:**
- Motor de cálculo de persianas (7 tipos) com todos os componentes fixos e condicionais
- Motor de cálculo de cortinas sob medida com camadas dinâmicas (BLOQUEANTE-02: aguarda levantamento de regras com vendedores)
- Integração bidirecional com GestãoClick: leitura de catálogo (tecidos, grupos, clientes, lojas, usuários) e escrita de produtos e orçamentos
- Dois perfis de acesso: Vendedor e Administrador, com política de desconto e aprovação por senha de gerente
- Listagem e acompanhamento de orçamentos com status de sincronização com GestãoClick

**Escopo V1 excluído:**
- Geração de PDF, OS e etiquetas (responsabilidade do GestãoClick após receber orçamento via API)
- Canal atacado (lojistas revendedores)
- Integração com app de motoristas (sistema independente do Victor)
- Portal de revendas, e-commerce, fiscal, NF-e, financeiro
- Manutenção evolutiva após handover (suporte sob demanda R$220/h)

---

## 3. PREMISSAS E DECISÕES DE ARQUITETURA

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Frontend | React 18 + Vite + Tailwind CSS | Ecossistema maduro; Vite acelera sessões curtas do Claude Code; Tailwind elimina CSS separado |
| Backend | Node.js 20 + Express 5 | Stack homogênea JS/TS; sem overhead de frameworks maiores para 8 usuários |
| Banco | PostgreSQL 16 + Prisma ORM | DECIMAL(10,2) nativo (zero erro de ponto flutuante em valores monetários); migrations e seed automáticos |
| Auth | express-session (8h) + bcrypt + **connect-pg-simple** | Sessão server-side; processo Railway pode reiniciar — connect-pg-simple persiste sessões no PostgreSQL, evitando logout forçado das vendedores no meio do expediente |
| JWT | Descartado | Aplicação interna sem mobile; renovação de token adicionaria complexidade sem benefício real |
| GC Client | axios + p-queue | axios: padrão HTTP em Node.js; p-queue: controle de rate limit 3 req/s como singleton compartilhado em gc/client.ts |
| Testes | Vitest | Compatível com Vite e Node.js 20; cobertura do motor de cálculo (núcleo crítico) |
| Hospedagem | Railway (App + PostgreSQL gerenciado) | Processo Node.js persistente (necessário para express-session); PostgreSQL com backup automático; deploy via git push |
| PDF | Fora de escopo | GestãoClick gera OS, etiqueta e PDF após receber orçamento via API |
| Estado multi-step | React state (in-memory) | A calculadora é tela única: tipo → formulário → resultado aparecem na mesma página. Sem navegação sequencial que justifique persistência de rascunho no banco. Usuário pode recalcular em segundos se der F5. |
| Design | Design System Projeto Pérsia v4 | Estética GestãoClick/AdminLTE 3 (decisão Victor); Source Sans Pro + JetBrains Mono (Google Fonts CDN); ícones @fortawesome/react-fontawesome; Tailwind config estendido conforme DS §16 |
| Arredondamento | ROUND_HALF_UP, 2 casas decimais | Implementado em calc/arredondamento.ts; aplicado antes de persistir ou enviar ao GestãoClick |
| codigo GC | Math.floor(Date.now() / 1000) | Timestamp Unix em segundos — inteiro único, sem contador no banco, sem colisão no volume operacional (10-15 orçamentos/dia) |
| Dimensão do tecido | Campo do produto no GestãoClick | VERIFICAR AGORA: BLOQUEANTE-01 resolvido. Fazer GET /api/produtos e inspecionar schema antes da Fase 4. Se não for campo padrão, usar GET /api/campos_extras_produtos. |

**Premissas:**
- (PREMISSA: Credenciais GestãoClick disponíveis. BLOQUEANTE-01 resolvido em 11/06/2026. Preencher GESTAOCLICK_ACCESS_TOKEN e GESTAOCLICK_SECRET_ACCESS_TOKEN no .env antes de iniciar a Fase 4.)
- (PREMISSA: Regras formais de cálculo de cortina não mapeadas. Motor de cortina não pode ser implementado sem levantamento com vendedores. BLOQUEANTE-02.)
- (PREMISSA: Percentuais de desconto em 10% vendedor / 30% admin. Valores são placeholders até Victor confirmar. PLACEHOLDER-03.)
- (PREMISSA: CORTINA WAVE FÁCIL cód. 24 pode ser 16º tipo ativo. Aguarda confirmação de Victor. BLOQUEANTE-04.)
- (PREMISSA: Campo `dimensao` do tecido existe no cadastro de produtos do GestãoClick como campo padrão ou custom. VERIFICAR AGORA via GET /api/produtos — BLOQUEANTE-01 resolvido em 11/06/2026.)

---

## 4. CLAUDE.md

Criar na raiz do repositório como **primeira ação** antes de qualquer código.

```markdown
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
- TC (Tamanho do Comando): pré-calculado como Altura × 0.70 mas campo editável — NÃO usar readOnly
- Campos calculados (exceto TC): readOnly={true} + tabIndex={-1} + onClick={e=>e.target.select()} + font-mono + bg neutral-200
- Desconto acima do limite: modal de senha de gerente → registrar em log_acoes antes de confirmar

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
- BLOQUEANTE-02: Regras de cálculo de cortina — levantamento com vendedores pendente
- BLOQUEANTE-03: Percentuais reais de desconto máximo — confirmar com Victor
- BLOQUEANTE-04: Confirmar se CORTINA WAVE FÁCIL (cód. 24) é 16º tipo ativo ou duplicata de CORTINA WAVE FACIL 2.4

## PLACEHOLDERS PENDENTES
- ~~PLACEHOLDER-01~~ RESOLVIDO em 11/06/2026. gc_loja_id Matriz (SP): "8274", FILIAL SBC: "8284"
- PLACEHOLDER-02: gc_usuario_id de cada vendedor — PENDENTE. GET /api/usuarios retornou apenas Victor (10512), CAIXA (11420), ESTOQUE (652101). Nenhum vendedor cadastrado no GestãoClick ainda. Criar contas no GC antes da Fase 4.
- PLACEHOLDER-03: Percentuais de desconto por perfil (padrão temporário: 10% vendedor, 30% admin)
- PLACEHOLDER-04: Fórmulas de cálculo de cortina (após BLOQUEANTE-02)
```

---

## 5. .ENV.EXAMPLE

```env
# =============================================
# BANCO DE DADOS (Railway PostgreSQL)
# =============================================
DATABASE_URL="postgresql://usuario:senha@host.railway.internal:5432/persia_db"

# =============================================
# SESSÃO (express-session + connect-pg-simple)
# =============================================
SESSION_SECRET="troque-por-string-aleatoria-longa-minimo-64-caracteres"
# 8 horas em milissegundos
SESSION_MAX_AGE=28800000

# =============================================
# API GESTÃOCLICK
# =============================================
# Obtidas com Victor — BLOQUEANTE-01 resolvido em 11/06/2026. Preencher no .env real.
GESTAOCLICK_ACCESS_TOKEN=""        # credenciais disponíveis — preencher no .env real
GESTAOCLICK_SECRET_ACCESS_TOKEN="" # credenciais disponíveis — preencher no .env real
GC_API_BASE_URL="https://api.gestaoclick.com"
# IDs das lojas no GestãoClick — PLACEHOLDER-01 RESOLVIDO em 11/06/2026
GC_LOJA_ID_SP="8274"   # Matriz (SP) — resolvido 11/06/2026
GC_LOJA_ID_SBC="8284"  # FILIAL SBC — resolvido 11/06/2026

# =============================================
# SERVIDOR
# =============================================
PORT=3001
NODE_ENV=development
# URL do frontend (para CORS em desenvolvimento)
FRONTEND_URL="http://localhost:5173"

# =============================================
# FEATURE FLAGS
# =============================================
# Habilita log detalhado das chamadas ao GestãoClick (true em dev, false em prod)
GC_DEBUG_LOG=false
# Timeout em ms para chamadas à API GestãoClick
GC_TIMEOUT_MS=10000
```

---

## 6. SEED DE DADOS

Executar via `npx prisma db seed`. Cria o estado mínimo para o primeiro uso.

```typescript
// apps/api/src/prisma/seed.ts

// 1. Lojas
const lojaSP  = await prisma.loja.create({ data: { nome: "Matriz (SP)", gc_loja_id: "8274" } }); // RESOLVIDO
const lojaSBC = await prisma.loja.create({ data: { nome: "Filial SBC", gc_loja_id: "8284" } }); // RESOLVIDO

// 2. Usuário Administrador
await prisma.usuario.create({
  data: {
    nome: "Victor Nogueira Pavoni",
    email: "victor@rainhadascortinas.com.br",
    senha_hash: bcrypt.hashSync("Admin@2026", 10),
    perfil: "admin",
    loja_id: null,           // admin acessa todas as lojas
    gc_usuario_id: "10512", // Victor — RESOLVIDO 11/06/2026
    desconto_max_pct: 30.00  // PLACEHOLDER-03
  }
});

// 3. Vendedor SP (homologação)
await prisma.usuario.create({
  data: {
    nome: "Vendedor SP Teste",
    email: "vendedor.sp@rainhadascortinas.com.br",
    senha_hash: bcrypt.hashSync("Vendedor@2026", 10),
    perfil: "vendedor",
    loja_id: lojaSP.id,
    gc_usuario_id: null,     // PLACEHOLDER-02
    desconto_max_pct: 10.00  // PLACEHOLDER-03
  }
});

// 4. Vendedor SBC (homologação)
await prisma.usuario.create({
  data: {
    nome: "Vendedor SBC Teste",
    email: "vendedor.sbc@rainhadascortinas.com.br",
    senha_hash: bcrypt.hashSync("Vendedor@2026", 10),
    perfil: "vendedor",
    loja_id: lojaSBC.id,
    gc_usuario_id: null,     // PLACEHOLDER-02
    desconto_max_pct: 10.00  // PLACEHOLDER-03
  }
});

// 5. Configurações globais
await prisma.configuracao.createMany({
  data: [
    { chave: "desconto_max_vendedor_pct", valor: "10", descricao: "PLACEHOLDER-03: confirmar com Victor" },
    { chave: "desconto_max_admin_pct",    valor: "30", descricao: "PLACEHOLDER-03: confirmar com Victor" },
  ]
});
```

**Credenciais para homologação:**

| Perfil | Email | Senha |
|--------|-------|-------|
| Admin | victor@rainhadascortinas.com.br | Admin@2026 |
| Vendedor SP | vendedor.sp@rainhadascortinas.com.br | Vendedor@2026 |
| Vendedor SBC | vendedor.sbc@rainhadascortinas.com.br | Vendedor@2026 |

---

## 7. ATORES E PERFIS

### Perfis da Plataforma

| Perfil | Qtd | Permissões |
|--------|-----|-----------|
| Vendedor | 8 | Calcular orçamentos; enviar ao GestãoClick; aplicar desconto até `desconto_max_pct` do próprio perfil; visualizar próprios orçamentos; reenviar orçamentos com status erro |
| Administrador | 1 (Victor) | Tudo do vendedor + aprovar descontos acima do limite (senha de gerente) + gerenciar usuários + visualizar todos os orçamentos + log de ações + ajustar configurações |

### Mapeamento para GestãoClick

A API GestãoClick usa `usuario_id` e `loja_id` para atribuição de recursos. Cada usuário da plataforma deve ter esses campos preenchidos. BLOQUEANTE-01 resolvido em 11/06/2026 — preencher via painel admin da plataforma (Fase 4).

| Usuário Plataforma | Campo `gc_usuario_id` | Campo `loja_id` (plataforma) | `gc_loja_id` |
|--------------------|----------------------|------------------------------|--------------|
| Admin (Victor) | 10512 (RESOLVIDO) | null (acesso global) | — |
| Vendedor SP 1 | PLACEHOLDER-02 (criar no GC) | loja SP | 8274 (RESOLVIDO) |
| Vendedor SP 2 | PLACEHOLDER-02 (criar no GC) | loja SP | 8274 (RESOLVIDO) |
| Vendedor SBC 1 | PLACEHOLDER-02 (criar no GC) | loja SBC | 8284 (RESOLVIDO) |
| ... | ... | ... | ... |

**Regra:** se `gc_usuario_id` for null no momento do envio, o GestãoClick atribui o usuário master da empresa. O sistema deve exibir alerta visual (alert-warning) quando `gc_usuario_id` do vendedor logado for null.

**Busca de ids:** PLACEHOLDER-01 resolvido (lojas: Matriz/SP=8274, Filial SBC=8284). PLACEHOLDER-02 pendente: GET /api/usuarios retornou Victor (10512), CAIXA (11420), ESTOQUE (652101) — nenhum vendedor ainda. Cadastrar vendedores no GestãoClick e preencher gc_usuario_id via painel admin da plataforma.

---

## 8. MAPA DE TELAS

### Navegação

```
/login
  → (autenticado) /orcamentos

/orcamentos
  → "Criar Orçamento" → /orcamentos/novo
  → "Ver" (linha) → /orcamentos/:id

/orcamentos/novo
  → seleção de tipo (Cortina/Persiana)
  → formulário + cálculo + confirmação
  → (enviado) /orcamentos

/orcamentos/:id
  → visualização readonly + status GC
  → "Reenviar" (se status=erro) → novo POST ao GC

/admin                          [somente admin]
  → /admin/usuarios
  → /admin/configuracoes
  → /admin/log-acoes
```

---

### Tela: /login

**Layout:** centralizado, card sobre fundo neutro. Sem sidebar.

| Campo | Tipo | Validação |
|-------|------|-----------|
| Email | text / email | Obrigatório; formato email |
| Senha | password | Obrigatório; mínimo 6 chars |
| Botão "Entrar" | btn-primary | Disabled enquanto campos inválidos |

**Estados:**
- Credenciais inválidas: helper-error abaixo do campo de senha ("E-mail ou senha incorretos")
- Redirect pós-login: `/orcamentos`
- Redirect se já autenticado: `/orcamentos`

---

### Tela: /orcamentos (lista)

**Layout:** navbar (header preto) + sidebar esquerda (#f4f4f4) + content area.

**Navbar direita:** Indicador de saúde GestãoClick (dot pulsante verde = online / vermelho estático = offline). Polling a cada 30s via `GET /api/gc/health`.

**Content:**

| Elemento | Detalhe |
|----------|---------|
| Botão "Criar Orçamento" | btn-success, topo direito |
| Filtros de status | Chips horizontais: Todos / Enviado / Rascunho / Erro |
| Busca | Input texto (debounced 300ms), filtra por nome do cliente |
| Tabela | Colunas: Código GC, Cliente, Tipo, Valor Final, Status, Data, Ações |
| Badge status | badge-sent (verde) / badge-draft (cinza) / badge-error (vermelho) |
| Ações por linha | Visualizar (btn-info xs); Reenviar se status=erro (btn-warning xs); Cancelar (btn-danger xs — soft delete, não envia ao GC) |
| Paginação | 20 itens por página; botão ativo preto (#000) |
| Skeleton loader | Exibido enquanto lista carrega |

**Banner de serviço GC offline:** faixa warning no topo ("GestãoClick indisponível. Envios bloqueados.") quando health check retorna offline. Botões de envio ficam disabled.

---

### Tela: /orcamentos/novo

**Layout:** grid `lg:grid-cols-3 gap-4`. Formulário (`lg:col-span-2`). Painel de resultado sticky (`lg:col-span-1`, `position: sticky; top: calc(50px + 16px)`). Em tablet/mobile: formulário acima, resultado abaixo.

**Etapa 1 — Seleção de Tipo:**

Cards clicáveis em grid 2 colunas:
- **Persiana** — ícone + descrição "7 tipos (rolo e romana)"
- **Cortina** — ícone + descrição "15 tipos sob medida" (BLOQUEANTE-02: se cortina selecionada, exibir alert-warning "Cálculo de cortina em desenvolvimento")

Seleção: borda verde (#00a65a) + background #f4fff9. Hover com mesma aparência.

---

**Etapa 2A — Formulário Persiana:**

| Campo | Tipo | Obrigatório | Comportamento |
|-------|------|------------|---------------|
| Produto Sob Medida | Select | Sim | 7 tipos. Ao mudar: recarrega Coleção (fetch tecidos do grupo correspondente) |
| Cor Acessório | Select | Sim | Opções: Branco, Bege, Cinza, Preto |
| Acionamento | Select | Sim | Opções: Com Bandô, Com Barra Estabilizadora, Motorizado com Bandô, Motorizado sem Bandô |
| Coleção (Tecido) | Select | Sim | Carregado via `GET /api/produtos?grupo_id={id}&ativo=1`. Exibe nome + dimensão. Skeleton enquanto carrega. |
| Largura | Number (m) | Sim | DECIMAL(6,2); positivo; 2 casas. Ao alterar: valida contra largura_max do tecido selecionado |
| Altura | Number (m) | Sim | DECIMAL(6,2); positivo; 2 casas. Ao alterar: recalcula TC automaticamente |
| TC | Number (m) | Sim | Pré-preenchido = Altura × 0,70. **Campo editável** (não readOnly). Mínimo: 0,01m |
| Rolamento | Select | Sim | Dianteiro, Traseiro |
| Base | Select | Sim | Branco, Bege, Cinza, Preto |
| Mesmo Ambiente | Toggle (Sim/Não) | Não | Default: Não |

**Validação largura máxima (RN-01):**
Se `Largura > dimensao_m` do tecido: field-alert (error) abaixo do campo de Largura com chips de tecidos alternativos (clicáveis — seleciona o tecido no campo Coleção).

**Botão "Calcular":** btn-success, desabilitado até todos os campos obrigatórios preenchidos e sem erros de validação.

---

**Etapa 2B — Formulário Cortina (BLOQUEANTE-02):**

Exibir alert-warning: "Cálculo de cortinas em desenvolvimento. Disponível após levantamento com as vendedores." Botão "Calcular" permanece disabled.

Quando BLOQUEANTE-02 resolvido, o formulário terá:

**Seção Cabeçalho:**

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| Modelo da Cortina | Select | Sim | 15 tipos (cód. 1-18 exceto 6) |
| Largura | Number (m) | Sim |
| Altura | Number (m) | Sim |
| Abertura | Select | Sim | 14 opções ativas: EM 2-8 PARTES, INTEIRA, LATERAL, TRESPASSADO, COMANDO A/B/C/D, COMANDO ESQ., COMANDO DIR., LADO A LADO |
| Tipo de Costura | Select | Sim | Opções a confirmar com Victor (PLACEHOLDER pendente) |
| Trilho Frontal | Select | Não |
| Trilho Traseiro | Select | Não |
| Deslizante Frontal | Select | Não |
| Deslizante Traseiro | Select | Não |
| Suporte | Select | Não |
| Final Frontal | Select | Não |
| Final Traseiro | Select | Não |

**Seção Camadas de Tecido (dinâmica):**

Cada camada tem: Tecido (select), Barra (toggle), Dupla (toggle), Franzido (toggle), Inverter (toggle). Botão "+" adiciona nova camada sem limite fixo.

Campo ao final da seção: Instalador (text livre).

---

**Painel de Resultado (sticky, aparece após "Calcular"):**

| Elemento | Comportamento |
|----------|--------------|
| Breakdown de componentes | Lista: label | valor (font-mono). Linha de total com borda-top 2px. Todos readonly. |
| Valor Bruto | Font-mono 20px 700, readonly, bg #e9ecef |
| Campo Desconto (%) | Number input, 0 a desconto_max_pct do perfil. Valor final atualiza em tempo real. |
| Valor Final | Font-mono 20px 700, readonly. Exibido em verde se desconto 0, neutro se desconto aplicado. |
| Busca de Cliente | Input com busca debounced (300ms) via GestãoClick. Lista dropdown de resultados. |
| Botão "Enviar ao GestãoClick" | btn-success. Disabled se GC offline, se gc_usuario_id null, se cliente não selecionado. |
| Botão "Cancelar" | btn-default. Limpa formulário e volta para /orcamentos. |

**Desconto acima do limite:** ao tentar confirmar com desconto > desconto_max_pct, abre ModalSenhaGerente. Se senha incorreta: .input-shake + helper-error. Se senha correta: registra em log_acoes + permite envio.

**Fluxo de envio:**
1. POST /api/produtos → obtém gc_produto_id
2. POST /api/orcamentos → obtém gc_orcamento_id
3. Status = "enviado" → toast-success ("Orçamento #XXXX criado no GestãoClick")
4. Erro: status = "erro" → toast-error + badge-error na linha da listagem

---

### Tela: /orcamentos/:id

Layout: card readonly com todos os campos do orçamento. Badge de status. Botão "Reenviar" (btn-warning) se status=erro. Link do orçamento no GestãoClick (se gc_orcamento_id disponível).

---

### Tela: /admin/usuarios

Tabela de usuários: nome, email, perfil, loja, desconto_max, gc_usuario_id, ativo. Ações: editar (btn-warning xs), desativar (btn-danger xs). Botão "Adicionar Usuário" (btn-success).

---

### Tela: /admin/configuracoes

Formulário com campos da tabela `configuracoes`: desconto_max_vendedor_pct, desconto_max_admin_pct. Botão "Salvar" (btn-success).

---

### Tela: /admin/log-acoes

Tabela: data/hora, usuário, ação, detalhe JSON formatado. Paginação 20 itens.

---

## 9. MODELO DE DADOS

### Tabela: `usuarios`

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| id | UUID | PK | gen_random_uuid() | Identificador interno |
| nome | VARCHAR(100) | NOT NULL | — | Nome completo |
| email | VARCHAR(150) | NOT NULL, UNIQUE | — | Login da plataforma |
| senha_hash | VARCHAR(255) | NOT NULL | — | Hash bcrypt |
| perfil | ENUM('vendedor','admin') | NOT NULL | 'vendedor' | Nível de acesso |
| loja_id | UUID | FK lojas, NULLABLE | NULL | Loja vinculada (null = acesso global) |
| gc_usuario_id | VARCHAR(50) | NULLABLE | NULL | ID do usuário no GestãoClick (PLACEHOLDER-02) |
| desconto_max_pct | DECIMAL(5,2) | NOT NULL | 10.00 | Desconto máximo sem aprovação do admin |
| ativo | BOOLEAN | NOT NULL | true | Soft delete |
| criado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |
| atualizado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |

### Tabela: `lojas`

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| id | UUID | PK | gen_random_uuid() | — |
| nome | VARCHAR(50) | NOT NULL | — | "SP" ou "São Bernardo" |
| gc_loja_id | VARCHAR(50) | NULLABLE | NULL | ID da loja no GestãoClick (PLACEHOLDER-01) |
| ativo | BOOLEAN | NOT NULL | true | — |

### Tabela: `orcamentos`

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| id | UUID | PK | gen_random_uuid() | — |
| tipo_produto | ENUM | NOT NULL | — | `persiana_rolo_blackout`, `persiana_rolo_screen`, `persiana_rolo_translucido`, `persiana_rolo_double_vision`, `persiana_romana_blackout`, `persiana_romana_screen`, `persiana_romana_translucido`, `cortina` |
| usuario_id | UUID | FK usuarios, NOT NULL | — | Vendedor que gerou |
| loja_id | UUID | FK lojas, NOT NULL | — | Loja do vendedor |
| gc_orcamento_id | VARCHAR(50) | NULLABLE | NULL | ID retornado pelo GestãoClick após criação |
| gc_produto_id | VARCHAR(50) | NULLABLE | NULL | ID do produto criado no GestãoClick |
| status | ENUM('rascunho','enviado','erro','cancelado') | NOT NULL | 'rascunho' | Status de sincronização |
| nome_cliente | VARCHAR(150) | NOT NULL | — | Nome do cliente |
| gc_cliente_id | VARCHAR(50) | NULLABLE | NULL | ID do cliente no GestãoClick (se encontrado) |
| tecido_codigo_gc | VARCHAR(50) | NOT NULL | — | Código do tecido no GestãoClick |
| tecido_nome | VARCHAR(100) | NOT NULL | — | Nome do tecido (snapshot do momento do cálculo) |
| largura_m | DECIMAL(6,2) | NOT NULL | — | Largura real solicitada pelo cliente |
| altura_m | DECIMAL(6,2) | NOT NULL | — | Altura solicitada |
| dimensao_m | DECIMAL(6,2) | NULLABLE | NULL | Largura do rolo do tecido ([Dimensão]) — persiana |
| tc_m | DECIMAL(6,2) | NULLABLE | NULL | Tamanho do comando (persiana) |
| acionamento | VARCHAR(50) | NULLABLE | NULL | com_bando, com_barra, motorizado_com_bando, motorizado_sem_bando |
| cor_acessorio | VARCHAR(20) | NULLABLE | NULL | Branco, Bege, Cinza, Preto |
| rolamento | VARCHAR(20) | NULLABLE | NULL | Dianteiro, Traseiro |
| valor_bruto | DECIMAL(10,2) | NOT NULL | — | Valor calculado antes do desconto |
| desconto_pct | DECIMAL(5,2) | NOT NULL | 0.00 | Percentual de desconto aplicado |
| valor_final | DECIMAL(10,2) | NOT NULL | — | Valor após desconto — enviado ao GestãoClick |
| desconto_aprovado_por | UUID | FK usuarios, NULLABLE | NULL | Admin que aprovou desconto acima do limite |
| payload_gc_enviado | JSONB | NULLABLE | NULL | Payload enviado ao GestãoClick (debug) |
| resposta_gc | JSONB | NULLABLE | NULL | Resposta do GestãoClick (debug) |
| erro_gc | TEXT | NULLABLE | NULL | Mensagem de erro da integração |
| criado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |
| atualizado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |

**Índices:**
- `(usuario_id, criado_em DESC)` — histórico paginado por vendedor
- `(status)` — filtro de reenvio na listagem
- `(gc_orcamento_id)` — lookup após criação no GestãoClick

### Tabela: `itens_orcamento`

Snapshot imutável dos componentes calculados. Atualizações de preço no GestãoClick não retroagem.

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| id | UUID | PK | gen_random_uuid() | — |
| orcamento_id | UUID | FK orcamentos, NOT NULL | — | — |
| descricao | VARCHAR(150) | NOT NULL | — | Nome do componente no momento do cálculo |
| quantidade | DECIMAL(10,4) | NOT NULL | — | Ex: 3.6000 m² |
| unidade | VARCHAR(20) | NOT NULL | — | m², un, m |
| preco_unitario | DECIMAL(10,2) | NOT NULL | — | Snapshot do preço no momento do cálculo |
| valor_total | DECIMAL(10,2) | NOT NULL | — | quantidade × preco_unitario, ROUND_HALF_UP |

### Tabela: `configuracoes`

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| chave | VARCHAR(100) | PK | — | Chave única |
| valor | TEXT | NOT NULL | — | Valor serializado |
| descricao | VARCHAR(255) | NULLABLE | NULL | Documentação da chave |
| atualizado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |

**Chaves iniciais:** `desconto_max_vendedor_pct` = "10", `desconto_max_admin_pct` = "30"

### Tabela: `log_acoes`

| Campo | Tipo | Constraint | Padrão | Descrição |
|-------|------|-----------|--------|-----------|
| id | UUID | PK | gen_random_uuid() | — |
| usuario_id | UUID | FK usuarios, NOT NULL | — | Quem executou |
| acao | VARCHAR(100) | NOT NULL | — | "desconto_aprovado", "orcamento_enviado_gc", "orcamento_reenviado" |
| detalhe | JSONB | NULLABLE | NULL | Contexto: ID do orçamento, valor anterior/novo, etc. |
| criado_em | TIMESTAMPTZ | NOT NULL | NOW() | — |

### Tabela de sessão (connect-pg-simple — criada automaticamente)

```sql
-- Criada pelo connect-pg-simple com createTableIfMissing: true
-- Não incluída no schema Prisma; gerenciada diretamente pelo middleware
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

### Schema Prisma

```prisma
// apps/api/src/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Perfil {
  vendedor
  admin
}

enum StatusOrcamento {
  rascunho
  enviado
  erro
  cancelado
}

enum TipoProduto {
  persiana_rolo_blackout
  persiana_rolo_screen
  persiana_rolo_translucido
  persiana_rolo_double_vision
  persiana_romana_blackout
  persiana_romana_screen
  persiana_romana_translucido
  cortina
}

model Loja {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome       String    @db.VarChar(50)
  gc_loja_id String?   @db.VarChar(50)
  ativo      Boolean   @default(true)
  usuarios   Usuario[]
  orcamentos Orcamento[]
}

model Usuario {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nome             String    @db.VarChar(100)
  email            String    @unique @db.VarChar(150)
  senha_hash       String    @db.VarChar(255)
  perfil           Perfil    @default(vendedor)
  loja_id          String?   @db.Uuid
  loja             Loja?     @relation(fields: [loja_id], references: [id])
  gc_usuario_id    String?   @db.VarChar(50)
  desconto_max_pct Decimal   @default(10.00) @db.Decimal(5,2)
  ativo            Boolean   @default(true)
  criado_em        DateTime  @default(now()) @db.Timestamptz
  atualizado_em    DateTime  @updatedAt @db.Timestamptz
  orcamentos       Orcamento[] @relation("OrcamentosVendedor")
  aprovacoes       Orcamento[] @relation("OrcamentosAprovados")
  log_acoes        LogAcao[]
}

model Orcamento {
  id                    String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tipo_produto          TipoProduto
  usuario_id            String          @db.Uuid
  usuario               Usuario         @relation("OrcamentosVendedor", fields: [usuario_id], references: [id])
  loja_id               String          @db.Uuid
  loja                  Loja            @relation(fields: [loja_id], references: [id])
  gc_orcamento_id       String?         @db.VarChar(50)
  gc_produto_id         String?         @db.VarChar(50)
  status                StatusOrcamento @default(rascunho)
  nome_cliente          String          @db.VarChar(150)
  gc_cliente_id         String?         @db.VarChar(50)
  tecido_codigo_gc      String          @db.VarChar(50)
  tecido_nome           String          @db.VarChar(100)
  largura_m             Decimal         @db.Decimal(6,2)
  altura_m              Decimal         @db.Decimal(6,2)
  dimensao_m            Decimal?        @db.Decimal(6,2)
  tc_m                  Decimal?        @db.Decimal(6,2)
  acionamento           String?         @db.VarChar(50)
  cor_acessorio         String?         @db.VarChar(20)
  rolamento             String?         @db.VarChar(20)
  valor_bruto           Decimal         @db.Decimal(10,2)
  desconto_pct          Decimal         @default(0.00) @db.Decimal(5,2)
  valor_final           Decimal         @db.Decimal(10,2)
  desconto_aprovado_por String?         @db.Uuid
  aprovador             Usuario?        @relation("OrcamentosAprovados", fields: [desconto_aprovado_por], references: [id])
  payload_gc_enviado    Json?
  resposta_gc           Json?
  erro_gc               String?
  criado_em             DateTime        @default(now()) @db.Timestamptz
  atualizado_em         DateTime        @updatedAt @db.Timestamptz
  itens                 ItemOrcamento[]

  @@index([usuario_id, criado_em(sort: Desc)])
  @@index([status])
  @@index([gc_orcamento_id])
}

model ItemOrcamento {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orcamento_id   String    @db.Uuid
  orcamento      Orcamento @relation(fields: [orcamento_id], references: [id])
  descricao      String    @db.VarChar(150)
  quantidade     Decimal   @db.Decimal(10,4)
  unidade        String    @db.VarChar(20)
  preco_unitario Decimal   @db.Decimal(10,2)
  valor_total    Decimal   @db.Decimal(10,2)
}

model Configuracao {
  chave         String   @id @db.VarChar(100)
  valor         String
  descricao     String?  @db.VarChar(255)
  atualizado_em DateTime @updatedAt @db.Timestamptz
}

model LogAcao {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  usuario_id String   @db.Uuid
  usuario    Usuario  @relation(fields: [usuario_id], references: [id])
  acao       String   @db.VarChar(100)
  detalhe    Json?
  criado_em  DateTime @default(now()) @db.Timestamptz
}
```

---

## 10. REGRAS DE NEGÓCIO E CÁLCULO

### Arredondamento (declaração obrigatória — aplica-se a todos os cálculos)

**ROUND_HALF_UP com 2 casas decimais.** Implementar em `calc/arredondamento.ts` como único ponto de arredondamento da aplicação.

```typescript
// calc/arredondamento.ts
export function roundHalfUp(value: number, decimals: number = 2): number {
  return Number(
    Math.round(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
  );
}
// Exemplo: roundHalfUp(1.225) → 1.23 | roundHalfUp(1.224) → 1.22
```

---

### RN-01: Restrição de Largura Máxima por Tecido

Se `Largura > dimensao_m do tecido selecionado`: bloquear cálculo e exibir field-alert (error) com chips clicáveis dos tecidos do mesmo grupo que possuem `dimensao_m >= Largura`.

```
Exemplo:
  Tecido LINHO BLACKOUT 2,00m + Largura informada 2,20m
  → Erro: "Este tecido suporta até 2,00m. Tecidos alternativos: [LINHO PREMIUM 2,50m] [LINHO EXTRA 3,00m]"
```

---

### RN-02: Tipos e Fórmulas de Cálculo de Persiana

Variáveis:
- `[Largura]`: largura real solicitada pelo cliente (metros) — entrada do usuário
- `[Dimensão]`: largura do rolo do tecido — lido do GestãoClick (`dimensao_m` do produto)
- `[Altura]`: altura da persiana — entrada do usuário

| Código GC | Tipo | Família | Margem Altura | Fórmula Produção (m²) | Fórmula Venda (m²) |
|-----------|------|---------|--------------|----------------------|-------------------|
| 2591 | PERSIANA ROLO BLACKOUT | Rolo | +0,15m | `[Largura] × ([Altura] + 0,15)` | `[Dimensão] × ([Altura] + 0,15)` |
| 2608 | PERSIANA ROLO TRANSLÚCIDO | Rolo | +0,15m | `[Largura] × ([Altura] + 0,15)` | `[Dimensão] × ([Altura] + 0,15)` |
| 2592 | PERSIANA ROLO SCREEN | Rolo/Screen | +0,15m | `[Largura] × ([Altura] + 0,15)` | `[Largura] × ([Altura] + 0,15) × 1,3` |
| 2606 | PERSIANA DOUBLE VISION | Rolo | +0,15m | `[Largura] × ([Altura] × 2 + 0,15)` | `[Dimensão] × ([Altura] × 2 + 0,15)` |
| 2601 | PERSIANA ROMANA TRANSLÚCIDO | Romana | +0,08m | `[Largura] × ([Altura] + 0,08)` | `[Dimensão] × ([Altura] + 0,08) × 1,2` |
| 2611 | PERSIANA ROMANA BLACKOUT | Romana | +0,08m | `[Largura] × ([Altura] + 0,08)` | `[Dimensão] × ([Altura] + 0,08) × 1,3` |
| 2612 | PERSIANA ROMANA SCREEN | Romana/Screen | +0,08m | `[Largura] × ([Altura] + 0,08)` | `[Largura] × ([Altura] + 0,08) × 1,2` |

**Regra Screen:** Rolo Screen e Romana Screen usam `[Largura]` (não `[Dimensão]`) na fórmula de venda, com multiplicador de desperdício de corte. Os demais tipos usam `[Dimensão]` (o vendedor paga a bobina inteira).

**Double Vision:** altura é multiplicada por 2 antes de aplicar a margem (`[Altura] × 2 + 0,15`).

---

### RN-03: Modelo de Precificação

```
Valor Bruto = Qtd Venda (m²) × Preço de Venda do Tecido (R$/m²)
Valor Final  = roundHalfUp(Valor Bruto × (1 - desconto_pct / 100))
```

O tipo de persiana é um "guarda-chuva" com preço placeholder no GestãoClick (R$1/m²). O preço real vem do tecido selecionado. O orçamento enviado ao GestãoClick usa o `valor_final` calculado, nunca o placeholder.

---

### RN-04: Tamanho do Comando (TC)

```
TC padrão = roundHalfUp(Altura × 0.70)
```

Calculado automaticamente ao preencher o campo Altura. Campo **editável** pelo vendedor (não aplicar readOnly). O valor final (automático ou editado) é registrado no orçamento.

---

### RN-05: Componentes Fixos (por persiana, todos os tipos)

| Componente | Qtd | Unidade |
|-----------|-----|---------|
| Fita dupla face | 1 | un |
| Fita colante | 1 | un |
| Embalagem | 1 | un |
| Mão de obra | 1 | un |
| Parafuso e bucha | `CEIL(Largura / 0.5)` | un |

---

### RN-06: Componentes Condicionais

Selecionados automaticamente em função de: `acionamento` + `cor_acessorio` + faixa de `largura_m`.

A tabela de regras condicionais é embutida no backend em `calc/componentes.ts` (extraída do Sheet 07 do DecorSoft). Estrutura de dados:

```typescript
type RegraCondicional = {
  tipos: TipoProduto[];         // tipos de persiana onde a regra se aplica
  acionamentos: string[];       // ['com_bando', 'motorizado_com_bando', ...]
  cores: string[];              // ['Branco', 'Bege', ...]
  largura_min: number;          // metros
  largura_max: number;          // metros (Infinity se sem limite)
  componente: string;           // nome do componente
  quantidade: number | ((largura: number) => number); // fixo ou calculado
  unidade: string;
};
```

Componentes condicionais incluem: presilhas, tampas, bandô, corrente, tubo, motor (motorizados), suportes, clips, trilhos de guia.

---

### RN-07: Base e Tampa

| Família | Fórmula Base | Componente |
|---------|-------------|-----------|
| Rolo (Blackout, Screen, Translúcido) | `[Largura] - 0,025` m | BASE CÔNICA |
| Romana (Blackout, Screen, Translúcido) | `[Largura]` m | BASE CÔNICA |
| Double Vision | `[Largura] - 0,025` m | **BASE DOUBLE VISION** (componente diferente) |

Tampas: **2 por persiana**, mesma medida da base. Cor = `cor_acessorio` selecionado.

Double Vision usa exclusivamente componentes `BASE DOUBLE VISION` e `TAMPA DOUBLE VISION` (não `BASE CÔNICA`).

---

### RN-08: Política de Desconto

```
Se desconto_pct <= desconto_max_pct do perfil do vendedor:
  → Permitido diretamente

Se desconto_pct > desconto_max_pct:
  → Abre ModalSenhaGerente
  → Vendedor informa senha de um usuário com perfil=admin
  → Senha correta: registra em log_acoes (desconto_aprovado), permite envio
  → Senha incorreta: .input-shake + helper-error
```

O campo `desconto_aprovado_por` no orçamento registra o UUID do admin que aprovou.

---

### RN-09: Regras de Cortina (BLOQUEANTE-02)

Motor de cálculo de cortina não implementado até levantamento formal de regras com os vendedores. O serviço `calc/cortina.ts` deve existir como stub que lança NotImplementedError. Formulário exibe alert-warning ao selecionar tipo Cortina.

---

### RN-10: Valor Exato no GestãoClick

O `valor_final` enviado via `POST /api/orcamentos` é exatamente o `roundHalfUp(valor_bruto × (1 - desconto_pct/100))`. Nenhuma transformação adicional é aplicada entre o cálculo e o envio.

---

### RN-11: Orçamento Prévio vs. Final

A plataforma suporta:
1. **Orçamento prévio** (medida aproximada): enviado ao GestãoClick com situacao "em aberto"
2. **Orçamento final** (medidas reais): atualiza via `PUT /api/orcamentos/{gc_orcamento_id}` ou cria novo orçamento

Edição de orçamento já enviado: disponível enquanto o status no GestãoClick não for convertido em venda.

---

## 11. CONTRATO DE INTEGRAÇÃO — GESTÃOCLICK API

**Base URL:** `https://api.gestaoclick.com`

**Autenticação (todos os endpoints):**
```
Headers:
  access_token: {GESTAOCLICK_ACCESS_TOKEN}
  secret_access_token: {GESTAOCLICK_SECRET_ACCESS_TOKEN}
  Content-Type: application/json
```

**Rate Limiting:** 3 req/s (empresa), 30.000 req/dia. Implementado via p-queue com `concurrency:1, intervalCap:3, interval:1000ms`. Status 429 absorvido silenciosamente — retry automático pela fila, sem mensagem ao usuário.

**Paginação GET:** máximo 100 registros por página. Parâmetros: `?pagina={n}&ordenacao={campo}&direcao=asc|desc`. Implementar paginação completa em `catalogos.ts` para tecidos e clientes.

---

### Endpoints de Leitura

**GET /api/lojas**
- Finalidade: obter gc_loja_id das lojas SP e SBC; usado também como health check (GET leve)
- Response: `[{ id: string, nome: string, ... }]`
- Health check: `GET /api/gc/health` (backend interno) → chama este endpoint, retorna `{ status: 'online'|'offline', latency_ms: number }`. Cache 5s server-side.

**GET /api/usuarios**
- Finalidade: obter gc_usuario_id de cada vendedor
- Response: `[{ id: string, nome: string, ... }]`

**GET /api/grupos_produtos**
- Finalidade: obter grupos de tecido para filtrar por tipo de persiana/cortina
- Response: `[{ id: string, nome: string }]`

**GET /api/produtos**
- Params: `grupo_id={id}`, `ativo=1`, `pagina={n}`
- Finalidade: listar tecidos do grupo com dimensão e preço
- Response: `[{ id: string, nome: string, codigo_interno: string, valor_venda: number, valor_custo: number, ... }]`
- **ATENÇÃO:** O campo `dimensao` (largura do rolo em metros) pode ser campo padrão ou campo extra no GestãoClick. BLOQUEANTE-01 resolvido — VERIFICAR AGORA via GET /api/produtos antes da Fase 4. Se não for campo padrão, implementar via `GET /api/campos_extras_produtos`.

**GET /api/clientes**
- Params: `nome={query}` ou `cpf_cnpj={query}` (busca debounced 300ms no frontend)
- Filtros adicionais disponíveis: `tipo_pessoa`, `situacao=1` (somente ativos)
- Response: `[{ id: string, nome: string, tipo_pessoa: string, cpf_cnpj: string }]`

**GET /api/situacoes_orcamentos**
- Finalidade: obter situacao_id para "orçamento em aberto"
- Response: `[{ id: string, nome: string, tipo_lancamento: 0|1|2|3 }]`
- Usar situação com `tipo_lancamento: 0` ("Não lança") para orçamentos em aberto

---

### Endpoints de Escrita

**POST /api/produtos**
```json
Request:
{
  "nome": "PERSIANA ROLO BLACKOUT - LINHO DIGITAL - 1.50x2.00 - Branco - Com Bandô",
  "codigo_interno": "PERSIA-1748908800",
  "valor_custo": 180.00,
  "valores_venda": [
    { "tipo_id": 1, "valor_venda": 210.00 }
  ]
}

Response:
{
  "id": "123456",
  "nome": "...",
  ...
}
```

**PUT /api/produtos/{id}** — mesmos campos obrigatórios; usado em revisão de orçamento.

**POST /api/orcamentos**
```json
Request:
{
  "tipo": "produto",
  "codigo": 1748908800,
  "cliente_id": "789",
  "situacao_id": "1",
  "data": "2026-06-11",
  "usuario_id": "gc_usuario_id_do_vendedor",
  "loja_id": "gc_loja_id_da_loja",
  "produtos": [
    {
      "produto_id": "123456",
      "quantidade": 3.00,
      "valor_venda": 210.00,
      "valor_custo": 180.00
    }
  ]
}

Response:
{
  "id": "gc_orcamento_id",
  ...
}
```

**PUT /api/orcamentos/{id}** — mesmos campos obrigatórios; usado em revisão.

---

### Fallbacks por HTTP Status

| Status | Comportamento | Mensagem ao usuário | Recuperação |
|--------|--------------|---------------------|------------|
| 429 | p-queue absorve silenciosamente; retry automático | Spinner sem mensagem de erro | Automático pela fila |
| 401 | Banner global de erro no topo (persistente até resolução) | "Integração GestãoClick indisponível. Contate o administrador." | Admin verifica credenciais no .env |
| 400 | Orçamento status='erro'; logar payload completo | "Erro ao criar orçamento no GestãoClick: {mensagem}" | Vendedor corrige e usa botão "Reenviar" |
| 5xx | Orçamento status='erro'; badge-error na listagem | Toast-error + botão "Reenviar" visível | Vendedor usa "Reenviar" após GC se recuperar |
| Timeout (10s) | Tratar como 5xx | Mesmo comportamento do 5xx | Mesmo |
| Network error | Tratar como 5xx | Mesmo comportamento do 5xx | Mesmo |

**Reenvio:** endpoint `POST /api/orcamentos/:id/reenviar` no backend da plataforma. Busca o orçamento pelo id interno, tenta novo POST ao GestãoClick com os dados salvos, atualiza `status`, `gc_orcamento_id`, `resposta_gc`, `erro_gc`.

---

### Fluxo Completo de Criação

```
Frontend: Vendedor clica "Enviar ao GestãoClick"
  ↓
Backend: POST /api/orcamentos (plataforma) recebe {formulario + resultado_calculo}
  ↓
Backend: gc/produtos.ts → POST /api/produtos (GC) → obtém gc_produto_id
  ↓
Backend: gc/orcamentos.ts → POST /api/orcamentos (GC) com gc_produto_id → obtém gc_orcamento_id
  ↓
Backend: salva orcamento no PostgreSQL com status='enviado', gc_produto_id, gc_orcamento_id
  ↓
Frontend: toast-success + badge-sent na listagem
```

---

## 13. PLANO DE FASES

### Fase 1 — Setup e Infraestrutura (sem bloqueantes)

**Objetivo:** repositório e ambiente configurados, deploy Railway funcional.
**Critério:** `npm run dev` sobe API na 3001 e frontend na 5173 sem erros. Railway deploy executa com sucesso.

**Entregáveis:**
- CLAUDE.md criado na raiz
- Monorepo inicializado: `apps/web` (React+Vite+Tailwind) + `apps/api` (Express 5+Prisma)
- tailwind.config.ts com tema estendido do DS v4 §16
- globals.css com CSS custom properties do DS v4 §15
- Google Fonts importados no `index.html` (Source Sans Pro + JetBrains Mono)
- @fortawesome/react-fontawesome instalado
- connect-pg-simple instalado e configurado
- .env.example
- schema.prisma com todas as tabelas
- Primeira migration: `npx prisma migrate dev --name init`
- Seed funcional
- Deploy Railway: App + PostgreSQL

---

### Fase 2 — Autenticação e Layout Base (sem bloqueantes)

**Objetivo:** tela de login funcional, layout com navbar+sidebar, middleware de autenticação.
**Critério:** login com credenciais do seed funciona; página protegida redireciona para /login sem sessão.

**Entregáveis:**
- Tela `/login` completa (campo email + senha + validação + submit)
- Middleware `auth.ts` (verifica sessão; bloqueia rotas protegidas)
- Layout base: Navbar preta (header 50px) + Sidebar #f4f4f4 (220px) + Content area
- Indicador GC no canto direito da navbar: dot pulsante (online/offline/verificando)
- `GET /api/gc/health` backend com cache 5s
- Polling frontend a cada 30s
- Banner de GC offline quando health check falha

---

### Fase 3 — Motor de Cálculo de Persiana (sem bloqueantes)

**Objetivo:** cálculo local de persiana 100% funcional e testado antes de qualquer integração real.
**Critério:** 100% de cobertura Vitest nas funções de cálculo; resultados batem com exemplos validados da spec.

**Entregáveis:**
- `calc/arredondamento.ts`: roundHalfUp() com testes unitários
- `calc/componentes.ts`: componentes fixos e condicionais (RN-05, RN-06, RN-07)
- `calc/persiana.ts`: fórmulas dos 7 tipos (RN-02, RN-03) com testes unitários por tipo
- `POST /api/calcular/persiana` no backend: recebe formulário, retorna breakdown + valor_bruto
- Formulário persiana na tela `/orcamentos/novo`: todos os campos (RN-04 auto-preenchendo TC)
- Painel de resultado sticky com breakdown de componentes (readonly) + valor total
- Validação de largura máxima (RN-01) com chips alternativos
- Desconto com validação de limite (sem modal de gerente ainda — Fase 6)

> **Nota:** os selects de Coleção (tecido) usarão dados mockados nesta fase (lista de tecidos hardcoded). Mocks serão substituídos por leitura real do GestãoClick na Fase 4 (credenciais disponíveis desde 11/06/2026). Mock documentado claramente nos comentários.

---

### Fase 4 — Integração de Leitura GestãoClick

**Objetivo:** substituir mocks de tecidos por dados reais do GestãoClick.
**Critério:** selects de Coleção carregam tecidos reais com dimensão e preço do GestãoClick.

**Pré-requisito:** ~~BLOQUEANTE-01~~ RESOLVIDO em 11/06/2026. Preencher GESTAOCLICK_ACCESS_TOKEN e GESTAOCLICK_SECRET_ACCESS_TOKEN no .env antes de iniciar. Verificar campo `dimensao` via GET /api/produtos antes de implementar.

**Entregáveis:**
- `gc/client.ts`: axios + p-queue singleton configurado
- `gc/catalogos.ts`: GET grupos, produtos (paginado), lojas, usuários, situações
- `gc/clientes.ts`: busca debounced 300ms
- Substituição dos mocks de tecidos por fetch real ao GestãoClick
- Preenchimento de PLACEHOLDER-01 (gc_loja_id — RESOLVIDO) e PLACEHOLDER-02 (gc_usuario_id) via painel admin
- Alerta visual quando gc_usuario_id do vendedor logado for null (RN: usuário não mapeado)

---

### Fase 5 — Integração de Escrita GestãoClick

**Objetivo:** envio real de orçamentos de persiana ao GestãoClick.
**Critério:** orçamento criado na plataforma aparece no GestãoClick com valor exato. Status badge atualizado corretamente.

**Pré-requisito:** Fase 4 concluída.

**Entregáveis:**
- `gc/produtos.ts`: POST e PUT /api/produtos com montagem do payload
- `gc/orcamentos.ts`: POST e PUT /api/orcamentos com montagem do payload
- Fluxo completo de confirmação: calc → POST produto → POST orçamento → salvar local
- Toast-success com referência do orçamento GC
- Tratamento de erros por HTTP status (fallbacks da seção 11)
- `POST /api/orcamentos/:id/reenviar` para orçamentos com status=erro

---

### Fase 6 — Lista de Orçamentos e Perfis (sem bloqueantes)

**Objetivo:** listagem de orçamentos, filtros, visualização de detalhe, política de desconto completa.
**Critério:** listagem paginada com filtros funciona; modal de gerente bloqueia desconto acima do limite.

**Entregáveis:**
- Tela `/orcamentos`: tabela paginada (20 itens), filtros por status, busca por cliente
- Tela `/orcamentos/:id`: visualização readonly com status badge
- Botão "Reenviar" funcional em orçamentos com status=erro
- Modal de senha de gerente (ModalSenhaGerente) com .input-shake
- Registro em log_acoes de aprovações de desconto
- Tela `/admin/usuarios`: CRUD de usuários
- Tela `/admin/configuracoes`: edição de desconto_max_vendedor_pct e desconto_max_admin_pct
- Tela `/admin/log-acoes`: listagem paginada

---

### Fase 7 — Motor de Cortina (bloqueada por BLOQUEANTE-02 e BLOQUEANTE-04)

**Objetivo:** motor de cálculo de cortinas com formulário de camadas dinâmicas.
**Critério:** cálculos de cortina batem com lógica validada pelas vendedores durante levantamento.

**Pré-requisitos:** BLOQUEANTE-02 resolvido (regras formalizadas); BLOQUEANTE-04 resolvido (confirmar cód. 24).

**Entregáveis:**
- `calc/cortina.ts`: implementar PLACEHOLDER-04 (fórmulas de cortina)
- Formulário cortina completo com camadas dinâmicas (Seção 8, Etapa 2B)
- Integração de escrita ao GestãoClick (mesmo padrão Fase 5)
- Testes unitários do motor de cortina

---

### Fase 8 — Homologação e Go-Live

**Objetivo:** validação completa com Victor e vendedores; handover formal.
**Critério:** zero erros críticos de cálculo; Victor e ao menos um vendedor confirmam usabilidade.

**Entregáveis:**
- Testes Victor: 10 orçamentos persiana (plataforma vs. DecorSoft)
- Testes vendedores: 2 dias de uso real em paralelo ao DecorSoft
- Ajustes finos de UX com base nos feedbacks
- Guia operacional entregue
- Handover: acessos, repositório, documentação técnica
- DecorSoft pode ser cancelado após confirmação de Victor

---

## 14. ESTRATÉGIA DE TESTES

### Unitários (Vitest) — Motor de Cálculo

Cobertura obrigatória: 100% das funções em `calc/`. Nenhum orçamento vai para homologação sem testes verdes.

| Módulo | Casos mínimos |
|--------|--------------|
| `arredondamento.ts` | roundHalfUp(1.225), roundHalfUp(1.224), roundHalfUp(2.5) |
| `persiana.ts` — por tipo | Fórmula venda correta; fórmula produção correta; margem de altura correta; Screen usa [Largura]; Double Vision usa altura×2 |
| `persiana.ts` — RN-01 | Largura > dimensao_m → lança erro com lista de alternativos |
| `componentes.ts` | Componentes fixos por tipo; condicionais por acionamento+cor+largura; base+tampa por família; Double Vision usa componentes corretos |
| `arredondamento.ts` | Valores monetários: ROUND_HALF_UP consistente com exemplos do DecorSoft |

**Estrutura de teste esperada:**

```typescript
// calc/persiana.test.ts
describe('Rolo Blackout', () => {
  it('qtd_venda: [Dimensão]×([Altura]+0.15)', () => {
    const r = calcularPersiana({ tipo: 'persiana_rolo_blackout', largura: 1.50, altura: 2.00, dimensao: 2.00 });
    expect(r.qtd_venda).toBe(roundHalfUp(2.00 * (2.00 + 0.15)));   // 4.30
  });
  it('largura > dimensao → lança RN01Error', () => {
    expect(() => calcularPersiana({ largura: 2.20, dimensao: 2.00, ... })).toThrow('RN01_LARGURA_EXCEDIDA');
  });
});

describe('Rolo Screen', () => {
  it('qtd_venda: [Largura]×([Altura]+0.15)×1.3', () => {
    const r = calcularPersiana({ tipo: 'persiana_rolo_screen', largura: 1.50, altura: 2.00, dimensao: 2.00 });
    expect(r.qtd_venda).toBe(roundHalfUp(1.50 * (2.00 + 0.15) * 1.3)); // 4.19
  });
});
// ... demais tipos e casos
```

### Integração (Vitest + axios-mock-adapter)

| Módulo | Casos mínimos |
|--------|--------------|
| `gc/client.ts` | p-queue respeita 3 req/s; 429 não propaga para o caller |
| `gc/produtos.ts` | POST monta payload correto (codigo_interno, nome descritivo, valor_custo, valor_venda) |
| `gc/orcamentos.ts` | POST monta payload correto (tipo, codigo timestamp, cliente_id, situacao_id, produto) |
| Fallback 5xx | Orçamento salvo com status='erro'; gc_orcamento_id null |
| Fallback 401 | Exceção propagada com tipo específico para banner global |

### Aceite Manual — Homologação Victor

| Cenário | Critério |
|---------|---------|
| 10 orçamentos persiana | Valor plataforma = valor DecorSoft (mesmo input) |
| Persiana com largura excedente | Sistema bloqueia com chips de alternativos |
| Orçamento criado na plataforma | Aparece no GestãoClick com valor exato, vinculado ao cliente |
| Desconto com aprovação de gerente | Modal funciona; registro no log_acoes |
| GestãoClick offline | Banner de aviso; botão Enviar disabled; sem dados perdidos |

### Aceite Manual — Homologação Vendedores (2 dias)

| Área | Critério |
|------|---------|
| Fluxo principal | Vendedor cria orçamento sem ajuda externa |
| Terminologia | Campos reconhecidos sem treinamento extenso |
| Velocidade | Orçamento enviado em menos tempo do que no DecorSoft |
| Erros | Nenhum erro de cálculo reportado durante os 2 dias |

---

## 15. CRITÉRIOS DE ACEITE

### Autenticação
- [ ] Login com credenciais válidas cria sessão e redireciona para /orcamentos
- [ ] Login com credenciais inválidas exibe mensagem de erro sem revelar qual campo está errado
- [ ] Sessão expira em 8h; próxima requisição redireciona para /login com mensagem "Sua sessão expirou"
- [ ] Rota /admin inacessível para perfil vendedor (resposta 403)

### Motor de Persiana
- [ ] Todos os 7 tipos calculam valor_bruto corretamente conforme tabela RN-02
- [ ] Tipos Screen usam [Largura] na fórmula de venda (não [Dimensão])
- [ ] Double Vision aplica altura×2 antes da margem +0,15m
- [ ] Base e Tampa calculados conforme RN-07; Double Vision usa componentes corretos
- [ ] Componentes fixos presentes em todos os tipos (RN-05)
- [ ] Componentes condicionais selecionados corretamente por acionamento+cor+largura
- [ ] TC auto-preenchido como Altura×0,70 ao digitar Altura; campo editável
- [ ] Largura > dimensao_m → campo em erro + chips de alternativos (RN-01)
- [ ] Todos os cálculos passam em 100% dos testes Vitest antes da homologação

### Integração GestãoClick
- [ ] Tecidos carregados do GestãoClick com nome, dimensão e preço
- [ ] Busca de cliente funciona com debounce de 300ms
- [ ] POST /api/produtos cria produto no GestãoClick com codigo_interno "PERSIA-{timestamp}"
- [ ] POST /api/orcamentos cria orçamento vinculado ao cliente com valor exato
- [ ] Orçamento aparece no GestãoClick imediatamente após confirmação
- [ ] GC retorna 429: spinner silencioso, sem mensagem de erro visível
- [ ] GC retorna 5xx: status='erro', badge-error, botão "Reenviar" visível
- [ ] GC retorna 401: banner global persistente no topo; todos os botões Enviar disabled
- [ ] "Reenviar" funciona: novo POST ao GC com dados salvos, atualiza status

### Perfis e Desconto
- [ ] Vendedor não consegue alterar valor_bruto calculado (campo readOnly + tabIndex=-1)
- [ ] Desconto dentro do limite: aplicado diretamente sem modal
- [ ] Desconto acima do limite: modal de gerente obrigatório; .input-shake em senha incorreta
- [ ] Aprovação de desconto registrada em log_acoes com usuario_id do admin
- [ ] Admin vê todos os orçamentos na listagem; vendedor vê apenas os próprios

### Design e UX
- [ ] Indicador GC sempre visível no header; verde pulsante = online, vermelho = offline
- [ ] Painel de resultado sticky à direita no desktop; abaixo no mobile/tablet
- [ ] Valores calculados exibidos com JetBrains Mono, 2 casas decimais, formato pt-BR
- [ ] Tailwind: nenhuma classe dinâmica via template string (purge verificado no build)
- [ ] Skeleton loader exibido enquanto tabela ou selects carregam

---

## 16. COMPORTAMENTOS DE ERRO

| Gatilho | Componente UI | Mensagem | Recuperação |
|---------|--------------|---------|-------------|
| GC retorna 429 | Spinner silencioso | (nenhuma mensagem) | p-queue faz retry automático |
| GC retorna 401 | Banner global erro (topo, persistente) | "Credenciais GestãoClick inválidas. Contate o administrador." | Admin atualiza GESTAOCLICK_ACCESS_TOKEN no Railway |
| GC retorna 400 | toast-error | "Erro ao criar orçamento: {mensagem_gc}" | Vendedor tenta reenviar após verificar dados |
| GC retorna 5xx ou timeout | toast-error + badge-error | "GestãoClick indisponível. Orçamento salvo como 'erro'." | Botão "Reenviar" na listagem |
| GC offline (health check) | Banner warning + botões Enviar disabled | "GestãoClick indisponível. Envios bloqueados." | Automático quando GC volta |
| Largura > largura_max do tecido | field-alert (error) + chips | "Este tecido suporta até {X}m. Tecidos compatíveis:" | Vendedor seleciona tecido alternativo |
| Campo obrigatório vazio | input-error + helper-error | "Campo obrigatório" | Vendedor preenche o campo |
| Desconto acima do limite | modal-gerente | (modal) "Desconto acima do limite. Informe a senha do gerente." | Gerente insere senha correta |
| Senha gerente incorreta | input-shake + helper-error (no modal) | "Senha incorreta. Tente novamente." | Nova tentativa |
| Sessão expirada | Redirect /login | "Sua sessão expirou. Faça login novamente." | Login novamente |
| gc_usuario_id null | alert-warning (no formulário) | "Seu usuário não está vinculado ao GestãoClick. O orçamento será atribuído ao usuário master." | Admin preenche gc_usuario_id via /admin/usuarios |
| Tecidos não carregados (GC offline ao abrir form) | alert-warning no select | "Não foi possível carregar os tecidos. Tente novamente." | Botão "Tentar novamente" |

---

## 17. RESTRIÇÕES TÉCNICAS

| Restrição | Valor | Justificativa |
|-----------|-------|--------------|
| Rate limit GestãoClick | 3 req/s; 30.000 req/dia | Limite da API por empresa |
| Paginação GET GestãoClick | máx. 100 registros/página | Limite da API |
| Timeout GestãoClick | 10s | Acima disso trata como 5xx |
| Sessão | 8h (28.800.000ms) | Cobre expediente completo; expira à noite |
| Session store | connect-pg-simple (PostgreSQL) | In-memory inaceitável em produção: restart Railway derruba sessões |
| Valores monetários | DECIMAL(10,2) no banco; nunca float | Evitar erro de ponto flutuante em operações financeiras |
| Larguras/alturas | DECIMAL(6,2) em metros | Padrão do domínio |
| Arredondamento | ROUND_HALF_UP, 2 casas | Consistência com DecorSoft; critério contratual de valor exato |
| Classes Tailwind | Nunca via template string | Purge remove classes não literais; causa bugs silenciosos em produção |
| Campos calculados | readOnly + tabIndex=-1 (exceto TC) | Vendedor não edita valor calculado; TC tem exceção por regra de negócio |
| Largura máxima formulário | 640px (--form-max do DS) | Manter legibilidade e densidade |
| Credenciais GC | Nunca no frontend; somente env vars do backend | Segurança: tokens não expostos ao browser |
| Build Railway | `npm ci → prisma migrate deploy → build → start` | Ordem obrigatória: migration antes de start |

---

## 18. GLOSSÁRIO

| Termo | Definição |
|-------|-----------|
| `[Largura]` | Largura real da persiana solicitada pelo cliente (metros). Entrada do usuário. Usada na fórmula de produção e na fórmula de venda dos tipos Screen. |
| `[Dimensão]` | Largura do rolo/bobina do tecido (metros). Lida do cadastro do produto no GestãoClick. Usada na fórmula de venda dos tipos Blackout, Translúcido e Double Vision. |
| `[Altura]` | Altura da persiana (metros). Entrada do usuário. |
| TC | Tamanho do Comando. Comprimento do acionamento por corrente. Padrão: `Altura × 0,70`. Campo editável pelo vendedor. |
| Qtd Venda | Resultado da fórmula de venda em m². Determina o valor cobrado ao cliente. |
| Qtd Produção | Resultado da fórmula de produção em m². Representa o consumo real de tecido. |
| Persiana Rolo | Persiana enrolável (Blackout, Screen, Translúcido, Double Vision). Margem de altura: +0,15m. |
| Persiana Romana | Persiana com pregas horizontais (Blackout, Screen, Translúcido). Margem de altura: +0,08m. |
| Double Vision | Persiana rolo com camada dupla de tecido. Altura dobrada na fórmula. Usa BASE DOUBLE VISION (não BASE CÔNICA). |
| Tipo Screen | Rolo Screen (2592) e Romana Screen (2612). Cobram [Largura] + multiplicador, não [Dimensão]. |
| Guarda-chuva | Produto no GestãoClick com preço placeholder (R$1/m²). O preço real vem do tecido. |
| Componentes fixos | Incluídos em todo pedido: fita dupla face, fita colante, embalagem, mão de obra, parafuso e bucha. |
| Componentes condicionais | Selecionados por acionamento + cor + largura: presilhas, tampas, bandô, corrente, tubo, motor. |
| BASE CÔNICA | Componente de base/tampa para tipos Rolo e Romana convencionais. Fórmula rolo: `[Largura]-0,025`; romana: `[Largura]`. |
| BASE DOUBLE VISION | Componente de base/tampa exclusivo do Double Vision. Fórmula: `[Largura]-0,025`. |
| Rolamento | Direção de enrolamento (Dianteiro/Traseiro). Campo descritivo para etiqueta. |
| Mesmo Ambiente | Flag indicando que peças do pedido devem usar tecido do mesmo lote. Campo descritivo. |
| Orçamento prévio | Orçamento baseado em medida aproximada do cliente. Situação GC: "em aberto". |
| Orçamento final | Orçamento baseado nas medidas reais do motorista. Substitui ou complementa o prévio. |
| Sob medida | Tabela de preço com mão de obra embutida como percentual do tecido. |
| Handover | Entrega formal da plataforma: acessos, repositório, documentação, transferência de responsabilidade. |
| GestãoClick | ERP principal da Rainha das Cortinas (orçamentos, vendas, estoque, financeiro, fiscal). |
| DecorSoft | Calculadora atual de persianas. Cancelada após virada operacional (Marco 04). |
| ROUND_HALF_UP | Arredondamento onde 0,5 arredonda para cima. Ex: 1,225 → 1,23; 1,224 → 1,22. |
| p-queue | Biblioteca de fila de tarefas assíncronas. Usada para respeitar o limite de 3 req/s do GestãoClick. |
| connect-pg-simple | Session store para express-session usando PostgreSQL. Persiste sessões entre restarts do processo. |
| ~~BLOQUEANTE-01~~ | ~~Credenciais API GestãoClick.~~ RESOLVIDO em 11/06/2026. Credenciais obtidas; gc_loja_id SP=8274, SBC=8284 preenchidos. |
| BLOQUEANTE-02 | Regras de cálculo de cortina. Levantamento com vendedores pendente. |
| PLACEHOLDER | Campo com valor temporário que precisa ser atualizado após desbloqueio de dependência externa. |

---

*SRD gerado pela Stratos Lab com base em: documentacao_projeto_persia_v.3.md (v1.2, 11/06/2026), especificacoes_tecnicas_projeto_persia_para_srd.md, api_documentation_gestao_click_projeto_persia.md e design_system_projeto_persia_v.4.md.*
*Executor: Claude Code (Anthropic CLI)*
*Uso interno — Stratos Lab (PH Figueiredo + Antonio Figueiredo)*
