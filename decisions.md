# Decisões do Projeto Pérsia — Registro (ADR)

Decisões técnicas e de produto tomadas durante o desenvolvimento, com o raciocínio
por trás de cada uma. Fonte de verdade do produto continua o SRD; este documento
registra as escolhas feitas na execução e os pontos onde divergimos do SRD (e por quê).

Sessões: 11–15/06/2026 · Stratos Lab · Executor: Claude Code (Opus 4.8)
Legenda de status: ✅ implementado · ⏳ aguardando terceiro (Victor/GestãoClick) · ⚠️ a confirmar

---

## 1. Infraestrutura e ambiente (Fase 1)

### 1.1 ✅ PostgreSQL local via `embedded-postgres` (apenas dev)
- **Decisão:** usar o pacote `embedded-postgres` (devDependency) para subir um PostgreSQL local na porta 5433 em desenvolvimento (`npm run db:local`).
- **Razão:** a máquina de dev não tem PostgreSQL, Docker nem Homebrew instalados. Sem um banco, não dá para rodar migrations, seed nem bootar a API de forma verificável. Produção continua usando o PostgreSQL gerenciado do Railway via `DATABASE_URL` — o script local não roda em produção.
- **Nota:** local roda PG18, produção PG16; o schema usa só recursos padrão (uuid, decimal, enum, jsonb, timestamptz, gen_random_uuid), então é compatível.

### 1.2 ✅ `bcryptjs` em vez de `bcrypt`
- **Decisão:** usar `bcryptjs` (JS puro) no lugar do `bcrypt` nativo citado no SRD §6.
- **Razão:** evita dependência de toolchain de compilação nativa (sem garantia de build tools no ambiente de dev/CI). API idêntica (`hashSync`/`compareSync`).

### 1.3 ⚠️ Node 24 em vez de Node 20
- **Decisão:** rodar em Node 24 (local e Railway), apesar de o SRD pedir Node 20.
- **Razão:** é a versão instalada localmente e a que o Nixpacks do Railway escolheu (porque `engines.node` ficou `">=20"`). A aplicação funciona normalmente em 24.
- **Pendência:** se quiser cravar Node 20, mudar `engines.node` para `"20.x"` ou definir `NIXPACKS_NODE_VERSION=20`. Não é urgente.

### 1.4 ✅ Monorepo com npm workspaces; backend CommonJS, frontend ESM
- **Decisão:** `apps/api` em CommonJS (tsconfig `module: CommonJS`); `apps/web` em ESM (Vite).
- **Razão:** CommonJS no backend reduz atrito de interoperabilidade com bibliotecas como `connect-pg-simple`/`express-session`. O frontend usa o padrão moderno do Vite.

### 1.5 ✅ `.env` na raiz do monorepo (gotcha registrado)
- **Decisão:** manter um único `.env` na raiz.
- **Razão/gotcha:** o Prisma CLI roda em `apps/api` e NÃO enxerga o `.env` da raiz automaticamente. Por isso, ao rodar `prisma migrate`/`db seed` manualmente, passamos `DATABASE_URL` inline. Em runtime, `config/env.ts` localiza o `.env` da raiz.

### 1.6 ✅ Frontend: tsconfig sem project references compostas
- **Decisão:** build do web = `tsc --noEmit && vite build` (sem `tsc -b`/`tsconfig.node.json` composto).
- **Razão:** o `tsc -b` com `composite` emitia artefatos `.js`/`.d.ts` na árvore de fontes (TS6310 + poluição). `--noEmit` faz só o type-check; o Vite cuida do bundle.

---

## 2. Motor de cálculo de persiana (Fase 3)

### 2.1 ✅ `valor_bruto` = Qtd Venda × Preço do Tecido (só tecido)
- **Decisão:** o valor do orçamento é calculado apenas a partir do tecido (RN-03). Os componentes (fixos, condicionais, base/tampa) compõem a **lista técnica/OS**, mas NÃO entram no preço cobrado ao cliente.
- **Razão:** confirmado pela planilha de simulação validada e pela aba "Regras_de_Negocio" do DecorSoft: o tecido é a linha que define o valor (preço/m² com mão de obra embutida na tabela), e a persiana é um produto "guarda-chuva" com preço placeholder de R$1/m². O critério contratual é "o que sai da calculadora é o que está no GestãoClick", e isso se baseia no tecido.

### 2.2 ⚠️ Componentes fixos (fitas) em metros — divergência vs SRD §RN-05
- **Decisão:** fita dupla face e fita colante são calculadas **em metros** (rolo: `[Largura]-0.02` / `[Largura]-0.03`; romana: `[Largura]`), conforme a extração real do DecorSoft (aba 06).
- **Razão:** o SRD §RN-05 simplificava para "1 un", mas a instrução explícita foi usar os valores corretos da planilha `base_3`. Como componentes não afetam o `valor_bruto`, isso impacta só a lista técnica.
- **Pendência:** validar com o Victor na homologação.

### 2.3 ✅ TC (Tamanho do Comando) = 75% da altura
- **Decisão:** TC padrão = `roundHalfUp(Altura × 0.75)` (TC_FATOR), campo editável (RN-04).
- **Razão:** Victor confirmou **75%** em 17/06/2026 (era 70% pela extração do DecorSoft; a documentação do projeto já citava 75%).

### 2.4 ✅ 256 regras condicionais geradas da planilha (não escritas à mão)
- **Decisão:** `componentes.data.ts` é gerado a partir da aba `07_Persiana_Comp_Custom` (256 regras) via script Python.
- **Razão:** precisão e fidelidade ao DecorSoft; transcrever 256 regras à mão seria propenso a erro. A seleção em runtime filtra por tipo + faixa (largura/altura) + cor + acionamento.

### 2.5 ✅ Avaliador de fórmulas próprio (sem `eval`)
- **Decisão:** `calc/formula.ts` avalia expressões como `[Largura]/0.5*[Altura]` com parser/validação por regex, sem `eval`/`Function`.
- **Razão:** segurança (nunca executar string arbitrária) e determinismo.

### 2.6 ✅ Cobertura de testes 100% no motor de cálculo
- **Decisão:** Vitest com 100% de cobertura em `services/calc/` (44 testes).
- **Razão:** o motor é o núcleo crítico; o SRD §14 exige 100%. Ramos defensivos foram cobertos ou simplificados para serem alcançáveis.

---

## 3. Integração GestãoClick (Fases 4 e 5)

### 3.1 ✅ Cliente HTTP: axios + p-queue via `import()` dinâmico
- **Decisão:** `gc/client.ts` usa axios + p-queue (3 req/s). O p-queue (ESM-only) é carregado por `import()` dinâmico protegido por `new Function(...)`.
- **Razão:** o `tsc` em CommonJS converteria `import()` em `require()`, que quebra ao carregar um módulo ESM. O `Function` evita essa conversão e funciona em dev (tsx) e build (CJS).

### 3.2 ✅ Tabela de preço por contexto (corrigido após Victor)
- **Decisão:** **persiana usa VAREJO (10969)**; **cortina usará SOB MEDIDA (230813) só no tecido e VAREJO nos demais componentes**. Implementado via `precoByTier(produto, tier)`.
- **Razão:** inicialmente assumimos SOB MEDIDA (por ter mão de obra embutida), mas o Victor confirmou que persiana é Varejo. O valor caiu de ~R$95 para ~R$40/m² no exemplo.

### 3.3 ✅ Dimensão do rolo: campo extra/atributo "LARGURA" (ATUALIZADO 12/06/2026)
- **Decisão:** ler a largura do rolo do **campo extra/atributo "LARGURA"** do produto (array `atributos[]` da API). Ordem: **atributo LARGURA → campo nativo `largura` → metragem no nome** (`dimensaoDoProduto`, commit d9ca642).
- **Razão:** verificado no GC que o campo nativo `largura` vem **vazio em 100%**; o Victor cadastra a largura num **campo customizado "LARGURA"** (o GC não tem campo nativo para isso). Sem ler o atributo, o trabalho dele era ignorado e os tecidos não apareciam.
- **Impacto:** tecidos de persiana com largura subiram de 59 → 98. Vale também para a cortina (mesmo campo).

