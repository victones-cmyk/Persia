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

- **(Resolvido 16/06)** Cortina — modelos fechados pelo Victor (ver §9.5): 4 modelos cobrem tudo (Argolas = Franzido/varão), inversão = emenda, deslizante qtd automática, entretela só frente, tecido de 5 em 5 cm. **Resta:** confirmar o fator do Wave (3 m → 8,10 m, BLOQUEANTE-05) e o **envio ao GC** (acessórios cadastrados? + ideia do Victor p/ duplas/triplas — BLOQUEANTE-06).
- **Vincular cada vendedora** ao id de funcionário do GC (via Admin → Usuários).
- **(Resolvido 17/06)** Desconto: **feature removida** da calculadora (fica 100% no GC). TC = **75%**. Fita = **2× a largura** (Victor) — o modelo atual já soma ~2× a largura no total; conferir na homologação (fita é só lista técnica/OS, não entra no preço).
- **Homologação:** ~10 orçamentos plataforma × DecorSoft.
- **(Resolvido)** Largura dos tecidos: Victor cadastrou no campo customizado "LARGURA" e a calc já lê (§3.3). WAVE FÁCIL ≠ WAVE (BLOQUEANTE-04).

---

## 7. Estado atual (16/06/2026)

- **Em produção** (commit `d9ca642`): https://persia-api-production.up.railway.app — persiana **multi-itens**, largura via atributo, login "Usuário" + senha provisória, seletor de vendedor, busca de tecido. Auto-deploy GitHub→Railway OK.
- **Commitado localmente, ainda não enviado (push) p/ produção:** motor de cortina (4 modelos: Ilhós/Prega/Franzido/Wave) com as **respostas finais do Victor** (Argolas=Franzido/varão, inversão=emenda, tecido de 5 em 5 cm, Wave fator 2,7), **calculadora de cortina na UI**, **Salvar (rascunho)**, **cliente no topo**, padronização de largura e ajuste do desconto. **61/61 testes.**
- **Próximas:** **envio de cortina ao GestãoClick** (depende do BLOQUEANTE-06: acessórios cadastrados + ideia do Victor p/ duplas/triplas) e confirmar o fator do Wave (BLOQUEANTE-05); Fase 8 (homologação/go-live).
- **Obs.:** a calculadora de cortina, se for ao ar agora, é **só cálculo** (sem botão Enviar/Salvar) — a aba mostra `CortinaForm` + `CortinaResultado`, sem integração ao GC.

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

## 9. Cortina — modelo Ilhós/Varão (Fase 7, 1º modelo, 15/06/2026)

Fonte: planilhas "CORTINA SOB MEDIDA" v1→v3 do Victor + áudios do Wave + método de emenda da Cortinas Fênix. Motor em `services/calc/cortina.ts` (`calcularCortina`), funções puras + testes. Cobre **4 modelos**: Ilhós, Prega (=Americana/Macho/Fêmea), Franzido e Wave. **A UI/calculadora já existe** (ver §10.2) — é só cálculo; o **envio ao GestãoClick** ainda não está ligado (depende do mapeamento acessório→produto do GC). Modelos restantes (Prega Francesa, Argolas, Alças) e detalhes de trilho/inversão/costura: pendentes do Victor.

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
Modelos, trilho/fixação, inversão de tecido e costura fechados pelas respostas do Victor. Resta só o **envio ao GestãoClick** (BLOQUEANTE-06).

### 9.3 Atualização planilha v.3 — Prega/Franzido + entretela (15/06/2026)
Motor generalizado em `calcularCortina(e)` para 3 modelos: **ilhos**, **prega** (= Americana = Macho = Fêmea) e **franzido**. Regras confirmadas pelo Victor:
- **Entretela (KOS):** modelos com entretela = Ilhós e Prega (Franzido NÃO tem). Qtd = metragem do tecido frente; total = qtd × preço/metro (os "9" na planilha eram erro de célula `#VALUE!`).
- **Folga de topo (altura):** Ilhós 0,10 m · Prega 0,12 m (cabeçote) · Franzido 0,08 m. `barra_consumo = folga_topo + tamanho_barra × (1 simples | 2 dupla)`.
- **Ferragem:** Ilhós → **ilhoses** `ceil(consumo/0,15)`; Prega/Franzido → **argolas** (varão) ou **rodízios/ganchos** (trilho/varão suíço) `ceil(largura/0,10)`. Tudo arredondado p/ cima até par (0–1 abertura) ou múltiplo de 4 (≥2). Varão duplo: ferragem por face (frente + trás).
- **Fixação:** Ilhós só **varão**; Prega/Franzido servem **varão, trilho ou varão suíço**. **Trilho não usa ponteira**; varão/varão suíço usam (2/varão).
- **Validação:** totais batem — Ilhós 1 tecido **685,50** (= 672 + entretela 13,50, confere com a célula F36 da v.3); Prega 1 tecido **676,50**; Franzido 1 tecido **663** (sem entretela). Motor: funções puras + testes (58/58). Ainda sem UI/rota/GC.

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

Grupo **WAVE** (4 produtos): RODIZIO WAVE 62341215 (0,80) · BASE CLICK WAVE 46835072 (0,76) · CORDÃO WAVE 46835020 (5,24) · FITA WAVE AVULSA 46834988 (9,80). **ENTRETELA**: KOS TNT 10CM 414519 (1,50). Preços = tabela VAREJO. Com isso o **BLOQUEANTE-06 (a)** está resolvido; resta só a implementação (modelo "+" + seletor de acessório + envio + teste controlado de escrita).

---

## 10. Orçamento — multi-itens, rascunho e UX (12–15/06/2026)

### 10.1 ✅ Persiana multi-itens (vários itens por orçamento)
- **Decisão:** o orçamento de persiana aceita **N itens** (janelas). Produto Sob Medida é **único** para o orçamento; cada item tem sua coleção/cor/acionamento/medidas/TC/rolamento/base. Layout compacto (2 linhas por item), com **+ Adicionar item** e **Remover**. `POST /api/calcular/persiana/lote` calcula todos; o envio cria **N produtos + 1 orçamento com N linhas** no GC (desconto por item, soma exata RN-10). Itens persistidos em `Orcamento.itens_json` (snapshot) — migration `20260612060000_orcamento_itens_json`.
- **Razão:** um orçamento real tem várias janelas; espelha o GestãoClick (orçamento com vários produtos).

### 10.2 ✅ Calculadora de cortina na UI
- **Decisão:** a aba **Cortina** do Novo Orçamento abre uma calculadora real (`CortinaForm` + `CortinaResultado`): modelo/fixação/config/medidas/franzido/barra/aberturas + busca de tecido (grupo 5913111, SOB MEDIDA). Endpoints `GET /api/calcular/cortina/tecidos` e `POST /api/calcular/cortina`. Mostra método (normal/emenda), metragem, valor do tecido e a **lista de itens (quantidades)**.
- **Razão:** entregar a calculadora dos 4 modelos prontos sem esperar o módulo completo. **Sem envio ao GC ainda** (acessórios vêm do GC; mapeamento acessório→produto será definido com o Victor).

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
