# Documentação de Produto e Projeto
## Projeto Pérsia | Plataforma de Orçamento e Integração Comercial
### Rainha das Cortinas (Samar Cortinas Ltda.) | Stratos Lab

---

> **Versão:** 1.2  
> **Data:** 11/06/2026  
> **Status:** Em execução  
> **Contrato assinado:** 01/06/2026 (ZapSign 398cb101)  
> **Confidencial — uso interno Stratos Lab**

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Partes Envolvidas](#2-partes-envolvidas)
3. [Contexto e Diagnóstico (AS-IS)](#3-contexto-e-diagnóstico-as-is)
4. [Solução Proposta (TO-BE)](#4-solução-proposta-to-be)
5. [Escopo](#5-escopo)
6. [Requisitos Funcionais](#6-requisitos-funcionais)
7. [Regras de Negócio](#7-regras-de-negócio)
8. [Integração GestãoClick (API)](#8-integração-gestãoclick-api)
9. [Entregáveis e Critérios de Aceite por Marco](#9-entregáveis-e-critérios-de-aceite-por-marco)
10. [Plano de Testes e Homologação](#10-plano-de-testes-e-homologação)
11. [Riscos e Dependências](#11-riscos-e-dependências)
12. [Arquitetura Técnica](#12-arquitetura-técnica)
13. [Cronograma e Marcos](#13-cronograma-e-marcos)
14. [Condições Comerciais](#14-condições-comerciais)
15. [Governança e Comunicação](#15-governança-e-comunicação)
16. [Virada Operacional e Desligamento do DecorSoft](#16-virada-operacional-e-desligamento-do-decorsoft)

---

## 1. Visão Geral do Projeto

**Nome do projeto:** Pérsia  
**Nome do produto:** Plataforma de Orçamento e Integração Comercial  
**Cliente:** Samar Cortinas Ltda. (Rainha das Cortinas)  
**Fornecedor:** P. H. A. Figueiredo Serviços de Informática (Stratos Lab)  
**Prazo contratual:** 30 dias corridos a partir do início efetivo dos serviços  

### Objetivo

Desenvolver uma plataforma web sob medida que substitua o DecorSoft como ferramenta de cálculo de orçamentos e integre automaticamente os resultados ao ERP GestãoClick, eliminando o lançamento manual de valores, erros de arredondamento e divergências de estoque.

### Problema Central

A Rainha das Cortinas opera hoje com dois sistemas sem integração nativa. O DecorSoft é usado exclusivamente para calcular persianas. O cálculo de cortinas é feito na mão pelas vendedoras. Após o cálculo, o vendedor copia o valor manualmente para o GestãoClick, gerando:

- Erros de arredondamento entre vendedoras (ex: R$ 449,50 virar R$ 450,00 sem registro)
- Esquecimento de acessórios no cálculo manual de cortinas
- Retrabalho na redigitação: o mesmo orçamento é montado em dois sistemas
- Estoque incorreto no GestãoClick por ausência de baixa automática dos componentes

### Objetivo de Sucesso (definido pelo cliente)

> "O que sai da calculadora é o que está no GestãoClick."

---

## 2. Partes Envolvidas

### Stratos Lab (Contratada)

| Nome | Papel |
|------|-------|
| Paulo Henrique A. Figueiredo (PH) | Sócio, responsável pelo projeto |
| Antonio Figueiredo | Sócio, responsável pelo projeto |

### Rainha das Cortinas (Contratante)

| Nome | Papel | Disponibilidade |
|------|-------|-----------------|
| Victor Nogueira Pavoni | Decisor técnico e comercial, ponto focal único, administrador do GestãoClick | Na loja até 16h. Remoto com notebook após 16h. |
| Felipe Pavoni | Irmão, operação de vendas | Apoio quando fluxo alto |
| Caio Pavoni | Irmão, caixa e operação | Apoio quando fluxo alto |
| Vendedoras (2x SP + 3x SBC) | Usuárias principais da plataforma | Disponíveis durante homologação |
| Motoristas (2x SP) | Usuários do app interno de medidas | Fora do escopo deste projeto |

**Ponto focal operacional:** Victor Nogueira Pavoni  
**Canal de comunicação do projeto:** WhatsApp (grupo já existente)

---

## 3. Contexto e Diagnóstico (AS-IS)

### 3.1 Fluxo Atual de Orçamento

```
Cliente contata via WhatsApp ou rede social
        ↓
Vendedor faz triagem e pede medida aproximada
        ↓
Vendedor dá estimativa de valor (orçamento prévio)
        ↓
Motorista vai ao local com mostruários e tira medidas reais
        ↓
Motorista registra medidas + fotos no app interno (Victor desenvolveu; antes era Google Agenda)
        ↓
Vendedor acessa as medidas e refaz o orçamento:
  - Persiana: abre DecorSoft → calcula → copia valor → lança no GestãoClick
  - Cortina: calcula na mão item por item → lança no GestãoClick
        ↓
Orçamento no GestãoClick enviado ao cliente
        ↓
Cliente aprova → orçamento vira venda no GestãoClick
        ↓
GestãoClick gerencia pedido, nota fiscal e data de entrega
```

### 3.2 Sistemas em Uso

| Sistema | Uso atual | Custo |
|---------|-----------|-------|
| GestãoClick | ERP principal: orçamento, vendas, estoque, financeiro, fiscal | ~R$ 400/mês (estimado pelo Victor) |
| DecorSoft | Calculadora de persiana (uso único e exclusivo) | ~R$ 400/mês |
| App interno (Victor) | Registro de medidas e fotos pelos motoristas | Interno, sem custo |
| ChatMult (WhatsApp open source) | Atendimento multi-atendente via API Meta | VPS própria |

### 3.3 Módulos do GestãoClick em Uso

- Orçamentos e Vendas
- Estoque
- Financeiro
- Fiscal (listagem de NFs; contador acessa diretamente com importação automática de XML via SEFAZ)

Módulos NÃO utilizados: Serviços, Ordem de Serviço, Contratos.

### 3.4 Estrutura de Usuários do GestãoClick

3 usuários cadastrados: Administrador (Victor), Vendas SP, Vendas São Bernardo.  
Plano por CNPJ, não por usuário. Múltiplos computadores simultâneos sem timeout.

### 3.5 Volume Operacional

- 50 a 60 solicitações de orçamento por dia (via agência de marketing + canais próprios)
- 10 a 15 orçamentos completos por dia (após filtragem)
- 8 vendedores no total (5 em SP, 3 em São Bernardo)
- 2 motoristas fixos em SP

### 3.6 Problemas Mapeados

**Críticos:**
1. Arredondamento inconsistente: vendedora arredonda R$ 449,50 para R$ 450,00. Cliente liga e recebe valor diferente de outra vendedora.
2. Esquecimento de acessório no cálculo manual de cortina: orçamento vai mais barato, cliente aprova, na revisão sai mais caro.
3. Redigitação: o valor calculado no DecorSoft precisa ser copiado manualmente para o GestãoClick. Sem confirmação automática.

**Secundários:**
4. Estoque ~80% acurado. DecorSoft não dá baixa automática de componentes.
5. Ordem de serviço de cortina preenchida manualmente em PDF editável (redigitação).
6. Etiquetas de persiana geradas via Excel alimentado manualmente.
7. Erro de especificação para confecção: medida informada na OS diverge da executada pela costureira (ex: pedido de 2,21m resulta em peça de 2,20m). Mitigado pelo envio das medidas exatas ao GestãoClick via API, sem arredondamento manual.
8. Falta de comunicação de requisitos técnicos ao cliente antes da visita: cliente não é informado sobre pré-requisitos de instalação (ex: ponto de energia para persiana motorizada), gerando frustração e retrabalho. Mitigação parcial implementada pelo Victor via atendimento estruturado no ChatMult (WhatsApp API Meta). Fora do escopo V1.

---

## 4. Solução Proposta (TO-BE)

### 4.1 Descrição da Solução

Plataforma web acessível via browser que:

1. Lê do GestãoClick via API os dados de catálogo (tecidos, componentes, preços, clientes, grupos de produto)
2. Recebe as dimensões do produto e os parâmetros de configuração (tecido, acionamento, etc.)
3. Aplica as regras de cálculo parametrizadas para persianas (7 tipos) e cortinas sob medida — regras armazenadas na própria aplicação, não no GestãoClick
4. Valida restrições de produto (ex: largura máxima do tecido por persiana)
5. Exibe o valor calculado, sem possibilidade de edição manual pelo vendedor
6. Escreve no GestãoClick via API o produto e o orçamento calculado

### 4.2 Fluxo Proposto (TO-BE)

```
Vendedor acessa a plataforma web
        ↓
Clica em "Criar orçamento"
        ↓
Seleciona o tipo: Cortina ou Persiana
        ↓
Preenche os campos do formulário (dimensões, tecido, configurações)
        ↓
Sistema valida restrições (ex: largura máxima do tecido para persiana)
        ↓
Vendedor clica em "Calcular" → resultado aparece na mesma tela
        ↓
Vendedor confirma e envia para o GestãoClick via API
        ↓
GestãoClick recebe produto e orçamento com valor exato
        ↓ (mesmo fluxo atual a partir daqui)
Cliente aprova → orçamento vira venda no GestãoClick
        ↓
Estoque baixado automaticamente com os componentes corretos
```

### 4.3 Ganhos Esperados

| Problema Atual | Ganho com a Plataforma |
|----------------|----------------------|
| Arredondamento inconsistente | Valor exato da calculadora vai direto ao GestãoClick |
| Esquecimento de acessório | Todos os componentes são parametrizados e obrigatórios |
| Redigitação manual | Eliminada pela integração via API |
| Estoque com baixa manual imprecisa | Baixa automática dos componentes calculados |
| Ordem de serviço redigitada | GestãoClick gera o PDF automaticamente após receber o orçamento via API |
| Etiqueta de persiana via Excel | GestãoClick gera a etiqueta após receber os dados via API |
| DecorSoft: custo de ~R$ 400/mês para uso limitado | Cancelamento após validação da nova plataforma |

---

## 5. Escopo

### 5.1 Incluído no Escopo

- Motor de cálculo de persiana com validação de restrições de tecido
- Motor de cálculo de cortinas sob medida (regras extraídas por engenharia reversa no DecorSoft + entrevistas com vendedoras)
- Integração automática com GestãoClick via API
- Baixa automática de estoque dos componentes utilizados no cálculo
- Perfis de acesso: vendedor (sem edição de preço) e administrador (com senha de gerente para ajuste de desconto)
- Geração de PDF (OS e etiquetas): fora do escopo, responsabilidade do GestãoClick
- Operação assistida em paralelo ao DecorSoft durante homologação
- Treinamento dos vendedores e entrega de guia operacional
- Handover formal da plataforma

### 5.2 Fora do Escopo (V1)

- Canal atacado (lojistas revendedores): compra tecidos e peças prontas, sem cálculo sob medida. Previsto para versão futura.
- Portal de revendas: acesso de clientes externos para cálculo de orçamento próprio
- Integração com app de motoristas (app interno Victor): fora do escopo, permanece independente
- Site, e-commerce ou integrações além do GestãoClick
- Módulos de fiscal, NF-e ou financeiro (permanecem no GestãoClick)
- Gestão de histórico de clientes (permanece no GestãoClick)
- Operação comercial e gestão interna após handover
- Manutenção evolutiva após handover (suporte sob demanda, R$ 220/h)

---

## 6. Requisitos Funcionais

### RF-00: Tela de Entrada — Seleção de Tipo de Orçamento

Tela única de entrada com seletor do tipo de produto: **Cortina** ou **Persiana**. Ao selecionar, o formulário correspondente é exibido na mesma tela. O resultado do cálculo aparece abaixo do formulário, na mesma tela, após o clique em "Calcular".

---

### RF-01: Motor de Cálculo de Persiana

**Descrição:** A plataforma deve calcular o valor total de uma persiana com base nas dimensões informadas, no tecido selecionado e na configuração de acionamento.

**Tipos de persiana (7):**

| Código | Tipo | Margem altura | Fórmula produção | Fórmula venda |
|--------|------|--------------|-----------------|---------------|
| 2591 | Rolo Blackout | +0,15m | `[Largura]×([Altura]+0,15)` | `[Dimensão]×([Altura]+0,15)` |
| 2608 | Rolo Translúcido | +0,15m | `[Largura]×([Altura]+0,15)` | `[Dimensão]×([Altura]+0,15)` |
| 2592 | Rolo Screen | +0,15m | `[Largura]×([Altura]+0,15)` | `[Largura]×([Altura]+0,15)×1,3` |
| 2601 | Romana Translúcido | +0,08m | `[Largura]×([Altura]+0,08)` | `[Dimensão]×([Altura]+0,08)×1,2` |
| 2611 | Romana Blackout | +0,08m | `[Largura]×([Altura]+0,08)` | `[Dimensão]×([Altura]+0,08)×1,3` |
| 2612 | Romana Screen | +0,08m | `[Largura]×([Altura]+0,08)` | `[Largura]×([Altura]+0,08)×1,2` |
| 2606 | Double Vision | +0,15m | `[Largura]×([Altura]×2+0,15)` | `[Dimensão]×([Altura]×2+0,15)` |

Variáveis: `[Largura]` = largura real solicitada (produção); `[Dimensão]` = largura do rolo/bobina (venda/cobrança); `[Altura]` = altura. Tipos Screen usam `[Largura]` também na fórmula de venda (não `[Dimensão]`).

**Campos do formulário (confirmados):**

| Campo | Tipo | Observação |
|-------|------|-----------|
| Produto Sob Medida | Seletor | Os 7 tipos de persiana |
| Cor Acessório | Seletor | Branco, Bege, Cinza, Preto. Seleção direta, sem filtro prévio por cor |
| Acionamento | Seletor | Com bandô / Com barra estabilizadora / Motorizado com bandô / Motorizado sem bandô |
| Coleção | Seletor | Filtrado automaticamente pelo tipo selecionado |
| Largura | Numérico (m) | Largura real solicitada pelo cliente |
| Altura | Numérico (m) | |
| TC | Numérico (m) | Preenchido automaticamente com 70% da Altura; editável pelo vendedor |
| Rolamento | Seletor | Dianteiro / Traseiro. Descritivo, aparece na etiqueta |
| Base | Seletor | Cor da base/tampa (Branco, Bege, Cinza, Preto) |
| Mesmo Ambiente | Sim/Não | Flag descritivo para etiqueta; produção puxa tecido do mesmo lote |

Campos do DecorSoft **não incluídos** na nova tela: Acabamento, Largura Bandô, Lateral Bandô, Largura Lateral, Opcional, Observação, UM, Qtd.

`[Dimensão]` não é entrada do usuário: é o atributo `Dimensão` do tecido selecionado (ex.: Blackout → 2,80m). O sistema lê do cadastro do tecido automaticamente ao calcular.

**Outros detalhes:**
- Validação de restrição de largura máxima por tecido: se `[Largura]` exceder a largura do rolo do tecido selecionado, o sistema bloqueia e exibe erro com tecidos compatíveis
- Componentes fixos (por persiana): fita dupla face, fita colante, embalagem, mão de obra, parafuso e bucha (1 a cada 0,5m de largura)
- Componentes condicionais: selecionados por acionamento + cor + faixa de largura (ex: presilhas, tampas, bando, corrente, tubo, motor)
- Base e Tampa: selecionadas pela cor do acessório. Fórmula: rolo → `[Largura]-0,025`; romana → `[Largura]`. Double Vision usa BASE/TAMPA DOUBLE VISION (componente diferente da BASE CÔNICA dos demais tipos). 2 tampas por persiana.
- O orçamento calculado não é salvo localmente; é enviado diretamente ao GestãoClick

### RF-02: Motor de Cálculo de Cortina

**Descrição:** A plataforma deve calcular o valor total de uma cortina sob medida com base nas dimensões, no tecido selecionado e nos acessórios necessários.

**Tipos de cortina (15 ativos, confirmados por Victor):**

| Cód | Tipo |
|-----|------|
| 1 | CORTINA PREGA MACHO |
| 2 | CORTINA EFEITO ILHOS |
| 3 | CORTINA PREGA AMERICANA |
| 4 | CORTINA DE ILHOS |
| 5 | CORTINA FRANZIDA |
| 7 | CORTINA BLACK OUT |
| 10 | CORTINA WAVE 2.4 |
| 11 | CORTINA WAVE 3.4 |
| 12 | CORTINA DE PREGA ITALIANA |
| 13 | CORTINA DE PREGA FÊMEA |
| 14 | CORTINA DE PREGA COM ENTRETELA |
| 15 | CORTINA MOVIMENTO WAVE |
| 16 | CORTINA WAVE 1.8 REGULAR |
| 17 | CORTINA WAVE FACIL 2.4 |
| 18 | CORTINA BRISI BRISI |

> **Atenção:** a base de orçamento do DecorSoft contém também CORTINA WAVE FÁCIL (cód. 24) como ATIVO, que não estava na lista de 15 confirmada por Victor. Confirmar se é o 16º tipo ou duplicata de outro.

Cálculo envolve metragem de tecido, franzido, barra (simples/dupla), argolas/ilhós e inversão de tecido. Regras formais não estão no DecorSoft; são calculadas manualmente pelas vendedoras. Levantamento completo ainda necessário.

**Seção 1 — Cabeçalho (campos confirmados):**

| Campo | Tipo |
|-------|------|
| Modelo da Cortina | Seletor (15 tipos) |
| Largura | Numérico (m) |
| Altura | Numérico (m) |
| Abertura | Seletor | Opções ativas: EM 2 PARTES, EM 3 PARTES, EM 4 PARTES, EM 5 PARTES, EM 6 PARTES, EM 7 PARTES, EM 8 PARTES, INTEIRA, LATERAL, TRESPASSADO, COMANDO A/B/C/D, COMANDO ESQ., COMANDO DIR., LADO A LADO |
| Tipo de Costura | Seletor | Opções a confirmar com Victor |
| Trilho Frontal | Seletor |
| Trilho Traseiro | Seletor |
| Deslizante Frontal | Seletor |
| Deslizante Traseiro | Seletor |
| Suporte | Seletor |
| Final Frontal | Seletor |
| Final Traseiro | Seletor |

**Seção 2 — Cálculo (camadas dinâmicas):**

Cada camada de tecido tem os campos: Tecido, Barra, Dupla, Franzido, Inverter. O vendedor começa com uma camada e adiciona novas via botão "+". Sem limite fixo (o DecorSoft limitava a 3 camadas fixas: Tecido/Forro/Blackout; essa restrição é removida).

Ao final da seção: campo **Instalador** (texto livre).

**Campos do DecorSoft removidos:** Cor do Trilho, Tipo de Trilho, Kit Trilho, Sup. entre Flange, Costureira, Opcional, Observação para Costureira, QTD.

**Demais regras:**
- Cortinas não têm restrição de largura máxima
- O sistema não permite confirmar sem preencher os campos obrigatórios
- Regras de cálculo pendentes de levantamento com vendedoras

### RF-03: Catálogo e Tabelas de Preço

**Descrição:** Os preços e o catálogo de materiais (tecidos, componentes, acessórios) são mantidos no GestãoClick pelo Victor. A plataforma lê esses dados via API; não mantém catálogo local próprio.

**Fluxo de leitura:**
- Ao abrir o formulário de orçamento, a plataforma consulta o GestãoClick para obter tecidos disponíveis (filtrados por grupo/categoria), preços atualizados e dados de cliente
- Atualizações de preço feitas pelo Victor no GestãoClick refletem automaticamente na próxima consulta da plataforma
- A plataforma faz cache das consultas em sessão para respeitar o rate limit da API (3 req/s)

**O que fica na plataforma (não no GestãoClick):**
- Fórmulas de cálculo (produção e venda) por tipo de persiana
- Regras de componentes fixos e condicionais
- Lógica de validação (ex: restrição de largura máxima)
- Lógica de negócio de cortinas (a ser levantada com vendedoras)

### RF-04: Integração com GestãoClick via API

**Descrição:** A integração é bidirecional. A plataforma lê dados do GestãoClick (catálogo, clientes, grupos) e escreve orçamentos calculados.

**Fluxo de leitura (ao abrir formulário):**
1. `GET /api/grupos_produtos` → grupos de tecido por categoria (filtro por tipo de persiana/cortina)
2. `GET /api/produtos` → tecidos do grupo selecionado com preços e dimensão
3. `GET /api/clientes` → busca de cliente para vincular ao orçamento
4. `GET /api/usuarios` e `GET /api/lojas` → dados do vendedor logado

**Fluxo de escrita (ao confirmar orçamento):**
1. Plataforma calcula o valor total com as fórmulas internas
2. Vendedor confirma
3. `POST /api/produtos` → cria produto com nome descritivo, valor_custo e valor_venda calculados
4. `POST /api/orcamentos` → cria orçamento vinculando produto ao cliente, com usuario_id e loja_id
5. GestãoClick retorna ID do orçamento; plataforma exibe confirmação

**Autenticação:** Access Token + Secret Access Token no header de toda requisição.

**Limites:**
- 3 req/s: implementar rate limiting com fila (p-queue)
- 30.000 req/dia por empresa
- GET paginado: máximo 100 registros por página

**Pré-requisito crítico:** upgrade do plano GestãoClick pelo Victor para liberar acesso à API.

### RF-06: Gestão de Acesso e Perfis

**Descrição:** O sistema deve suportar dois perfis de acesso com permissões distintas.

**Perfil Vendedor:**
- Calcula orçamentos e envia para o GestãoClick
- Visualiza o valor calculado, mas não pode alterá-lo
- Pode aplicar desconto até o percentual máximo configurado para seu perfil (regra já parametrizada no GestãoClick; a plataforma deve respeitar esse limite)

**Perfil Administrador:**
- Tudo que o vendedor faz
- Pode aprovar descontos acima do limite do vendedor (equivale à "senha de gerente" do GestãoClick)
- Gerencia tabelas de preço e matérias-primas
- Gerencia catálogo de tecidos e restrições por produto

### RF-06B: Identidade Visual

- Estilo visual semelhante ao GestãoClick (não ao branding da Rainha das Cortinas), conforme preferência do Victor
- Botões de confirmação/salvar: verde; botões de cancelar/excluir: vermelho
- Todos os botões com label em texto (sem ícones isolados)

### RF-07: Catálogo de Tecidos e Produtos

**Descrição:** O catálogo de tecidos e componentes é mantido no GestãoClick. A plataforma não replica esses dados localmente — lê sob demanda via API.

**Tecidos (fonte: GestãoClick):**
- Agrupados por categoria no GestãoClick (ex: "TECIDO BLACKOUT", "ROLO SCREEN")
- Cada tecido tem: nome, `Dimensão` (largura do rolo), preço de custo, preço de venda
- O seletor filtra pelo grupo correspondente ao tipo de persiana selecionado

**Regras de composição (fonte: plataforma):**
- Fórmulas de cálculo e componentes de cada tipo de persiana ficam armazenados na aplicação (replicados do DecorSoft)
- Quando Victor atualiza preços no GestãoClick, a plataforma usa os preços atualizados automaticamente na próxima consulta
- As fórmulas de cálculo só mudam se Victor solicitar alteração à Stratos Lab

---

## 7. Regras de Negócio

### RN-01: Restrição de Largura de Persiana por Tecido

Se a largura solicitada pelo cliente for maior do que a largura máxima do rolo do tecido selecionado, o sistema **bloqueia o cálculo** e exibe mensagem clara de erro, sugerindo os tecidos compatíveis com a dimensão informada.

Exemplo: tecido com rolo de 2,00m não pode ser usado para persiana de 2,20m.

### RN-02: Cálculo de Desperdício de Tecido em Persianas

O tecido é cobrado de forma diferente por família:

- **Tipos Blackout, Translúcido e Double Vision (rolo e romana):** cobrado pela largura do rolo (`[Dimensão]`). Ex.: persiana de 1,50m com rolo de 2,00m — os 0,50m de descarte são cobrados. Fórmula venda usa `[Dimensão]`.
- **Tipos Screen (Rolo Screen e Romana Screen):** cobrado pela largura real (`[Largura]`) com fator multiplicador (×1,3 para rolo, ×1,2 para romana). Não usa `[Dimensão]`.

### RN-03: Cálculo de Altura do Tecido em Persianas

A margem de altura varia por família de persiana:
- Tipos rolo (Blackout, Screen, Translúcido, Double Vision): +0,15m
- Tipos romana (Blackout, Screen, Translúcido): +0,08m

O desperdício lateral (diferença entre largura do rolo e largura da persiana) não é recuperável.

### RN-04: Cálculo do Tamanho do Comando

TC padrão = 70% da altura da persiana. Calculado automaticamente e preenchido no campo TC ao abrir o formulário. O vendedor pode editar o valor manualmente antes de confirmar. O valor final (automático ou editado) é exibido na etiqueta de produção.

### RN-04B: Modelo de Precificação de Persiana

No DecorSoft, o tipo de persiana (ex.: 2591 PERSIANA ROLO BLACKOUT) é um produto "guarda-chuva" com preço placeholder de R$1,00/m². O preço real vem do tecido selecionado (ex.: LINHO DIGITAL BLACKOUT → R$69,00/m²).

Lógica: `Valor = Qtd Venda (m²) × Preço de Venda do tecido`

A nova plataforma deve replicar essa lógica: o tipo de persiana define as fórmulas e componentes; o tecido define o preço por m². O orçamento enviado ao GestãoClick deve usar o valor calculado do tecido, não o placeholder do tipo.

### RN-05: Política de Desconto

O vendedor não pode alterar o preço calculado. Pode apenas aplicar desconto percentual até o limite máximo configurado para seu perfil.

Desconto acima do limite: requer aprovação do administrador (senha de gerente). O GestãoClick já controla essa regra; a plataforma deve respeitar o mesmo critério antes de criar o orçamento no ERP.

### RN-06: Valor Exato no GestãoClick

O valor que o sistema calcula é exatamente o valor enviado ao GestãoClick. Nenhum arredondamento é aplicado pelo vendedor. Arredondamento de centavos: ROUND_HALF_UP, 2 casas decimais (a confirmar com Victor).

### RN-07: Orçamento Prévio vs. Orçamento Final

O fluxo admite dois momentos de orçamento:

1. Orçamento prévio: baseado em medida aproximada fornecida pelo cliente. Pode ser enviado ao GestãoClick como orçamento em aberto.
2. Orçamento final: baseado nas medidas reais coletadas pelo motorista. Atualiza o orçamento existente no GestãoClick ou cria um novo.

A plataforma deve suportar edição de um orçamento já enviado antes de sua conversão em venda.

> **RN-08:** removida intencionalmente do escopo V1.

### RN-09: Não Persistência do Orçamento Descartado

O DecorSoft não salva o orçamento se a venda não for fechada. A nova plataforma pode salvar o histórico de cálculos realizados (para referência do Victor em auditorias de erros), mas esse requisito precisa ser confirmado com Victor no Marco 01.

### RN-10: Tabela de Preços por Tipo de Cliente

- Varejo: clientes finais, preço padrão
- Sob medida: preço do tecido com mão de obra embutida (percentual configurável por tecido)
- Atacado: fora do escopo V1

---

## 8. Integração GestãoClick (API)

### 8.1 Endpoints Utilizados

**Leitura (dados para popular formulário):**

| Endpoint | Finalidade |
|----------|------------|
| `GET /api/grupos_produtos` | Grupos de tecido por categoria (filtro por tipo de persiana/cortina) |
| `GET /api/produtos` | Tecidos do grupo selecionado (nome, dimensão, preço) |
| `GET /api/clientes` | Busca de cliente para vincular ao orçamento |
| `GET /api/usuarios` | Vendedor logado (para atribuição no orçamento) |
| `GET /api/lojas` | Lojas disponíveis (SP e São Bernardo) |
| `GET /api/situacoes_orcamentos` | Situações disponíveis no GestãoClick |

**Escrita (após confirmação do orçamento):**

| Endpoint | Método | Finalidade |
|----------|--------|------------|
| `/api/produtos` | POST | Criar produto com valor calculado |
| `/api/produtos/{id}` | PUT | Editar produto (revisão de orçamento) |
| `/api/orcamentos` | POST | Criar orçamento vinculando produto ao cliente |
| `/api/orcamentos/{id}` | PUT | Editar orçamento existente |

### 8.2 Fluxo de Integração Detalhado

```
1. Plataforma calcula o orçamento (motor interno)
2. Vendedor confirma
3. POST /api/produtos → cria produto com nome descritivo e valor_custo e valor_venda calculados
4. POST /api/orcamentos → cria orçamento com:
   - cliente_id (buscado ou cadastrado)
   - situacao_id (em aberto ou orçamento)
   - produto incluído com valor calculado
   - usuario_id e loja_id conforme vendedor logado
5. GestãoClick retorna ID do orçamento criado
6. Plataforma exibe confirmação e link/referência do orçamento no ERP
7. GestãoClick gera OS, etiqueta e PDF internamente (fora do escopo da plataforma)
```

### 8.3 Campos Personalizados (Custom Fields)

Victor mencionou que o GestãoClick suporta campos extras em produtos. Alguns campos específicos da operação (ex: largura do rolo de tecido) podem precisar ser cadastrados como campos extras no GestãoClick para serem puxados via API.

Definir durante Marco 01 quais campos extras são necessários e se a limitação de campos personalizados da API impacta o fluxo.

### 8.4 Situações de Venda e Impacto no Estoque

| Situação | Baixa Estoque | Lança Financeiro |
|----------|--------------|-----------------|
| Orçamento | Não | Não |
| Venda em aberto | Sim | Não |
| Retirar/Instalar | Sim | Sim |
| Cancelada | Não | Não |

A plataforma envia o orçamento para o GestãoClick. A conversão em venda e a baixa de estoque seguem o fluxo já existente no ERP, operado diretamente pelo vendedor no GestãoClick.

### 8.5 Limitações e Restrições da API

- Máximo 3 req/s: implementar rate limiting no cliente da API
- Credenciais: Access Token + Secret Access Token no header de toda requisição
- ~~Plano GestãoClick atual não inclui API: Victor precisa fazer upgrade antes do desenvolvimento~~ — RESOLVIDO em 11/06/2026. Credenciais ativas.
- GET paginado: máximo 100 registros por página; implementar paginação nas listagens de produtos e clientes

---

## 9. Entregáveis e Critérios de Aceite por Marco

### Marco 01: Kickoff e Desenho

**Entregável:** Documento de regras de negócio e arquitetura de integração  
**Responsável pela aprovação:** Victor Nogueira Pavoni  

**Critérios de aceite:**
- [x] Regras de cálculo de persianas (7 tipos) completamente mapeadas: fórmulas, componentes fixos, componentes condicionais e restrições documentados via extração do DecorSoft
- [ ] Regras de cálculo de cortinas sob medida mapeadas via entrevistas com vendedoras (DecorSoft não possui regras formais para cortinas)
- [ ] Tabelas de preço (varejo e sob medida) documentadas
- [ ] Catálogo de tecidos e restrições por tipo de produto documentado
- [ ] Arquitetura de integração com GestãoClick definida (endpoints, fluxo de dados, campos necessários)
- [x] Credenciais de API do GestãoClick disponibilizadas pelo Victor (upgrade de plano realizado) — CONCLUÍDO em 11/06/2026
- [ ] Aprovação formal do Victor ao final da sessão de kickoff

**Prazo de validação pelo cliente:** 5 dias úteis após recebimento (silêncio = aceite tácito, conforme contrato)

### Marco 02: Construção

**Entregável:** Plataforma web operacional em ambiente de homologação  
**Responsável pela aprovação:** Victor Nogueira Pavoni  

**Critérios de aceite:**
- [ ] Motor de cálculo de persianas funcional com todas as restrições de tecido validadas
- [ ] Motor de cálculo de cortinas funcional com todos os componentes obrigatórios
- [ ] Tabelas de preço carregadas e aplicadas corretamente
- [ ] Integração com GestãoClick funcional: produto e orçamento criados automaticamente com valor correto
- [ ] Gestão de usuários: perfil vendedor e administrador com permissões distintas
- [ ] Interface de administração para atualização de preços de matéria-prima
- [ ] Validação técnica interna concluída pela Stratos Lab antes de envio para homologação

**Prazo de validação pelo cliente:** 5 dias úteis após recebimento

### Marco 03: Homologação

**Entregável:** Plataforma validada em ambiente real  
**Responsável pela aprovação:** Victor Nogueira Pavoni e vendedoras  

**Critérios de aceite:**
- [ ] Testes realizados primeiro com Victor, depois com vendedoras por 2 dias (processo definido no kick-off)
- [ ] Cálculos da plataforma conferidos contra o DecorSoft para os mesmos inputs (persiana)
- [ ] Cálculos de cortina conferidos com a lógica das vendedoras
- [ ] Integração com GestãoClick testada ponta a ponta: orçamento criado, estoque refletido, financeiro correto conforme situação de venda
- [ ] Feedbacks de UX das vendedoras coletados e ajustes finos implementados
- [ ] Nenhum erro crítico de cálculo ou integração pendente
- [ ] Aprovação formal de Victor

**Prazo de validação pelo cliente:** 5 dias úteis após recebimento

### Marco 04: Treinamento e Operação Assistida

**Entregável:** Equipe treinada, guia operacional entregue, handover formal  
**Responsável pelo aceite:** Victor Nogueira Pavoni  

**Critérios de aceite:**
- [ ] Sessão de treinamento realizada com todos os vendedores (SP e São Bernardo)
- [ ] Guia operacional entregue (documento de referência para uso diário)
- [ ] Período de operação assistida concluído em paralelo ao DecorSoft, com estabilidade confirmada
- [ ] Nenhuma divergência crítica identificada durante a operação assistida
- [ ] Handover formal realizado: acessos, documentação técnica, repositório
- [ ] Plataforma em uso exclusivo (DecorSoft pode ser cancelado)
- [ ] Aceite formal de Victor

---

## 10. Plano de Testes e Homologação

### 10.1 Estratégia de Testes

**Fase 1: Testes internos (Stratos Lab)**
- Testes unitários das fórmulas de cálculo para cada tipo de produto
- Testes de integração com a API do GestãoClick (ambiente de homologação)
- Testes de validação de restrições (largura máxima de tecido)
- Testes de limite de requisições da API (rate limiting)

**Fase 2: Homologação com Victor**
- Victor compara 10 orçamentos de persiana calculados na plataforma com os mesmos cálculos no DecorSoft
- Victor verifica se os produtos e orçamentos aparecem corretamente no GestãoClick
- Victor verifica se o estoque foi baixado corretamente

**Fase 3: Homologação com vendedoras (2 dias)**
- Vendedoras usam a plataforma para os orçamentos reais do dia
- Feedbacks de UX coletados (clareza do fluxo, campos, terminologia)
- Erros e inconsistências reportados via WhatsApp ao grupo do projeto

### 10.2 Cenários de Teste (Motor de Cálculo de Persiana)

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| P-01 | Persiana rolô 1,50m x 2,00m, tecido 2,00m, com bandô | Cálculo correto, orçamento criado no GestãoClick com valor exato |
| P-02 | Persiana rolô 2,20m x 2,00m, tecido 2,00m | Sistema bloqueia e exibe erro de largura máxima |
| P-03 | Persiana rolô 2,20m x 2,00m, tecido 2,50m | Cálculo permitido, desperdício de 0,30m embutido |
| P-04 | Persiana motorizada 1,50m x 2,00m | Componente motor adicionado automaticamente |
| P-05 | Persiana sem bandô (com barra estabilizadora) | Componente correto substituído |
| P-06 | Persiana romana (mesmas variações) | Regras de romana aplicadas corretamente |

### 10.3 Cenários de Teste (Motor de Cálculo de Cortina)

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| C-01 | Cortina com todos os acessórios obrigatórios | Cálculo correto, sem campo em branco |
| C-02 | Tentativa de confirmar sem selecionar tecido | Sistema bloqueia e exibe erro |
| C-03 | Cortina com preço sob medida | Mão de obra embutida como percentual do tecido |
| C-04 | Cortina com dimensões atípicas (ex: 4m largura) | Calculada normalmente sem restrição |

### 10.4 Cenários de Teste (Integração GestãoClick)

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| G-01 | Orçamento criado via plataforma | Aparece no GestãoClick com valor exato |
| G-02 | Orçamento editado (medidas revisadas) | Atualização refletida no GestãoClick |
| G-03 | Orçamento convertido em venda "Retirar/Instalar" | Estoque baixado corretamente, financeiro lançado |
| G-04 | Venda cancelada | Nenhuma baixa registrada |
| G-05 | Teste de rate limiting (múltiplas requisições rápidas) | Sistema aguarda sem erro |

### 10.5 Critérios de Go-Live

A plataforma está pronta para uso exclusivo quando:
- Zero erros críticos de cálculo abertos
- Zero erros de integração com o GestãoClick que impeçam a criação de orçamentos
- Victor e ao menos uma vendedora confirmaram usabilidade aceitável

---

## 11. Riscos e Dependências

### 11.1 Riscos

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R-01 | Regras de cálculo de cortina não documentadas, dependentes de engenharia reversa e entrevistas | Alta | Alto | Iniciar mapeamento no Marco 01; priorizar entrevistas com todas as vendedoras antes do desenvolvimento |
| ~~R-02~~ | ~~Victor não faz upgrade do GestãoClick para liberar API~~ | Eliminado | — | RESOLVIDO em 11/06/2026. Upgrade realizado e credenciais obtidas. |
| R-03 | Victor como único decisor e validador; indisponibilidade dele paralisa o projeto | Média | Alto | Canal WhatsApp aberto; Victor confirmou disponibilidade remota após 16h; definir prazo de resposta de 5 dias úteis (conforme contrato) |
| R-04 | Lógica de cálculo de cortina está parcialmente "escondida" no DecorSoft (não acessível sem suporte do fornecedor) | Alta | Médio | Usar orçamento gerado no DecorSoft como referência + entrevistas com vendedoras para reconstrução das fórmulas |
| R-05 | Preços de matéria-prima em alta frequência (ex: poliéster subindo semanalmente com guerra) | Média | Baixo | Interface de atualização de preços deve ser simples e acessível diretamente pelo Victor |
| R-06 | ~~Impressoras de etiqueta~~ | Removido | — | Geração de PDF e etiqueta é responsabilidade do GestãoClick, fora do escopo da plataforma |
| R-07 | Divergência entre regras mapeadas no kickoff e comportamento real observado pelas vendedoras durante homologação | Média | Médio | Processo de homologação em dois tempos (Victor + vendedoras); ciclo rápido de ajuste fino |

### 11.2 Dependências Críticas do Cliente

| # | Dependência | Responsável | Prazo |
|---|-------------|-------------|-------|
| ~~D-01~~ | ~~Upgrade de plano do GestãoClick para liberar API~~ | Victor | CONCLUÍDO em 11/06/2026 |
| ~~D-02~~ | ~~Disponibilização das credenciais de API do GestãoClick~~ | Victor | CONCLUÍDO em 11/06/2026 |
| D-03 | Fornecimento das regras de cálculo de cortinas e persianas (via engenharia reversa + entrevistas) | Victor + vendedoras | Marco 01 |
| D-04 | Disponibilidade das vendedoras para homologação (2 dias) | Victor | Marco 03 |
| D-05 | Manutenção da assinatura do DecorSoft durante a operação assistida | Victor | Marco 04 |

### 11.3 Dependências Técnicas

- API GestãoClick: documentação disponível; limite de 3 req/s e 30.000 req/dia controlado por empresa
- Credenciais GestãoClick: obtidas em 11/06/2026 (upgrade de plano concluído por Victor)
- Geração de PDF (OS e etiqueta): responsabilidade do GestãoClick após receber o orçamento via API. Fora do escopo da plataforma.

---

## 12. Arquitetura Técnica

### 12.1 Visão Geral

A plataforma é uma aplicação web com frontend responsivo (acessível via browser em desktop e tablet), backend com motor de cálculo e módulo de integração com a API do GestãoClick. Geração de PDF, OS e etiquetas é responsabilidade do GestãoClick após receber o orçamento via API (fora do escopo da plataforma).

```
[Vendedor via Browser]
        ↓
[Frontend Web — Interface de Orçamento]
        ↓
[Backend — Motor de Cálculo]
  (regras e fórmulas armazenadas na aplicação)
        ↓
[Módulo de Integração GestãoClick API]
        ↑ leitura: tecidos, preços, grupos, clientes
        ↓ escrita: produto + orçamento calculado
[GestãoClick ERP]
        ↓
[PDF de OS + Etiqueta gerados pelo GestãoClick]
```

### 12.2 Ferramenta de Desenvolvimento

O desenvolvimento será conduzido com Claude Code (Anthropic CLI), ferramenta de desenvolvimento assistido por IA que acelera a implementação sem comprometer a qualidade do código ou a segurança da lógica de negócio.

### 12.3 Infraestrutura

- Hospedagem: por conta da Rainha das Cortinas (conforme contrato, Cláusula 5.1 e Anexo I item 11)
- Stack: a ser definida conforme desenvolvimento (sem restrição contratual de linguagem ou framework)
- Banco de dados: definido no Marco 01 conforme necessidades de persistência identificadas
- Acesso: via browser, sem instalação local necessária para os vendedores

### 12.4 Segurança

- Autenticação por perfil (vendedor / administrador)
- Credenciais da API do GestãoClick armazenadas com segurança no backend (nunca expostas no frontend)
- Dados de clientes e orçamentos sob responsabilidade da Rainha das Cortinas como controladora (LGPD, conforme Cláusula 14 do contrato)

---

## 13. Cronograma e Marcos

**Prazo total:** 30 dias corridos a partir do início efetivo dos serviços  
**Data de assinatura do contrato:** 01/06/2026  
**Início efetivo:** condicionado à quitação do sinal e disponibilização dos acessos necessários  

| Marco | Fase | Entregável | Critério de Início |
|-------|------|------------|-------------------|
| 01 | Kickoff e Desenho | Documento de regras e arquitetura | Contrato assinado + sinal quitado + acessos disponibilizados |
| 02 | Construção | Plataforma em ambiente de homologação | Marco 01 aprovado + credenciais GestãoClick disponíveis |
| 03 | Homologação | Plataforma validada em ambiente real | Marco 02 aprovado |
| 04 | Treinamento e Operação Assistida | Handover formal + equipe treinada | Marco 03 aprovado |

Cada fase tem entregável próprio e validação formal (prazo de 5 dias úteis) antes de avançar.  
Atrasos imputáveis ao cliente suspendem o cronograma automaticamente, sem mora da Stratos Lab (Cláusula 3.3 do contrato).

---

## 14. Condições Comerciais

| Item | Valor |
|------|-------|
| Valor cheio do projeto | R$ 8.580,00 |
| Desconto (7% à vista) | R$ 600,60 |
| **Total à vista** | **R$ 7.979,40** |
| Parcela 1 (sinal, na assinatura) | R$ 3.989,70 |
| Parcela 2 (no handover — Marco 04) | R$ 3.989,70 |
| Tributos (Simples Nacional 6%) | Acrescidos em nota fiscal |
| Suporte pós-entrega | R$ 220,00/h, sob demanda, sem mensalidade |

**Prazo de quitação de cada parcela:** até 7 dias corridos da emissão da respectiva nota fiscal.  
**Infraestrutura e hospedagem:** por conta exclusiva da Rainha das Cortinas.  
**Licenças e APIs de terceiros:** por conta da Rainha das Cortinas (GestãoClick, DecorSoft durante validação).  
**Mudança de escopo:** formalizada por escrito; pode ensejar revisão de prazo e preço.  

---

## 15. Governança e Comunicação

### 15.1 Canal Principal

WhatsApp (grupo existente). Victor disponível todo dia, inclusive remotamente após 16h.

### 15.2 Reuniões

- Sessão de kickoff: obrigatória antes do Marco 02 (levantamento de regras + arquitetura)
- Checkpoints intermediários: conforme necessidade, via WhatsApp ou reunião remota
- Sessão de homologação com vendedoras: presencial ou remota, duração de 2 dias
- Sessão de treinamento: presencial preferencial, com todos os vendedores

### 15.3 Fluxo de Aprovação de Entregas

1. Stratos Lab entrega o artefato (documento, ambiente, produto)
2. Victor tem 5 dias úteis para: aprovar expressamente, rejeitar com justificativa objetiva ou solicitar ajustes vinculados ao escopo
3. Silêncio no prazo = aceite tácito (Cláusula 9.4 do contrato)
4. Ajustes por desconformidade com escopo: realizados sem custo adicional
5. Solicitações fora do escopo original: tratadas como mudança de escopo (aditivo)

### 15.4 Reporte de Bugs e Ajustes Durante Operação Assistida

Via WhatsApp do grupo do projeto. Victor centraliza e prioriza os feedbacks das vendedoras antes de encaminhar à Stratos Lab.

---

## 16. Virada Operacional e Desligamento do DecorSoft

### 16.1 Estratégia de Transição

A virada operacional é gradual, sem corte abrupto:

1. Durante Marco 03 (homologação): a plataforma roda em paralelo ao DecorSoft por até 2 dias com as vendedoras
2. Durante Marco 04 (operação assistida): a plataforma é usada como principal, com o DecorSoft mantido como backup
3. Ao final do Marco 04: Victor confirma a estabilidade e realiza o handover formal
4. Após o handover: Victor cancela o DecorSoft

### 16.2 Critérios para Desligamento do DecorSoft

- Calculadora de persianas da plataforma replicando 100% das regras e restrições do DecorSoft, com resultados validados por Victor
- Calculadora de cortinas funcional e validada pelas vendedoras
- Integração com GestãoClick estável (sem erros de envio nos últimos dias de operação assistida)

### 16.3 Quem Dá o Aceite Final

Victor Nogueira Pavoni, único decisor técnico identificado. Ele parametrizou o DecorSoft e é o validador final de todos os cálculos.

### 16.4 Histórico do DecorSoft

Victor confirmou que não há necessidade de migrar histórico do DecorSoft. O sistema é usado como calculadora descartável: o orçamento é calculado e descartado após copiar o valor. Não há histórico relevante para importar.

---

## Apêndice A: Referências e Acessos

| Item | Detalhe |
|------|---------|
| API GestãoClick | Documentação disponível; credenciais obtidas em 11/06/2026 (upgrade de plano concluído por Victor) |
| DecorSoft | Acesso de administrador fornecido pelo Victor para engenharia reversa das regras |
| GestãoClick | Acesso de administrador disponibilizado pelo Victor para entendimento dos módulos e configurações |
| App interno de motoristas | Não integrado a este projeto |
| WhatsApp grupo do projeto | Canal principal de comunicação |

## Apêndice B: Glossário

| Termo | Definição |
|-------|-----------|
| Persiana rolo | Persiana enrolável (Blackout, Screen, Translúcido). Margem de altura: +0,15m |
| Persiana romana | Persiana com pregas horizontais (Blackout, Screen, Translúcido). Margem de altura: +0,08m |
| Double Vision | Persiana rolo com camada dupla de tecido; altura no cálculo é multiplicada por 2 antes de aplicar a margem |
| Persiana motorizada | Qualquer tipo de persiana com motor elétrico; requer ponto de energia |
| Bandô | Acabamento frontal da persiana que cobre o mecanismo de enrolamento |
| Barra estabilizadora | Alternativa ao bandô, sem acabamento frontal |
| `[Largura]` | Largura real da persiana solicitada pelo cliente (metros). Usada na produção |
| `[Dimensão]` | Largura do rolo/bobina do tecido (metros). Usada na fórmula de venda/cobrança. Tipos Screen usam `[Largura]` também na venda |
| `[Altura]` | Altura da persiana (metros) |
| TC (Tamanho do Comando) | Comprimento do acionamento por corrente. Padrão: 70% da altura, editável pelo vendedor |
| Rolamento | Direção de enrolamento da persiana (dianteiro/traseiro). Campo descritivo, aparece na etiqueta |
| Mesmo ambiente | Flag descritiva indicando que peças do mesmo pedido devem usar tecido do mesmo lote/rolo |
| Componentes fixos | Componentes incluídos em todo pedido do tipo (fita, embalagem, mão de obra, parafuso e bucha) |
| Componentes condicionais | Componentes selecionados automaticamente por acionamento + cor + faixa de largura (ex: presilhas, tampas, bando, corrente, tubo, motor) |
| Produto composto | Produto no DecorSoft composto por múltiplos componentes com regras de cálculo parametrizadas |
| Sob medida | Tabela de preço que inclui mão de obra embutida como percentual do tecido; aplicável apenas a tecidos no varejo |
| Atacado | Canal de venda para lojistas revendedores. Fora do escopo V1 |
| GestãoClick | ERP principal da Rainha das Cortinas (orçamento, vendas, estoque, financeiro, fiscal) |
| DecorSoft | Calculadora de persianas. Será descontinuado após a virada |
| Handover | Entrega formal da plataforma ao cliente, incluindo acessos, documentação e transferência de responsabilidade operacional |

---

*Documento elaborado pela Stratos Lab com base no kick-off realizado com Victor Nogueira Pavoni (Rainha das Cortinas), transcrições da reunião, proposta comercial de 21/05/2026 e contrato assinado em 01/06/2026.*

*Uso interno — Stratos Lab (PH Figueiredo + Antonio Figueiredo)*