### 3.4 ✅ Categorias de tecido por tipo de produto (ATUALIZADO 15/06/2026)
- **Decisão:** **persiana** lê o grupo **"TECIDOS PARA PERSIANA" (235486)**; **cortina** lê o grupo PAI **"TECIDOS PARA CORTINA" (5913111)** — **não** o 76944 (que estava como suposição inicial). O filtro `grupo_id` já inclui os **descendentes**.
- **Razão:** o Victor reorganizou: a persiana ganhou subgrupos por tipo (BLACKOUT/TELA SOLAR/TRANSLÚCIDO/DOUBLE VISION/PERSIANA FD) e a cortina tem a árvore "TECIDOS PARA CORTINA" (com "BOOKS TEXHAUS" etc.). Ele confirmou: usar o grupo pai, que pega todos. Sem filtro por trama (o vendedor escolhe).

### 3.5 ✅ Valor exato no GestãoClick + recálculo no servidor (multi-itens)
- **Decisão:** cada **item** (janela) vira um produto sintético no GC e uma **linha** no orçamento (quantidade 1 × `valor_final` do item); a soma das linhas = total exato. O servidor **recalcula** tudo a partir dos inputs (não confia em valores do cliente).
- **Razão:** RN-10 ("nenhuma transformação adicional entre cálculo e envio") e segurança. (Antes era linha única; virou N linhas com o multi-itens — ver §10.1.)

### 3.6 ✅ Limpeza de produto órfão em falha
- **Decisão:** se o POST do produto der certo mas o POST do orçamento falhar, o produto recém-criado é deletado (best-effort).
- **Razão:** não deixar produtos órfãos poluindo o GestãoClick.

### 3.7 ✅ Atribuição de vendedor sem 1 login por vendedora (após Victor)
- **Decisão:** todos os orçamentos saem por um **usuário de integração** (login), e a vendedora real vai no campo **`vendedor_id`** do orçamento (cadastro de **Funcionários**, ilimitado). O vínculo de vendedor **não bloqueia** o envio.
- **Razão:** o GestãoClick limita/cobra por usuário de login, mas o cadastro de vendedores (funcionários) é ilimitado e é o campo nativo de atribuição no orçamento. A plataforma também registra internamente quem criou cada orçamento.
- **Pendência:** Victor vincular cada vendedora ao seu id de funcionário (Admin → Usuários, campo "Vendedor GC"); opcional definir `GC_USUARIO_INTEGRACAO_ID`.

### 3.8 ✅ Situação "Em aberto" (92112) nos orçamentos
- **Decisão:** orçamentos criados com `situacao_id = 92112` ("Em aberto").
- **Razão:** o campo `tipo_lancamento` vem nulo na API; usamos a situação pelo nome/id verificado.

### 3.9 🔒 NUNCA escrever na base de produção do GestãoClick em dev/teste
- **Decisão:** durante desenvolvimento, só leituras (GET) na API do GestãoClick. Fluxos de escrita são validados por testes mockados.
- **Razão:** instrução explícita do usuário — o GestãoClick está em produção real; dados de teste poluem o ambiente das vendedoras. O único orçamento de teste criado (gc_id 376773632) foi removido em cascata ao deletar o cliente de teste.

---

## 4. Autenticação, perfis e desconto (Fases 2 e 6)

### 4.1 ✅ Sessão server-side em PostgreSQL (connect-pg-simple)
- **Decisão:** `express-session` (8h) + `connect-pg-simple`, com a tabela `session` criada automaticamente.
- **Razão:** o Railway reinicia o processo; sessões in-memory derrubariam as vendedoras no meio do expediente. JWT foi descartado (interna, sem mobile).

### 4.2 ✅ 401 de regra de negócio não desloga o usuário (bug corrigido)
- **Decisão:** o cliente HTTP do frontend só dispara logout global em `401` com código `NAO_AUTENTICADO` (sessão). Outros 401 (ex.: `SENHA_GERENTE_INVALIDA`, credenciais de login) são tratados localmente.
- **Razão:** sem isso, errar a senha do gerente no modal de desconto deslogava o usuário e jogava para a tela de login.

### 4.3 ❌ Desconto — FEATURE REMOVIDA por completo em 17/06/2026
- **Decisão:** a calculadora **não tem mais desconto** (Victor: "já tem no GestãoClick; pode remover isso de desconto"). O vendedor envia o **valor cheio** ao GestãoClick e o desconto é decidido lá. Removidos: campo de desconto no resultado, limite por perfil, modal de senha de gerente (RN-08), log `desconto_aprovado`, `aplicarDesconto`, a tela admin **Configurações** (e suas rotas/endpoints), `desconto_max_pct` da sessão/usuário e da UI de Usuários.
- **Banco:** colunas `Usuario.desconto_max_pct` e tabela `Configuracao` mantidas (sem migração; viram vestígio). `Orcamento.desconto_pct` grava sempre 0 e `valor_final` = `valor_bruto`.
- **Mantido:** o tratamento de 401 de negócio que não desloga (§4.2).

---

## 5. Deploy, CI/CD e operação

### 5.1 ✅ Provisionamento Railway via GraphQL + project token
- **Decisão:** projeto, Postgres e serviço criados via API GraphQL do Railway; deploys via CLI com um **project token** (`RAILWAY_TOKEN`).
- **Razão:** a CLI do Railway rejeita o token de **workspace** (valida via `me`, que tokens de time não têm). A API GraphQL aceita; e o project token funciona para `up`/`variables`.

### 5.2 ✅ `buildCommand` = `npm run build` (sem `npm ci`)
- **Decisão:** o build do Railway roda só `npm run build`.
- **Razão:** incluir `npm ci` no buildCommand dava `EBUSY` por conflito com o cache mount do Nixpacks em `node_modules/.cache` (o Nixpacks já instala numa fase anterior).

### 5.3 ✅ `NIXPACKS_INSTALL_CMD = npm ci --include=dev` (correção crítica)
- **Decisão:** forçar a instalação das devDependencies no build do Railway.
- **Razão:** como existe `NODE_ENV=production`, o `npm ci` do Nixpacks **omitia as devDependencies** (typescript, @types/node, vite) → build falhava com `TS2688: Cannot find type definition file for 'node'`. O deploy manual via `railway up` mascarava isso (subia o `node_modules` local). Diagnóstico confirmou: só 166 pacotes instalados e `node_modules/@types` vazio. Também adicionamos `@types/node` na raiz por determinismo.

### 5.4 ✅ App Node único serve o frontend estático em produção
- **Decisão:** em produção, o Express serve `apps/web/dist` (SPA fallback); em dev, o Vite (5173) com proxy `/api`.
- **Razão:** arquitetura "App Node único + PostgreSQL" do SRD; evita um segundo serviço.

### 5.5 ✅ `/api/health` expõe o commit do deploy
- **Decisão:** `/api/health` retorna `RAILWAY_GIT_COMMIT_SHA`.
- **Razão:** permite verificar objetivamente que um `git push` foi publicado (a variável só é preenchida em deploys vindos do GitHub). Foi a forma de confirmar o auto-deploy de ponta a ponta.

### 5.6 ✅ Auto-deploy via GitHub (push na main)
- **Decisão:** repositório privado `rainhadascortinas/persia` conectado ao serviço; `git push` na `main` dispara build + deploy automático.
- **Razão:** versionamento, backup, histórico e rollback; era o previsto no SRD ("deploy via git push"). `railway up` permanece como fallback.

### 5.7 ✅ Seed de produção via URL pública do Postgres
- **Decisão:** rodar `prisma migrate deploy` + `db seed` apontando para a `DATABASE_PUBLIC_URL` do Postgres do Railway.
- **Razão:** o host interno (`*.railway.internal`) não é acessível de fora; a URL pública (proxy TCP) permite rodar o seed da máquina de dev.

### 5.8 ✅ Segredos nunca versionados
- **Decisão:** `.env` no `.gitignore`; tokens do GestãoClick e `SESSION_SECRET` só no backend/variáveis do Railway; tokens de GitHub/Railway usados inline (nunca gravados no `.git/config`).
- **Razão:** segurança; os tokens de deploy podem ser revogados após o uso.

---

## 6. Pendências que dependem do Victor (não são decisões nossas)

- **(Resolvido 16–17/06)** Cortina — modelos fechados (ver §9.5) e **envio ao GC implementado** (BLOQUEANTE-06, ver §9.7). **Resta só** confirmar o fator do Wave (3 m → 8,10 m, BLOQUEANTE-05 — Victor medindo mais larguras).
- **Vincular cada vendedora** ao id de funcionário do GC (via Admin → Usuários).
- **(Resolvido 17/06)** Desconto: **feature removida** da calculadora (fica 100% no GC). TC = **75%**. Fita = **2× a largura** (Victor) — o modelo atual já soma ~2× a largura no total; conferir na homologação (fita é só lista técnica/OS, não entra no preço).
- **Homologação:** ~10 orçamentos plataforma × DecorSoft.
- **(Resolvido)** Largura dos tecidos: Victor cadastrou no campo customizado "LARGURA" e a calc já lê (§3.3). WAVE FÁCIL ≠ WAVE (BLOQUEANTE-04).

---

## 7. Estado atual (18/06/2026 — entrada em homologação)

- **Em produção** (Railway, auto-deploy do `main`; commit atual via `/api/health`): https://persia-api-production.up.railway.app
  - **Persiana** completa (multi-itens, **cálculo em tempo real**, largura via atributo, TC 75%, **sem desconto**, validação de obrigatórios), envio ao GC.
  - **Cortina** completa: modelo "+" (vários ambientes + 1–3 camadas), seletor de acessório por grupo (preço VAREJO do GC), instalação como serviço, **envio ao GestãoClick** (1 produto sintético por cortina + 1 linha de serviço, `tipo:'ambos'`), **salvar como rascunho**, **editar rascunho reabrindo a calculadora inteira** (`entrada_json` + `editar_id`) e **detalhe do orçamento com camadas + acessórios**. Servidor recalcula tudo. **65 testes.**
  - Login "Usuário" + senha provisória, seletor de vendedor (funcionários **ativos** do GC), busca de tecido, admin com CRUD/excluir usuário. Auto-deploy GitHub→Railway OK.
  - **UX:** confirmação antes de enviar ao GC; modais 100% in-app (sem pop-up do navegador); **guarda de navegação** + **autosave local** (recupera orçamento não salvo ao reabrir o navegador); títulos das telas em negrito; marca da navbar clicável → Orçamentos; cache do GC reduzido a 1 min.
- **Validação (18/06):** teste controlado de escrita da cortina OK (R$ 790, confirmado e apagado). **Replicação de 2 orçamentos reais do GC** (ver §10.15): ILHÓS bate ~0,7%; WAVE e varão a revisar.
- **DEPLOYADO em produção em 19/06/2026 (commit `8075579`):** subiu tudo o que estava local — Módulo de Regras de Cálculo (§11), correções da 1ª onda (§10.16), auditoria de segurança (§12), upgrade de deps (§12.1) e 2ª onda de homologação (§13, tecidos por tipo + varão por camada + trilho 1×). Anterior em produção era `72f6245`. As seções abaixo marcadas como "LOCAL, não deployado" referem-se ao estado ANTES deste deploy — a partir de 19/06 estão em produção. **Pendências pós-deploy:** teste do nº sequencial (PH faz 1 envio controlado no GC) e calibração fina dos valores (aguardando exemplos do Victor).
- **Pendências:** fator do Wave (BLOQUEANTE-05); achados da validação §10.15 (varão por barra, qtd ilhós, acessórios wave); **homologação pelo Victor** (Fase 8); conferir fita 2× largura (OS).

---

## 8. Autenticação e identidade do usuário (atualização 12/06/2026)

### 8.1 ✅ Vínculo vendedor ↔ GestãoClick por seletor de nome
- **Decisão:** no cadastro de usuário (Admin → Usuários), o campo "Vendedor (GestãoClick)" virou um **`<select>` com os nomes dos funcionários ativos do GC** (`GET /api/admin/funcionarios-gc`); ao escolher o nome, o `gc_usuario_id` é gravado automaticamente. Fallback para campo de texto se o GC estiver offline; vínculo a funcionário inativo/fora da lista é preservado ao editar.
- **Razão:** o admin não precisa descobrir o ID interno do GC (não é óbvio na UI do GestãoClick). Reduz erro e facilita o handover. Substituiu a abordagem anterior (planilha de IDs enviada ao Victor — descartada).

### 8.2 ✅ Login é "Usuário", não e-mail
- **Decisão:** o campo de login passou de "E-mail" para **"Usuário"**, aceitando qualquer texto (mín. 3 caracteres); removida a exigência de formato de e-mail (`type="email"` → `text`; `emailValido` → `usuarioValido`). Banco e backend inalterados (coluna `email` permanece como identificador único; `lowerCase().trim()`); logins atuais que são e-mails continuam válidos.
- **Razão:** o sistema **não envia nem valida e-mail real** (sem confirmação/recuperação por e-mail). O campo sempre foi, na prática, só um nome de usuário. Permite logins simples (ex.: `maria.sp`).

### 8.3 ✅ Recuperação de senha: admin + autoatendimento (sem e-mail)
- **Decisão:** **não** implementar autenticação por e-mail (convite/reset por link). Em vez disso:
  - **Admin redefine** a senha em Admin → Usuários (já existia).
  - **Autoatendimento:** usuário logado troca a própria senha em `/trocar-senha` (link "Alterar senha" na navbar) via `POST /api/auth/alterar-senha` (exige senha atual).
  - **Troca obrigatória no 1º acesso:** novo campo `Usuario.senha_provisoria` (migration `20260612040000_add_senha_provisoria`). Admin que **cria** usuário ou **reseta** senha → `senha_provisoria = true`; o usuário é **forçado** à tela de troca antes de acessar o app (`SenhaDefinitivaRoute`); ao trocar, vira `false`. Badge "senha provisória" na lista de usuários.
- **Razão:** para uma ferramenta interna de ~8 usuários, autenticação por e-mail exige provedor de envio (SES/Resend/SMTP), SPF/DKIM, fluxos e templates — custo/manutenção desproporcionais. Admin + autoatendimento + troca no 1º acesso resolve "esqueci a senha" sem nenhuma infraestrutura de e-mail e mantém o "Usuário livre" (8.2).

---

## 9. Cortina (Fase 7) — log de construção (15–17/06/2026)

> **STATUS ATUAL (17/06): cortina COMPLETA e em produção** — calculadora (modelo "+") + **envio ao GestãoClick**. Ver §7 (estado atual) e §9.7 (estrutura). As subseções abaixo (9.1–9.6) são o **histórico** de como o módulo foi construído; algumas frases refletem o estado da data do registro.

Fonte: planilhas "CORTINA SOB MEDIDA" v1→v3 do Victor + áudios do Wave + método de emenda da Cortinas Fênix. Motor em `services/calc/cortina.ts` (`calcularCortina` + `calcularCortinaMultiCamada`), funções puras + testes. Cobre **4 modelos**: Ilhós, Prega (=Americana/Macho/Fêmea), Franzido e Wave. "Argolas" = Franzido no varão; Prega Francesa/Alças = variações de prega (sem fórmula distinta).

### 9.1 Regras confirmadas (modelo Ilhós)
- **Tecido (método normal)** = `largura × franzido` (m lineares). O tecido roda deitado: a largura do rolo vira a altura da cortina. Tabela **SOB MEDIDA**.
- **Método de emenda** (quando `altura + barra > largura do tecido`): emenda tiras verticais. `nº tiras = ceil((largura × franzido) / largura_tecido)`; `metragem = nº tiras × (altura + barra)`. (Ex. Fênix: 3,50×3,00 em tecido 2,80 → 4 tiras × 3,30 = 13,20 m.)
- **Barra consumida na altura** = `0,10 (folga ilhós) + tamanho_barra × (1 simples | 2 dupla)`. Default 0,10 + 0,10×2 = **0,30 m**.
- **Franzido**: frente default 3, trás default 2 — editáveis.
- **3 configurações**: (a) um tecido; (b) forro no mesmo varão → metragem do forro = **igual à frente**; (c) varão duplo → trás usa o **próprio franzido**.
- **Ilhoses** = `ceil(consumo / 0,15)` arredondado **sempre p/ cima** até **par** (0–1 abertura) ou **múltiplo de 4** (≥2 aberturas). [Victor: "43 → 44".]
- **Argolas** (só varão duplo, tecido de trás) = `ceil(largura / 0,10)` (1 a cada 10 cm de varão).
- **Varão** = largura (m); varão duplo = 2 varões. **Ponteiras** = 2 por varão.
- **Suportes**: regra é varão suíço 1/m, varão normal 1/abertura — mas por ora **entrada manual** do vendedor (decisão do Victor para destravar).
- **Preços dos acessórios saem do GestãoClick** (o vendedor escolhe o produto). O motor calcula só **quantidades** + metragem de tecido; preços/valores são aplicados na montagem do orçamento.
- **Validação**: os 3 totais da planilha (R$ 672 / 852 / 847) e o exemplo de emenda batem 100% nos testes.

### 9.2 ✅ Pendências do item 5 — resolvidas pelo Victor (16/06/2026, ver §9.5)
Modelos, trilho/fixação, inversão de tecido e costura fechados pelas respostas do Victor. **Envio ao GestãoClick ✅ implementado** (ver §9.7).

### 9.3 Atualização planilha v.3 — Prega/Franzido + entretela (15/06/2026)
Motor generalizado em `calcularCortina(e)` para 3 modelos: **ilhos**, **prega** (= Americana = Macho = Fêmea) e **franzido**. Regras confirmadas pelo Victor:
- **Entretela (KOS):** modelos com entretela = Ilhós e Prega (Franzido NÃO tem). Qtd = metragem do tecido frente; total = qtd × preço/metro (os "9" na planilha eram erro de célula `#VALUE!`).
- **Folga de topo (altura):** Ilhós 0,10 m · Prega 0,12 m (cabeçote) · Franzido 0,08 m. `barra_consumo = folga_topo + tamanho_barra × (1 simples | 2 dupla)`.
- **Ferragem:** Ilhós → **ilhoses** `ceil(consumo/0,15)`; Prega/Franzido → **argolas** (varão) ou **rodízios/ganchos** (trilho/varão suíço) `ceil(largura/0,10)`. Tudo arredondado p/ cima até par (0–1 abertura) ou múltiplo de 4 (≥2). Varão duplo: ferragem por face (frente + trás).
- **Fixação:** Ilhós só **varão**; Prega/Franzido servem **varão, trilho ou varão suíço**. **Trilho não usa ponteira**; varão/varão suíço usam (2/varão).
- **Validação:** totais batem — Ilhós 1 tecido **685,50** (= 672 + entretela 13,50, confere com a célula F36 da v.3); Prega 1 tecido **676,50**; Franzido 1 tecido **663** (sem entretela). Motor: funções puras + testes (à época 58/58; hoje 65). [UI/rota/GC vieram depois — ver §9.7/§10.2.]

### 9.4 WAVE — tecido medido pelo Victor + acessórios deduzidos (16/06/2026)
Aba "CORTINA WAVE" (serve só trilho/varão suíço). `modelo: 'wave'`:
- **Tecido = `largura × 2,7`** (e = entretela). Victor mediu **trilho 3,00 m → 8,10 m** ⇒ fator **2,7**. Substituiu a metragem antes deduzida da fita (7,95). **TENTATIVO** (BLOQUEANTE-05): Victor vai medir mais larguras p/ confirmar o fator.
- **Botões** (rodízio wave = base click): `N = múltiplo de 4 ≥ (largura/0,05 + 1)`. Ex.: 3 m → 61 → **64**. (Deduzido dos áudios — ainda não confirmado.)
- **Cordão** (m) = `(N−1) × 0,05` = **3,15 m** (bate com a célula R27 da planilha).
- **Terminais** 4; trilho não usa ponteira; varão suíço usa.
- Demais (folga topo 0,12, entretela, emenda, 2 tecidos = mesma qtd) seguem o padrão geral.

### 9.5 Respostas finais do Victor (16/06/2026) — fecha o BLOQUEANTE-02
- **"Argolas" não é modelo novo:** é **Franzido no varão** (o DecorSoft separava). Os 4 modelos cobrem tudo. Idem Prega Francesa/Alças: variações de prega, sem fórmula distinta levantada.
- **Inversão de tecido = método de emenda:** usada em cortinas pequenas ou quando `altura > largura do tecido`. Já é o que o motor faz.
- **Deslizante:** o **tipo** é escolhido pelo usuário; a **quantidade** é calculada automaticamente (é a ferragem do trilho, `ceil(largura/0,10)`).
- **Entretela só na cortina da frente** (confirmado).
- **Tecido fracionado, cortado de 5 em 5 cm** (evita erro de corte): a metragem de tecido agora arredonda p/ cima ao **múltiplo de 0,05 m** (`PASSO_TECIDO`, `arredondaTecido`). Testes: 61/61.
- **Cortinas duplas/triplas:** Victor disse que talvez tenha uma forma mais simples de implementar — **aguardar** antes de fechar o envio ao GC (BLOQUEANTE-06).

### 9.6 Acessórios de cortina no GestãoClick — grupos confirmados (17/06/2026)
Victor agrupou todos os acessórios (verificado via `scripts/verificar-acessorios-cortina.mjs`). Mapa para o envio ao GC (cada acessório calculado → grupo do GC; o **vendedor escolhe o produto** dentro do grupo, pois há variações de cor/medida):

| Acessório (motor) | Grupo GC | grupo_id |
|---|---|---|
| Varão | VARÃO | 5923372 |
| Varão suíço | VARÃO SUIÇO | 5923373 |
| Trilho | TRILHOS | 5923338 |
| Suporte (varão) | SUPORTES PARA VARÃO | 5893619 |
| Suporte (varão suíço) | SUPORTE PARA VARÃO SUIÇO | 5923368 |
| Ilhós | ILHOS | 5894379 |
| Argola | ARGOLAS | 5894205 |
| Rodízio/gancho | RODIZIOS | 5923339 |
| Ponteira | PONTEIRAS | 5900771 |
| Terminal | TERMINAIS VARÃO SUIÇO E TRILHO | 5923367 |
| Entretela | ENTRETELA | 5923710 |
| Wave (cordão/rodízio/base click/fita) | WAVE | 5923711 |
| Tecido (cortina) | TECIDOS PARA CORTINA | 5913111 |
| Instalação | serviço `/api/servicos` "INSTALAÇÃO" (valor digitado pelo vendedor) | — |

Grupo **WAVE** (4 produtos): RODIZIO WAVE 62341215 (0,80) · BASE CLICK WAVE 46835072 (0,76) · CORDÃO WAVE 46835020 (5,24) · FITA WAVE AVULSA 46834988 (9,80). **ENTRETELA**: KOS TNT 10CM 414519 (1,50). Preços = tabela VAREJO. ✅ **Implementado** (modelo "+" + seletor de acessório + envio + teste de escrita) — ver §9.7.

Backend (estágio 1, commit df16718): `gc/acessorios.ts` (mapa acima, leitura por grupo com cache 5 min) + `catalogos.listarServicos()` + `GET /api/calcular/cortina/acessorios`.

### 9.7 Estrutura do orçamento de cortina (modelo "+" do Victor) — decisões 17/06/2026
- **Orçamento = N cortinas (ambientes).** Botão "+ Adicionar cortina" por ambiente/janela.
- **Cada cortina = ambiente (texto) + modelo + fixação + tipo (simples/dupla/tripla) + medidas (L×A) + 1–3 tecidos (camadas, via "+") + seletores de acessório.** Cada camada é calculada como **cortina simples** (Victor: "o sistema calcula sempre uma cortina simples").
- **Camadas (tipo):** simples = 1 camada/varão; dupla = 2 camadas em **varões separados** + suporte do tipo duplo; tripla = 3. **Entretela só na camada da frente.** Varão e ponteiras por camada; **suporte** é 1 escolha por cortina (vendedor pega o produto simples/duplo/triplo), qtd pela largura.
- **Acessórios:** o vendedor **escolhe o produto** de cada grupo (cor/medida); a **quantidade** vem do motor. Preço = VAREJO.
- **Instalação:** **um valor por orçamento** (uma linha de serviço "INSTALAÇÃO" no GC; valor digitado pelo vendedor).
- **Envio ao GC ✅ (implementado, deploy dca818b):** cada cortina vira **1 linha de produto sintético** `MODELO • TECIDO • L×A` (valor = tecidos + acessórios) + **1 linha de serviço** de instalação, no payload `tipo:'ambos'`. O servidor **recalcula tudo** (`orcamentoCortinaController`, POST /orcamentos/cortina). Payload **validado** em teste controlado (orçamento R$ 790 = produto 650 + serviço 140, confirmado no GC e apagado). Backend: `gc/acessorios.ts`, POST /calcular/cortina/completa. Frontend: `CortinaCard` + `CortinaOrcamento`.

---

## 10. Orçamento — multi-itens, rascunho e UX (12–15/06/2026)

### 10.1 ✅ Persiana multi-itens (vários itens por orçamento)
- **Decisão:** o orçamento de persiana aceita **N itens** (janelas). Produto Sob Medida é **único** para o orçamento; cada item tem sua coleção/cor/acionamento/medidas/TC/rolamento/base. Layout compacto (2 linhas por item), com **+ Adicionar item** e **Remover**. `POST /api/calcular/persiana/lote` calcula todos; o envio cria **N produtos + 1 orçamento com N linhas** no GC (desconto por item, soma exata RN-10). Itens persistidos em `Orcamento.itens_json` (snapshot) — migration `20260612060000_orcamento_itens_json`.
- **Razão:** um orçamento real tem várias janelas; espelha o GestãoClick (orçamento com vários produtos).

### 10.2 ✅ Cortina na UI — orçamento completo (modelo "+") + envio ao GC (17/06/2026)
- **Decisão:** a aba **Cortina** do Novo Orçamento é um **orçamento com vários ambientes** (`CortinaOrcamento` + `CortinaCard`): cada cortina tem ambiente, modelo, fixação, medidas, **1–3 tecidos (camadas) via "+"** e **seletor de produto por acessório** (grupo do GC, preço VAREJO), com total por cortina + **instalação** + total geral. Endpoints: `GET /api/calcular/cortina/tecidos`, `GET /api/calcular/cortina/acessorios`, `POST /api/calcular/cortina/completa`; envio em `POST /api/orcamentos/cortina`. **Salvar/Enviar** como na persiana.
- **Substituiu** os antigos `CortinaForm`/`CortinaResultado` (calculadora de 1 cortina, sem envio), removidos. Detalhes da estrutura/envio em §9.7.
- **Razão:** modelo "+" do Victor (várias janelas, camadas por cortina) + "o que sai da calculadora é o que está no GestãoClick".

### 10.3 ✅ Salvar (rascunho) além de Enviar
- **Decisão:** dois botões no resultado da persiana — **Salvar** grava `status='rascunho'` localmente (sem tocar no GC; cliente e aprovação de desconto opcionais), e **Enviar** faz o fluxo ao GestãoClick. Um rascunho pode ser **enviado depois** pela tela de detalhe (`apenas_salvar` no `criarOrcamento`).
- **Razão:** o vendedor pode querer só calcular/guardar sem integrar ao GC naquele momento.

### 10.4 ✅ Cliente no topo (padrão GestãoClick)
- **Decisão:** o seletor de **cliente** subiu para um card no **topo** do Novo Orçamento (após escolher Persiana/Cortina), acima do formulário; o `ResultadoPanel` recebe o cliente por prop. A lista de clientes vem do **GestãoClick em tempo real** (`GET /api/gc/clientes`, debounce 300ms; ~19 mil; sem cópia local). Obrigatório só para **Enviar**.
- **Razão:** segue o fluxo do GestãoClick (cliente primeiro) e fica visível o tempo todo.

### 10.5 ✅ Ajustes de UX
- **Busca de tecido por filtro** (digita → filtra a lista carregada; cada palavra precisa constar no nome) no campo Coleção/Tecido (persiana e cortina), no lugar do `<select>` com a base inteira.
- **Login editável + renomeação:** admin pode editar o "Usuário" (login) no cadastro; contas de homologação renomeadas para `victor.pavoni` / `loja.sp` / `loja.sbc`.
- **Largura/padrões:** resultado, formulário e cards de seleção padronizados na mesma largura (`max-w-form`); campo de **desconto** começa vazio (placeholder "0", sem zero à esquerda).

### 10.6 ✅ Rodada de feedback de testes manuais (17/06/2026)
- **Cálculo em tempo real** (persiana e cortina): sem botão "Calcular"; recalcula com debounce conforme o preenchimento. Painel "Orçamento" fixo à direita, largura cheia, sempre visível.
- **Validação de obrigatórios:** persiana calcula só itens completos; item incompleto **bloqueia** enviar/salvar (não envia mais sem acionamento). Cortina já bloqueia (sem modelo/medidas/tecido/acessório não calcula).
- **Confirmações (ConfirmModal, padrão da app):** cancelar orçamento, remover item/cortina, Salvar. Substituem o `confirm()` nativo.
- **Medidas com máscara de vírgula** (150 → 1,50). **TC 75%.** Cortina: tipo de barra/franzido/tamanho da barra vêm **em branco** (vazio = padrão no servidor: barra 0,10, franzido 3); modelo inicia em "Selecione…".
- **Admin:** excluir usuário (bloqueia se tiver orçamentos), reativar, coluna Vendedor GC por nome, botões `btn-xs` menos achatados.
- **Clareza:** "Cliente (obrigatório para enviar ao GestãoClick)"; tooltips de status ("Enviado ao GestãoClick" etc.).

### 10.7 ✅ "Código GC" = Nº do GestãoClick + postura pós-envio (17/06/2026)
- **Coluna "Código GC"** passa a exibir o **`codigo`** que enviamos (= o **Nº** mostrado no GestãoClick), para o usuário localizar fácil. Persistido em `Orcamento.gc_codigo` (migration `20260617190000_add_gc_codigo`). O `gc_orcamento_id` (id interno da API) continua guardado para uso técnico; a exibição usa `gc_codigo` (fallback no id).
- **Orçamento excluído no GestãoClick (fire-and-forward):** a Pérsia **não detecta** a exclusão — o token não permite ler orçamento por id (403). Depois de enviado, a **fonte da verdade é o GestãoClick**; o registro local é histórico ("foi enviado"), não um espelho em tempo real. Para refazer, cria-se um novo. Sincronizar é inviável pela limitação da API.

### 10.8 ✅ 2ª rodada de feedback (17/06/2026)
- **Detalhe do orçamento:** largura cheia (não mais `max-w-form`). Em **rascunho/erro**, dá para **escolher o cliente** ali (busca GC), **Salvar** (`PUT /orcamentos/:id`) e **Enviar** (desabilitado sem cliente). **Cancelar** disponível no detalhe (com modal), não só na lista.
- **Enviar rascunho de CORTINA:** `reenviarOrcamento` delega para `reenviarCortina` quando `tipo='cortina'` — replay do snapshot (1 produto por cortina + linha de serviço de instalação). O snapshot de cortina passou a guardar `nome_produto` e `valor_custo`. `resolverLoja` movido para `lib/` (compartilhado).
- **Terminologia:** perfil exibido como **"Administrador"** (navbar, lista, cadastro), valor do enum continua `admin`.
- **Admin → Usuários:** **excluir** usuário (DELETE; bloqueia se houver orçamentos → sugere desativar), **reativar**, coluna **Vendedor GC** por nome, botões `btn-xs` menos achatados, tooltips nas ações.
- **Operações de dados em produção** (vínculo de loja do Victor = Matriz; exclusão de usuários de teste) são feitas pelo admin na própria tela (não há acesso ao banco de produção fora do Railway).

### 10.9 ✅ 3ª rodada de feedback (17/06/2026)
- **Confirmação antes de enviar ao GestãoClick:** todo botão "Enviar/Reenviar" (persiana, cortina e detalhe do orçamento) abre um **modal de confirmação** (`ConfirmModal`) com o valor e o cliente antes de criar o orçamento no GC.
- **Sem pop-ups nativos do navegador:** os `confirm()` nativos de **desativar** e **excluir** usuário viraram `ConfirmModal` padrão. Varredura feita no `apps/web/src` — nenhum `confirm/alert/prompt` nativo restante. Tooltip "Excluir definitivamente" → **"Excluir"** (o aviso de irreversibilidade fica na mensagem do modal).
- **Lista de orçamentos:** coluna **"Código GC" → "Nº GestãoClick"** (também no detalhe). Coluna **Tipo** passa a mostrar só **"Persiana"** ou **"Cortina"** (antes "Rolo Blackout" etc.).
- **Editar orçamento:** botão **Editar** (lápis) na lista, **ativo só para rascunho** (inativo para enviado/erro/cancelado, com tooltip explicando). Editar pela lista abre o orçamento **já em modo edição** (`?editar=1`). **Visualizar** abre um rascunho em **só-leitura** (cliente exibido como texto); só o botão **Editar** dentro do detalhe habilita os campos. `erro` continua abrindo em edição (retentativa). *(Substituído pela §10.10: a edição de rascunho passou a reabrir a calculadora inteira.)*

### 10.10 ✅ 4ª rodada de feedback (17/06/2026)
- **Tabelas (orçamentos e usuários):** `table-layout: fixed` + `<colgroup>` com larguras → acaba o "auto-ajuste"/flicker ao carregar.
- **Cadastro de usuário:** selects de **Loja**, **Perfil** e **Vendedor (GestãoClick)** com placeholder **"Selecione"**; **Perfil** virou obrigatório (`*` + `required`, começa vazio). Coluna **"Vendedor GC" → "Vendedor GestãoClick"**.
- **Cortina:** quantidade manual de acessório agora **fica em branco** ao apagar (estado string, não força 0). Asterisco `*` no bloco **Acessórios**.
- **Detalhe:** **"Cancelar"** renomeado para **"Cancelar orçamento"** (distinto de "Cancelar edição").
- **EDIÇÃO COMPLETA DE RASCUNHO (mudança maior):** clicar em **Editar** num rascunho reabre a **calculadora inteira pré-preenchida** (`/orcamentos/novo?editar=<id>`), com o cliente no topo igual a um orçamento novo. Ao **Salvar/Enviar**, o **mesmo registro** é regravado (não duplica).
  - **Backend:** nova coluna `Orcamento.entrada_json` (migração `20260617230000_add_entrada_json`) guarda a **entrada bruta** do formulário (persiana `{tipo, itens}`; cortina `{cortinas, instalacao_valor}`). `POST /orcamentos` e `POST /orcamentos/cortina` aceitam `editar_id` → validam que é **rascunho do próprio usuário** (ou admin) e fazem `update` em vez de `create` (mantendo dono/loja originais). Recalcula tudo no servidor, como sempre.
  - **Frontend:** `OrcamentoNovo` carrega o rascunho, fixa o tipo (sem cards de seleção), pré-preenche cliente + formulário e mostra banner "Editando rascunho" + **Cancelar edição**. `PersianaForm`, `CortinaOrcamento` e `CortinaCard` aceitam `inicial`; `ResultadoPanel`/`CortinaOrcamento` repassam `editar_id`. Rascunhos antigos de **persiana** sem `entrada_json` são reconstruídos do `itens_json`; de **cortina** sem `entrada_json` não reabrem (avisa para recriar).
  - O detalhe agora: **rascunho** = só-leitura + Editar (vai p/ calculadora); **erro** = edição inline (cliente + Reenviar) para retentativa.

### 10.11 ✅ Guarda de navegação (orçamento não salvo) (17/06/2026)
- **Problema:** sair da tela de orçamento (persiana/cortina) com dados preenchidos perdia tudo sem aviso.
- **Solução:** `hooks/useNavGuard.tsx` (`NavGuardProvider` no `Layout`). Mantém um flag "sujo" (via ref, sem re-render) e um `guard(acao)` que, se houver dados não salvos, abre o **`ConfirmModal` padrão** ("Cancelar o orçamento? … as informações serão perdidas") antes de executar a navegação.
- **Onde intercepta:** todos os itens do **menu lateral** (Orçamentos, Novo Orçamento, Usuários, Log de Ações) e da **navbar** (**Alterar senha**, **Sair**). Navegações programáticas após salvar/enviar não passam pela guarda (são intencionais); ao desmontar a tela o flag é limpo.
- **Detecção do "sujo":** `PersianaForm` e `CortinaOrcamento`/`CortinaCard` reportam via `onDirtyChange`/`onPreenchidoChange` quando há **pelo menos um campo preenchido** (inclui o caso de edição de rascunho, que já abre preenchido). `OrcamentoNovo` liga isso à guarda.
- **Clicar "Novo Orçamento" estando nele:** se houver dados não salvos, confirma e **volta para Orçamentos** (tela inicial); sem dados, não faz nada. (Sidebar usa `useLocation` + `isDirty()`.)

### 10.12 ✅ Cache do GestãoClick reduzido (18/06/2026)
- **Tecidos** (persiana e cortina) e **acessórios da cortina**: TTL reduzido para **1 minuto** (antes 5 min / 30 min). Novos cadastros no GC aparecem na calculadora em até ~1 min, sem refetch a cada formulário. (Reiniciar o app zera o cache na hora.)
- **Sem cache (tempo real):** clientes (busca ao digitar), vendedores/funcionários (ao reabrir a tela de usuários), serviço de instalação. **Health:** 5 s.

### 10.13 ✅ 5ª rodada de feedback (18/06/2026)
- **Cortina:** campos **Tamanho da barra** e **Franzido** sem dica (placeholder vazio) — vêm em branco; o vendedor preenche quando precisar. Se vazio, o servidor usa os padrões (barra 0,10 m; franzido 3 / wave 2,7).
- **Detalhe do orçamento de CORTINA:** agora exibe o detalhamento completo — por cortina: modelo, fixação, medidas, **camadas (tecidos com metragem e valor)** e **acessórios (produto, qtd e subtotal)** + linha de **instalação**. (Cortina guarda `{cortinas, instalacao}` em `itens_json` — antes caía no fallback e mostrava só tecido/medidas.)
- **Novo Orçamento:** removidas as descrições "7 tipos (rolo e romana)" / "15 tipos sob medida"; ícone (2x) e título (text-xl) maiores nos cards Persiana/Cortina.
- **Limpeza de base:** exclusão de todos os orçamentos feita via SQL no painel do Railway (`DELETE FROM itens_orcamento; DELETE FROM orcamentos;`) — não afeta o GestãoClick.

### 10.14 ✅ 6ª rodada de feedback (18/06/2026)
- **Títulos das telas** (Orçamentos, Usuários, Novo Orçamento, Log) em **negrito** + cor mais forte (`font-bold text-neutral-800`).
- **Marca "Pérsia · Rainha das Cortinas"** na navbar virou **clicável** → leva a Orçamentos (passa pela guarda de navegação).
- **Status "Erro":** ocorre quando o envio ao GestãoClick falha (GC fora do ar, token inválido, payload recusado). Para validar o filtro em teste, inserir/remover um registro `status='erro'` via SQL no Railway (documentado para o Victor).
- **AUTOSAVE LOCAL (recuperação de orçamento não salvo)** — `lib/rascunhoLocal.ts` (localStorage). Muda a decisão anterior de "estado só em memória".
  - Ao preencher ≥1 campo, o orçamento (persiana/cortina) é salvo no navegador (debounce 500ms). Se fechar/recarregar sem querer, ao voltar a tela **restaura** o orçamento (cliente + tipo + campos) e mostra banner "Recuperamos um orçamento não salvo" com **Descartar**.
  - `PersianaForm`/`CortinaOrcamento`/`CortinaCard` ganharam `restauro` (estado bruto) + `onSnapshot`. `OrcamentoNovo` orquestra (refs + debounce); reusa a mesma infra do modo edição. **Não** roda em modo edição (que usa `entrada_json` do banco). Limpa ao Enviar/Salvar com sucesso.
  - Ao clicar **Novo Orçamento** estando nele com dados não salvos: modal informativo "Orçamento não salvo" com **um único botão "Continuar"** (`ConfirmModal` ganhou `ocultarCancelar`). É local ao navegador (não sincroniza entre máquinas).

### 10.15 ✅ Validação de cálculos contra o GestãoClick (18/06/2026)
- O token de integração **passou a ler orçamentos** do GC (`GET /api/orcamentos` = 200; antes 403). Permitiu replicar orçamentos reais no motor da Pérsia (somente leitura — nada escrito).
- **Nº 9822 — Cortina ILHÓS (2,65×2,32, blackout):** GC R$ 1.308,32 × calculadora **R$ 1.298,64 (~0,7%)**. Metragem 7,95 vs 8,00; entretela e ponteira batem. **Motor de ILHÓS validado.**
- **Nº 9807 — Cortina WAVE (2,90×2,55, gaze):** divergências — tecido 7,85 vs 8,35 (fator 2,7 baixo vs ~2,88 da prática); acessórios wave da calc (cordão+rodízio+base) ≠ prática (fita wave por metro); entretela incluída pela calc; terminais 4 vs 2.
- **Achados a revisar com o Victor (não corrigidos — decisão dele):** (1) fator do **Wave** (BLOQUEANTE-05); (2) **varão** sai por metro na calc, mas no GC é por **barra** (o **trilho** por metro bate); (3) **qtd de ilhós** (54 vs 58, espaçamento); (4) **estrutura de acessórios do Wave**; (5) entretela no Wave. Orçamentos do GC usados são **manuais** (refletem a prática e variam por vendedor); a calc segue as regras definidas com o Victor.

### 10.16 ⏳ Homologação — 1ª onda de feedback do Victor (18/06/2026) — LOCAL, não deployado
Doc do Victor: `Persia_Casos_de_Teste_Homologacao_Victor_v.2.docx` (raiz). Maioria dos casos OK. **Tudo abaixo está só no ambiente local.**

**Corrigido/feito (local):**
- **Barra em CM** (era o "bug" do cálculo de cortina): o campo "Tamanho da barra" estava em **metros** e o Victor digitava pensando em **cm** (ex.: "10" virava 10 m → metragem inflada, o "38 m"). Campo passou a ser **cm** (CortinaCard + módulo de Regras); converte p/ metros por baixo. **O motor estava correto.**
- **Wave — acessórios contaminando** (img1): "Cordão wave/Rodízio wave/Base click" mapeiam todos p/ a categoria `wave`; o seletor (`acessorioSel`) passou a ser **por item** (não por categoria). Front: `CortinaCard`. Backend já casava por item.
- **Transparência** (4.1): bloco **"Tecido (cálculo)"** no `CortinaCard` mostra metragem por camada (+ emenda + valor). Persiana já mostrava m² por item.
- **Nome do ambiente na persiana** (Tab. 9): campo `Ambiente` por item no `PersianaForm`; vai no nome do produto do GC, no detalhe, na edição e no autosave (`ItemInput.ambiente`, `ItemSnapshot.ambiente`, `nomeProdutoGc`).
- **Checkbox "Já possui" (trilho/varão)** (img2): quando marcado, o trilho/varão **não entra** no orçamento (não soma, não exige produto). Front (`CortinaCard`: `jaPossuiVarao`) + backend (`CortinaEntrada.ja_possui_varao` → `prepararCortina` pula o item da barra). Persiste no payload/entrada_json/autosave.
- **Instalação na persiana** (3.5): campo "Instalação (R$)" no `ResultadoPanel`; entra como **linha de serviço** no envio (`executarEnvioGc` ganhou `instalacao_valor`; `resolverServicoInstalacao` exportado do controller de cortina e reusado); soma ao `valor_final`; salvo no `entrada_json`; exibido no detalhe; restaurado na edição/reenvio.

**Investigação (sem bug — motor correto):** persiana multi-itens calcula cada item certo no servidor (R$349,03 + R$430,12 independentes); metragem de cortina correta (o "38 m" era a barra em m).

**⏸ Pendente do Victor:** trilho duplo (qual acessório conta 1× vs por camada); **tecidos por grupo** (PH aprovou filtrar; falta saber como os tecidos estão agrupados no GC); calibração fina dos valores (aguardando 2–3 casos concretos com valor do DecorSoft); **cliente "Cliente final"** (precisa existir no GC); **fixação por busca** (só 3 opções → confirmar).

**✅ Nº do orçamento sequencial — RESOLVIDO em 19/06/2026.** Confirmado por leitura no GC: orçamentos do app saíam com o timestamp no `codigo` (ex.: `1781806913`), furando a sequência real (~9830). Teste controlado (POST sem `codigo`, R$1, apagado em seguida): o GC gerou **9831** (sequencial certo) e devolveu o `codigo` na resposta do POST. Correção: `gc/orcamentos.ts` **não envia mais `codigo`** e lê `gc_codigo` da resposta; controllers (`orcamentoController`/`orcamentoCortinaController`) usam esse valor em vez do `Date.now()`. Deployado no commit pós-`8075579`.

**🟣 Estrutural (à parte):** orçamento **misto** cortina + persiana no mesmo orçamento (Tab. 9, 6.1) — mudança grande, planejar separado.

---

## 11. Módulo de Regras de Cálculo (18/06/2026) — LOCAL, não deployado

Objetivo: o Victor (admin) **parametriza as regras do motor com autonomia**, sem depender da Stratos e **sem deploy** — salvou, vale na hora para toda a aplicação.

- **Backend** `services/calc/regras.ts`: `RegrasCalculo` (interface), `REGRAS_DEFAULT` (= constantes originais do código), store em memória (`getRegras`), `carregarRegras` (no boot, lê `Configuracao` chave `regras_calculo` em JSON), `salvarRegras` (valida via `normalizar()` + grava + atualiza memória → reflete imediato; API é processo único). Sem migração (reusa `Configuracao`).
- **Motor lê `getRegras()`**: `persiana.ts` (`tc_fator`; por tipo: margem, fator_venda, base_venda, dobrar_altura), `componentes.ts` (descontos fita/base, passo do parafuso, tampas), `cortina.ts` (`franzido_wave`, `passo_tecido`, `passo_botao_wave`, `folga_topo`/`tem_entretela` por modelo, defaults de franzido/barra/espaçamentos/aberturas). `META` mantém só o estático (codigoGc, familia, maoDeObra).
- **Endpoints** (só admin): `GET`/`PUT /api/admin/regras-calculo`.
- **Frontend** `pages/admin/AdminRegras.tsx` (item "Regras de Cálculo" na Sidebar, só admin). Abre em **visualização** (campos travados = regras em vigor); botão **Editar** habilita; **Cancelar edição** / **Restaurar padrão** / **Salvar**. "Tamanho da barra" exibido em **cm**.
- **Validação:** 65 testes do motor passam (defaults = originais); double-check confirmou os 31 valores exibidos == originais; testes de cálculo confirmaram que alterar um parâmetro muda o resultado e reverter restaura.
- **Limitação:** **fórmulas estruturais** (componentes condicionais, lógica de emenda) seguem no código — não são parametrizáveis por formulário.

## 12. Auditoria de segurança — correções (18/06/2026) — LOCAL, não deployado

Rodada a skill `vibe-code-security-auditor` no projeto inteiro (44 .ts API + 38 .ts/.tsx web + configs). Base já era sólida (sessão httpOnly/secure, bcrypt, controle de acesso por perfil no backend, sem IDOR, Prisma parametrizado, `.env` fora do git, sem XSS). 7 achados corrigidos **localmente** (nada em produção — último commit prod segue `72f6245`):

1. **[Crítico] Senha de admin padrão no código + nunca forçada a trocar** — `seed.ts` lia `Admin@2026`/`Vendedor@2026` em texto e não setava `senha_provisoria` (default `false`). Agora lê de env obrigatória (`SEED_ADMIN_SENHA`, `SEED_VENDEDOR_SP_SENHA`, `SEED_VENDEDOR_SBC_SENHA`, mín. 8 chars) e cria com `senha_provisoria: true`. Vars documentadas no `.env.example`. **PENDÊNCIA OPERACIONAL:** a senha antiga está no histórico do git — trocar a senha do admin em produção quando reativarmos o deploy.
2. **[Alto] Login sem proteção contra força bruta** — adicionado `express-rate-limit` em `POST /api/auth/login` (10 tentativas falhas/IP a cada 15 min → 429; `skipSuccessfulRequests`). Usa o `trust proxy` já existente. Testado: 429 a partir da 11ª falha.
3. **[Alto] Dependência vulnerável** — `npm audit fix` subiu `axios`→1.17.0 / `form-data`→4.0.6. **Produção: 0 vulnerabilidades.** Os achados **dev-only** restantes (esbuild/vite/vitest/shell-quote) também foram zerados (18/06, ver §12.1): **`npm audit` = 0 vulnerabilidades** no monorepo inteiro.
4. **[Médio] Cabeçalhos de segurança ausentes** — adicionado `helmet` em `index.ts` com CSP liberando só o necessário (recursos próprios + Google Fonts), HSTS só em produção. Confirmado via curl (CSP, X-Frame-Options SAMEORIGIN, nosniff etc.).
5. **[Médio] Política de senha fraca (mín. 6)** — novo `lib/senha.ts` (`validarSenha`: mín. 8 + letra + número), usado em `authController.alterarSenha`, `adminController.criarUsuario`/`editarUsuario`. Frontend espelhado em `validacao.ts` (`senhaValida`), telas `TrocarSenha` e `AdminUsuarios` atualizadas. Login continua leniente (não bloqueia o botão).
6. **[Baixo] Rascunho local sem expiração** — `rascunhoLocal.ts` agora descarta rascunho > 12h (e os sem `ts`); `useAuth.logout` limpa o rascunho ao sair (estações compartilhadas).
7. **[Baixo] Health expunha commit** — removido `commit` do público `/api/health`; movido para `GET /api/admin/versao` (só admin). Confirmado 401 sem auth.

**Ponto de atenção registrado (não corrigido):** sem token anti-CSRF; risco mitigado por `sameSite:'lax'` + cookie + API só-JSON. Reavaliar se for adicionada rota que aceite form/POST top-level.

**Verificação:** typecheck API + web limpos; 65/65 testes passam; API sobe com helmet+rate-limit; login renderiza sem erro de console.

### 12.1 Upgrade das dependências dev-only (18/06/2026) — LOCAL

Para zerar os achados dev-only do `npm audit` sem deploy:
- **`overrides` na raiz**: `esbuild ^0.25.0` (corrige o advisory do dev-server, raiz de vários achados) e `vite ^6.4.3` (mantém todo o vite alinhado no patch que corrige path-traversal / `fs.deny` bypass; **vite 6.4.3, não 8** — menor salto possível).
- **web**: `vite ^5.4.11 → ^6.4.3`. `@vitejs/plugin-react@4.7` mantido (já cobre vite 6/7). `vite.config.ts` sem mudanças.
- **api**: `vitest`/`@vitest/coverage-v8` `^2.1.8 → ^3.2.6` (vitest 3 aceita vite 6). `vitest.config.ts` sem mudanças.
- **raiz**: `concurrently → 9.2.3` (resolve `shell-quote`).
- Exigiu **reinstalação limpa** (`rm -rf node_modules + package-lock.json`) para o `overrides` valer — `npm install` incremental reaproveitava a árvore antiga.
- **Resultado:** `npm audit` = **0 vulnerabilidades**. Verificado: typecheck API+web OK, 65/65 testes no vitest 3, **`vite build` (produção) OK**, dev server vite 6.4.3 sobe e login carrega sem erro de console. Node de build precisa ser ≥20 (vite 6.4.3 ok com node 20; não exige 20.19 como vite 7).

## 13. Respostas do Victor (1ª onda do e-mail, 19/06/2026) + filtro de tecidos — LOCAL

Victor respondeu as perguntas do e-mail (2 ondas, 19/06):

1. **Exemplos de orçamentos corretos** — "vou montar e mando". ⏳ **PENDENTE** — sem isso não dá para fazer a calibração fina (igualar valor ao DecorSoft). É o item mais importante.
2. **Cortina — quantidades com 2/3 tecidos:**
   - **Varão** = N (1 por tecido), e o **vendedor escolhe cada um** (cliente pode misturar 19mm/28mm). ✅ **IMPLEMENTADO** — varão por camada (ver §13.2).
   - **Demais acessórios** (rodízios/argolas/ponteiras/suportes/terminais) = **por tecido**. ✅ **JÁ CORRETO** — o motor multi-camada já soma por camada.
   - **TRILHO** (não varão): Victor confirmou **(a) 1 trilho duplo/triplo** — conta **1 vez** (qty = largura), não soma por camada. ✅ **IMPLEMENTADO** (ver §13.2).
3. **Tecidos por tipo** — "os tecidos de persiana já estão separados por tipo no GC". ✅ **INVESTIGADO E IMPLEMENTADO** (ver §13.1).
4. **"PERSIANA FD"** — "grupo coringa de movimentação de estoque, não aparece em nada". ✅ **EXCLUÍDO** do filtro (só os 4 materiais aparecem). BLOQUEANTE-07 resolvido.

### 13.1 Filtro de tecidos de persiana por tipo (implementado — LOCAL)

Investigação (somente leitura no GC, 19/06/2026): "TECIDOS PARA PERSIANA" (235486) tem 5 subgrupos:
`5914897` BLACKOUT, `5914896` TELA SOLAR (=screen), `5914898` TRANSLÚCIDO, `5914899` DOUBLE VISION, `5914919` **PERSIANA FD** (ambíguo — mistura BK e outros).

- `tecidos.ts`: `TecidoGc` agora carrega `grupo_id`; `SUBGRUPO_PERSIANA` + `SUBGRUPO_DO_TIPO` mapeiam **por material** (rolo e romana compartilham o mesmo material). `tecidosParaTipo(tipo)` agora **filtra** (antes devolvia todos). Frontend já mandava `?tipo=` — sem mudança no front.
- **PERSIANA FD** (não mapeado) → **fallback não-destrutivo**: aparece em TODOS os tipos até o Victor classificar. **BLOQUEANTE-07**.
- **PERSIANA FD excluído** (Victor: grupo coringa, não aparece): filtro estrito `t.grupo_id === subgrupo`. Sem fallback.
- Verificado contra o GC: cada tipo mostra só o material certo; romana == rolo por material. Cortina **não** foi filtrada (Victor só falou de persiana; tecidos de cortina seguem em lista única).

### 13.2 Varão por camada (implementado — LOCAL)

Victor (19/06): em cortina de 2/3 tecidos, há **N varões**, um **por camada**, e o vendedor escolhe o tipo de **cada um** (ex.: 2 finos 19mm + 1 grosso 28mm).
- `cortina.ts` (`calcularCortinaMultiCamada`): para fixação **varão** e **varão suíço**, o varão **não é mais agregado** — emite 1 linha por camada (`"Varão (camada N)"` quando há +1 camada; `"Varão"` quando 1 só, sem mudança). **Trilho** = **1 trilho duplo/triplo**: conta **1 vez** (qty = largura), não soma por camada (Victor 19/06, resposta "a"). Verificado: trilho 2 camadas → `Trilho =3m` (antes 6m); rodízios/ganchos seguem por tecido (=60).
- `acessorios.ts` (`categoriaDoItem`): remove o sufixo `(camada N)`/`(traseiro)` antes de mapear (preserva nomes com parênteses próprios, ex.: "Entretela (KOS)").
- `CortinaCard.tsx` + `orcamentoCortinaController.ts`: "Cliente já possui o varão" agora pula **todas** as linhas de varão (`ehBarra()` casa pela base do nome). O card já renderiza 1 seletor por item → aparecem N seletores de varão automaticamente (front quase sem mudança).
- **Verificado** (endpoint real `/cortina/completa`, 2 camadas): `Varão (camada 1)=3m`, `Varão (camada 2)=3m` (categoria `varao`); Ilhoses 120, Ponteira 4, Entretela 9 (frente). Trilho continua `=6m` agregado. 66 testes (1 novo), typecheck API+web OK, sem erro de console.

## 14. Homologação — 3ª onda (v.3.1, 22/06/2026)

Doc do Victor: `Persia_Casos_de_Teste_Homologacao_Victor_v.3.1.docx`. Quase tudo **OK** (Regras de Cálculo 100%; persianas calculando certo — diferenças pequenas são preços ainda não exatos no GC, calibração do lado dele). 8 apontamentos novos:

**✅ Feito e deployado:**
- **#2 Suporte = 0:** item manual com qtd 0 não é mais barrado — é **omitido** do orçamento. `orcamentoCortinaController.prepararCortina` (pula antes de exigir produto) + `CortinaCard` (não marca incompleto).
- **#3 Nome do produto com "Cortina":** prefixo "Cortina " no `nomeProduto` (persiana já vinha com "PERSIANA" via TIPO_LABEL). `orcamentoCortinaController` + `CortinaCard` (display).

**⏸ Depende do Victor (e-mail enviado):**
- **#1 Cortina com emenda "franze 3×":** investigado — no código o franzido É considerado na emenda (`tiras = ceil(largura×franzido / larguraTecido)`); provável causa = campo franzido em branco → padrão 3. **Precisa de exemplo concreto dele** pra reproduzir (não mexer no cálculo no escuro).
- **#5 Wave — acessórios obrigatórios automáticos + Terminais nos modelos de trilho:** precisa do **produto-padrão** de cordão/rodízio wave/base click e da decisão sobre Terminais.

**✅ Feito e deployado (continuação):**
- **#4 Instalação por peça:** semântica de `instalacao_valor` mudou para **valor POR PEÇA**; total = unitário × nº de peças (janelas/cortinas). Backend: `orcamentos.ts` (`LinhaServicoGc.quantidade`; serviço vai com `quantidade = nº peças`, `valor = unitário`), `orcamentoController` + `orcamentoCortinaController` (criação + reenvio). Frontend: painéis (label "Instalação por peça" + linha "R$X × N = total") e `OrcamentoDetalhe` (calcula o total a partir do unitário). entrada_json/itens_json guardam o **unitário**. Teste novo de `montarPayload` (serviço com quantidade). Verificado: typecheck 2 apps + 67 testes + web build OK. (Banco local estava offline → e2e de salvar não rodou; math é multiplicação simples + coberta por teste.)

**🟣 Grandes (planejar à parte):**
- **#6 Modelo de tecido por camada** (ex.: frente Wave, fundo Franzido) — hoje o modelo é da cortina inteira; mudança no motor + UI.
- **#7 Orçamento misto** persiana + cortina no mesmo orçamento — estrutural.

**Não marcado por ele:** varão por camada (item 4 da seção 1) ficou em branco — pedimos confirmação no e-mail (já validado por nós via endpoint).
