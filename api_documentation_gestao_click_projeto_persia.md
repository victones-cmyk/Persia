# API Gestão Click

## Introdução

A integração via API é uma solução utilizada na integração de sistemas e na comunicação entre aplicações diferentes. Com esta tecnologia é possível que novas aplicações possam interagir com aquelas que já existem e que sistemas desenvolvidos em plataformas diferentes sejam compatíveis. Desta forma é possível integrar nosso sistema com diversos outros aplicativos, sendo assim, os dados integrados ficaram na nuvem e você terá a possibilidade de alterar, selecionar e excluir quando quiser.

---

## Autenticação

Para que você possa acessar a API, você deve possuir uma conta e gerar o código de Access Token e o Secret Access Token da aplicação que você usará. Você deverá enviar estas informações nos parâmetros HEADER toda vez que acessar uma URL da API.

Exemplo de parâmetros de paginação:

- `&pagina=10`
- `&ordenacao=nome`
- `&direcao=desc`

---

## Limite de Requisições

As chamadas à nossa API são limitadas a no máximo 3 requisições por segundo e no máximo 30.000 requisições por dia. Esse limite é controlado por empresa.

Caso seja ultrapassado o limite, a requisição retornará o status 429 (too many requests) e a mensagem: *O limite de requisições foi atingido.*

---

## Limites de Registros

Todas as requisições GET são limitadas por página com no máximo 100 registros cada.

---

## Atribuição de Usuário

Para clientes que possuem mais de um usuário cadastrado no sistema, deve se usar o campo `usuario_id` como parâmetro de atribuição. Caso este parâmetro não seja informado, a API irá priorizar o usuário master do sistema.

*Para conhecer os ids dos **usuários**, faça um GET em /api/usuarios/*

---

## Atribuição de Loja

Para clientes que possuem mais de uma loja cadastrada no sistema, deve se usar o campo `loja_id` no tipo de envio GET ou POST como parâmetro de atribuição. Caso este parâmetro não seja informado, a API irá priorizar a loja matriz ou a loja que o usuário tenha permissão de acesso.

*Para conhecer os ids das **lojas**, faça um GET em /api/lojas/*

---

## Clientes

### Listar

**Filtros disponíveis:**

- `tipo_pessoa` (PF = pessoa física, PJ = pessoa jurídica, ES = Estrangeiro)
- `nome` (string)
- `cpf_cnpj` (string)
- `telefone` (string)
- `email` (string)
- `situacao` (1 = ativo, 0 = inativo)
- `cidade_id` (int) — *Para conhecer os ids das **cidades**, faça um GET em /api/cidades/*
- `estado` (string) — *Ao buscar por estado utilizar as siglas (MG, SP, RJ, RR...)*

### Cadastrar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ ou ES
- `nome` (string)

**Atribuição de usuário:**

- `usuario_id` — *Para conhecer os ids dos **usuários**, faça um GET em /api/usuarios/* — Caso este parâmetro não seja informado, a API irá priorizar o usuário master do sistema.

**Atribuição de loja:**

- `loja_id` — *Para conhecer os ids das **lojas**, faça um GET em /api/lojas/* — Caso este parâmetro não seja informado, a API irá priorizar a loja matriz ou a loja que o usuário tenha permissão de acesso.

### Visualizar

Lista os dados de um cliente específico. Basta acrescentar o parâmetro com o id do cliente.

### Editar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ ou ES
- `nome` (string)

### Deletar

Exclui um cliente específico. Basta acrescentar o parâmetro com o id do cliente.

---

## Fornecedores

### Listar

**Filtros disponíveis:**

- `tipo_pessoa` (PF = pessoa física, PJ = pessoa jurídica, ES = Estrangeiro)
- `nome` (string)
- `cpf_cnpj` (string)
- `telefone` (string)
- `email` (string)
- `situacao` (1 = ativo, 0 = inativo)
- `cidade_id` (int) — *Para conhecer os ids das **cidades**, faça um GET em /api/cidades/*
- `estado` (string) — *Ao buscar por estado utilizar as siglas (MG, SP, RJ, RR...)*

### Cadastrar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ ou ES
- `nome` (string)

### Visualizar

Lista os dados de um fornecedor específico. Basta acrescentar o parâmetro com o id do fornecedor.

### Editar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ ou ES
- `nome` (string)

### Deletar

Exclui um fornecedor específico. Basta acrescentar o parâmetro com o id do fornecedor.

---

## Funcionários

### Listar

**Filtros disponíveis:**

- `nome` (string)

---

## Campos Extras de Cadastros

### Listar

Lista campos extras de clientes, fornecedores e funcionários.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Transportadoras

### Listar

**Filtros disponíveis:**

- `tipo_pessoa` (PF = pessoa física, PJ = pessoa jurídica)
- `nome` (string)
- `telefone` (string)
- `email` (string)

### Cadastrar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ
- `nome` (string)

### Visualizar

Lista os dados de uma transportadora específica. Basta acrescentar o parâmetro com o id da transportadora.

### Editar

**Campos obrigatórios:**

- `tipo_pessoa` (string) — PF, PJ
- `nome` (string)

### Deletar

Exclui uma transportadora específica. Basta acrescentar o parâmetro com o id da transportadora.

---

## Tipos de Contatos

### Listar

---

## Tipos de Endereços

### Listar

---

## Estados

### Listar

---

## Cidades

### Listar

**Filtros disponíveis:**

- `estado_id` (int) — *Para conhecer os ids dos **estados**, faça um GET em /api/estados/*

---

## Produtos

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `nome` (string)
- `codigo` (string)
- `grupo_id` (int) — *Para conhecer os ids dos **grupos de produtos**, faça um GET em /api/grupos_produtos/*
- `fornecedor_id` (int) — *Para conhecer os ids dos **fornecedores**, faça um GET em /api/fornecedores/*
- `ativo` (1 = sim, 0 = não)

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `codigo_interno` (string)
- `valor_custo` (float)

### Visualizar

Lista os dados de um produto específico. Basta acrescentar o parâmetro com o id do produto.

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `codigo_interno` (string)
- `valor_custo` (float)

**Orientações:**

- Para definir os valores de venda por tipo, basta fornecer um array com os valores, incluindo os campos `tipo_id` e `valor_venda`. Se os dados de valores não forem informados, os valores de venda permanecerão inalterados.

### Deletar

---

## Grupos de Produtos

### Listar

Listagem dos grupos de produtos.

---

## Campos Extras de Produtos

### Listar

Lista campos extras de produtos e serviços.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Serviços

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `nome` (string)
- `valor_inicio` (float)
- `valor_fim` (float)

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `codigo` (string)

### Visualizar

Lista os dados de um serviço específico. Basta acrescentar o parâmetro com o id do serviço.

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `codigo` (string)

### Deletar

---

## Orçamentos

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `tipo` (tipo = produto, tipo = servico)
- `codigo` (int)
- `nome` (string)
- `situacao_id` (int) — *Para conhecer os ids das **situações de orçamentos**, faça um GET em /api/situacoes_orcamentos/*
- `data_inicio` — Orçamentos que estão configurados com a data a partir do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_inicio=2020-01-01).
- `data_fim` — Orçamentos que estão configurados com a data a até do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_fim=2020-01-31).
- `cliente_id` (int) — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*

### Cadastrar

**Campos obrigatórios:**

- `tipo` (tipo = produto, tipo = servico — caso não seja informado será passado tipo=produto)
- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

Podem ser registrados dois tipos de orçamentos: Orçamentos de produtos e Orçamentos de serviços. Para isso basta especificar o campo `tipo`.

**Gerar parcelas automaticamente:**

Para gerar parcelas automaticamente basta substituir o parâmetro pagamentos (array) pelos campos abaixo:

- `forma_pagamento_id` (int) — Obrigatório
- `numero_parcelas` (int) — Obrigatório
- `intervalo_dias` (int) — Opcional. Caso não seja informado irá considerar o intervalo de dias da forma_pagamento_id configurado no sistema.
- `data_primeira_parcela` (date) — Opcional. Caso não seja informado irá pegar a data do orçamento + dias da 1ª parcela da forma_pagamento_id configurado no sistema.

### Visualizar

Lista os dados de um orçamento específico. Basta acrescentar o parâmetro com o id da venda.

### Editar

**Campos obrigatórios:**

- `tipo` (tipo = produto, tipo = servico — caso não seja informado será passado tipo=produto)
- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

### Deletar

Exclui um orçamento específico. Basta acrescentar o parâmetro com o id do orçamento.

### Gerar Parcelas

**Campos obrigatórios:**

- `valor_total` (float)
- `forma_pagamento_id` (int)
- `numero_parcelas` (int)

---

## Situações de Orçamentos

Valores para o campo `tipo_lancamento`:

| Valor | Descrição |
|-------|-----------|
| 0 | Não lança |
| 1 | Lança estoque e financeiro |
| 2 | Lança somente estoque |
| 3 | Lança somente financeiro |

### Listar

---

## Campos Extras de Orçamentos

### Listar

Lista campos extras de orçamentos.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Vendas

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `tipo` (tipo = produto, tipo = servico, tipo = vendas_balcao)
- `codigo` (int)
- `nome` (string)
- `situacao_id` (int) — *Para conhecer os ids das **situações de vendas**, faça um GET em /api/situacoes_vendas/*
- `data_inicio` — Vendas que estão configuradas com a data a partir do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_inicio=2020-01-01).
- `data_fim` — Vendas que estão configuradas com a data a até do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_fim=2020-01-31).
- `cliente_id` (int) — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*

### Cadastrar

**Campos obrigatórios:**

- `tipo` (tipo = produto, tipo = servico — caso não seja informado será passado tipo=produto)
- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

Podem ser registrados dois tipos de vendas: Vendas de produtos e Vendas de serviços. Para isso basta especificar o campo `tipo`.

**Gerar parcelas automaticamente:**

Para gerar parcelas automaticamente basta substituir o parâmetro pagamentos (array) pelos campos abaixo:

- `forma_pagamento_id` (int) — Obrigatório
- `numero_parcelas` (int) — Obrigatório
- `intervalo_dias` (int) — Opcional. Caso não seja informado irá considerar o intervalo de dias da forma_pagamento_id configurado no sistema.
- `data_primeira_parcela` (date) — Opcional. Caso não seja informado irá pegar a data da venda + dias da 1ª parcela da forma_pagamento_id configurado no sistema.
- `plano_contas_id` (int) — Opcional. Plano de contas.

### Visualizar

Lista os dados de uma venda específica. Basta acrescentar o parâmetro com o id da venda.

### Editar

**Campos obrigatórios:**

- `tipo` (tipo = produto, tipo = servico — caso não seja informado será passado tipo=produto)
- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

### Deletar

Exclui uma venda específica. Basta acrescentar o parâmetro com o id da venda.

### Gerar Parcelas

**Campos obrigatórios:**

- `valor_total` (float)
- `forma_pagamento_id` (int)
- `numero_parcelas` (int)

---

## Situações de Vendas

Valores para o campo `tipo_lancamento`:

| Valor | Descrição |
|-------|-----------|
| 0 | Não lança |
| 1 | Lança estoque e financeiro |
| 2 | Lança somente estoque |
| 3 | Lança somente financeiro |

### Listar

---

## Campos Extras Vendas

### Listar

Lista campos extras de vendas.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Ordens de Serviços

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `codigo` (int)
- `nome` (string)
- `situacao_id` (int) — *Para conhecer os ids das **situações de ordens de serviços**, faça um GET em /api/situacoes_ordens_servicos/*
- `data_inicio` — Ordens de serviços que estão configuradas com a data a partir do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_inicio=2020-01-01).
- `data_fim` — Ordens de serviços que estão configuradas com a data a até do filtro especificado. A data deve estar no formato AAAA-MM-DD (ex: ?data_fim=2020-01-31).
- `cliente_id` (int) — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*

### Cadastrar

**Campos obrigatórios:**

- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

**Gerar parcelas automaticamente:**

Para gerar parcelas automaticamente basta substituir o parâmetro pagamentos (array) pelos campos abaixo:

- `forma_pagamento_id` (int) — Obrigatório
- `numero_parcelas` (int) — Obrigatório
- `intervalo_dias` (int) — Opcional. Caso não seja informado irá considerar o intervalo de dias da forma_pagamento_id configurado no sistema.
- `data_primeira_parcela` (date) — Opcional. Caso não seja informado irá pegar a data da OS + dias da 1ª parcela da forma_pagamento_id configurado no sistema.

### Visualizar

Lista os dados de uma venda específica. Basta acrescentar o parâmetro com o id da venda.

### Editar

**Campos obrigatórios:**

- `tipo` (tipo = produto, tipo = servico — caso não seja informado será passado tipo=produto)
- `codigo` (int)
- `cliente_id` (int)
- `situacao_id` (int)
- `data` (date)

**Informações adicionais:**

- O campo `condicao_pagamento` deverá ser preenchido com os valores: 'a_vista' ou 'parcelado'.
- O campo `tipo_desconto` deverá ser preenchido com os valores: 'R$' ou '%'.

### Deletar

Exclui uma OS específica. Basta acrescentar o parâmetro com o id da OS.

### Gerar Parcelas

**Campos obrigatórios:**

- `valor_total` (float)
- `forma_pagamento_id` (int)
- `numero_parcelas` (int)

---

## Situações de OS

### Listar

---

## Campos Extras Ordens de Serviço

### Listar

Lista campos extras de ordens de serviço.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `exibir_impressao` (string) — Opções: "Sim", "Não" ou "Quando preenchido"
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Compras

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `codigo` (int)
- `situacao_id` (int) — *Para conhecer os ids das **situações de compras**, faça um GET em /api/situacoes_compras/*
- `fornecedor_id` (int) — *Para conhecer os ids dos **fornecedores**, faça um GET em /api/fornecedores/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*

### Cadastrar

**Campos obrigatórios:**

- `codigo` (int)
- `fornecedor_id` (int)
- `situacao_id` (int)
- `data` (date)

**Gerar parcelas automaticamente:**

Para gerar parcelas automaticamente basta substituir o parâmetro pagamentos (array) pelos campos abaixo:

- `forma_pagamento_id` (int) — Obrigatório
- `numero_parcelas` (int) — Obrigatório
- `intervalo_dias` (int) — Opcional. Caso não seja informado irá considerar o intervalo de dias da forma_pagamento_id configurado no sistema.
- `data_primeira_parcela` (date) — Opcional. Caso não seja informado irá pegar a data da compra + dias da 1ª parcela da forma_pagamento_id configurado no sistema.
- `plano_contas_id` (int) — Opcional. Plano de contas.

### Visualizar

Lista os dados de uma compra específica. Basta acrescentar o parâmetro com o id da compra.

### Editar

**Campos obrigatórios:**

- `codigo` (int)
- `fornecedor_id` (int)
- `situacao_id` (int)
- `data` (date)

### Deletar

Exclui uma compra específica. Basta acrescentar o parâmetro com o id da compra.

### Gerar Parcelas

**Campos obrigatórios:**

- `valor_total` (float)
- `numero_parcelas` (int)

---

## Situações de Compras

Valores para o campo `tipo_lancamento`:

| Valor | Descrição |
|-------|-----------|
| 0 | Não lança |
| 1 | Lança estoque e financeiro |
| 2 | Lança somente estoque |
| 3 | Lança somente financeiro |

### Listar

---

## Notas Fiscais de Produtos

### Listar

Listagem de notas fiscais de produtos.

> **Dados do emitente:** Os dados do emitente só são exibidos após a emissão da NF-e.

### Cadastrar

**Orientações e requisitos:**

Para cadastrar uma NF-e via API, é necessário que as naturezas de operação estejam previamente padronizadas conforme os tipos definidos pelo sistema: Venda, Venda para não contribuinte, Venda para contribuinte, Cupom Fiscal ou Compra. Essa padronização pode ser realizada na configuração de Natureza de Operação.

**Campos obrigatórios:**

- `loja_id` (int)
- `tipo_nf` (int)
- `id_destinatario/id_fornecedor` (int)
- `produtos` (array)

**Atribuição de cliente:**

- `id_destinatario` — *Para obter os ids dos **clientes**, faça um GET em /api/clientes/*

**Atribuição de fornecedor:**

- `id_fornecedor` — *Para obter os ids dos **fornecedores**, faça um GET em /api/fornecedores/*

**Tipo de nota fiscal:**

- `tipo_nf` (0 = Entrada, 1 = Saída) — Para cadastrar e emitir uma NF-e de Entrada via API, é obrigatório que exista uma natureza de operação padronizada como Compra no sistema. Essa configuração pode ser feita na tela de Naturezas de Operação.

**Tipo de atendimento:**

- `tipo_atendimento`:
  - 0 — Não se aplica
  - 1 — Operação presencial
  - 2 — Operação não presencial, pela Internet
  - 3 — Operação não presencial, Teleatendimento
  - 9 — Operação não presencial, outros

**Atribuição de campos dos produtos:**

- `produto_id` (int)
- `variacao_id` (int) — Opcional
- `codigo_produto` (string)
- `nome_produto` (string)
- `unidade` (string)
- `quantidade` (int)
- `valor_venda` (int)
- `valor_custo` (int)
- `NCM` (string) — Ao informar o produto_id, os dados do produto serão preenchidos automaticamente. É possível, porém, substituir esses valores informando manualmente os respectivos campos no payload.

**Atribuição de variação:**

- `variacao_id` — *Para obter os ids das **variações** de um produto, faça um GET em /api/produtos/. O campo correspondente é variacao_api_id.*

**Atribuição de forma de pagamento:**

- `pagamento` (array)
- `forma_pagamento_id` (int)
- `valor_pagamento` (int)
- `data_vencimento` (string)
- `codigo_autorizacao` (string) — Caso queira informar os dados de forma de pagamento na nota fiscal, basta informar o array de pagamento e dentro de pagamento, informe a forma_pagamento_id e valor_pagamento.

**Emissão automática:**

Caso queira que uma NF-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Visualizar

Lista os dados de uma NF-e específica. Basta acrescentar o parâmetro com o id da NF-e.

> **Dados do emitente:** Os dados do emitente só são exibidos após a emissão da NF-e.

### Editar

**Orientações e requisitos:**

Para editar uma NF-e via API, é necessário que as naturezas de operação estejam previamente padronizadas conforme os tipos definidos pelo sistema: Venda, Venda para não contribuinte, Venda para contribuinte, Cupom Fiscal ou Compra.

**Campos obrigatórios:**

- `loja_id` (int)
- `tipo_nf` (int)
- `id_destinatario/id_fornecedor` (int)
- `produtos` (array)

*(Os demais campos seguem o mesmo padrão do Cadastrar)*

**Emissão automática:**

Caso queira que uma NF-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Deletar

Exclui uma NF-e específica. Basta acrescentar o parâmetro com o id do NF-e.

### Emitir

Envia o comando de emissão para uma NF-e específica. Basta acrescentar o parâmetro com o id do NF-e.

### Cancelar

Envia o comando de cancelamento para uma NF-e específica. Basta acrescentar o parâmetro com o id do NF-e e informar o motivo no body de requisição.

**Motivos de cancelamento:**

- `motivo` (string) — Informe o campo motivo e insira o motivo de cancelamento. O limite máximo de caracteres para o campo de motivo de cancelamento de uma NF-e é de 200 caracteres.

---

## Notas Fiscais de Consumidores

### Listar

Listagem de notas fiscais de consumidores.

### Cadastrar

**Orientações e requisitos:**

Para cadastrar uma NFC-e via API, é necessário que as naturezas de operação estejam previamente padronizadas conforme os tipos definidos pelo sistema: Venda, Venda para não contribuinte, Venda para contribuinte ou Cupom Fiscal.

**Campos obrigatórios:**

- `loja_id` (int)
- `produtos` (array)
- `pagamento` (array)

**Tipo de atendimento:**

- `tipo_atendimento` (1 = Operação presencial, 4 = NFC-e em operação com entrega a domicílio) — Caso não informe o tipo_atendimento, por padrão será 1 (Operação presencial).

**Atribuição de cliente:**

- `id_destinatario` — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*

**Atribuição de campos dos produtos:**

- `produto_id` (int)
- `variacao_id` (int) — Opcional
- `codigo_produto` (string)
- `nome_produto` (string)
- `unidade` (string)
- `quantidade` (int)
- `valor_venda` (int)
- `valor_custo` (int)
- `NCM` (string)

**Atribuição de variação:**

- `variacao_id` — *Para obter os ids das **variações** de um produto, faça um GET em /api/produtos/. O campo correspondente é variacao_api_id.*

**Atribuição de forma de pagamento:**

- `pagamento` (array)
- `forma_pagamento_id` (int)
- `valor_pagamento` (int)
- `data_vencimento` (string)
- `codigo_autorizacao` (string)

**Emissão automática:**

Caso queira que uma NFC-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Visualizar

Lista os dados de uma NFC-e específica. Basta acrescentar o parâmetro com o id da NFC-e.

### Editar

*(Os campos obrigatórios e atribuições seguem o mesmo padrão do Cadastrar)*

**Emissão automática:**

Caso queira que uma NFC-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Deletar

Exclui uma NFC-e específica. Basta acrescentar o parâmetro com o id do NFC-e.

### Emitir

Envia o comando de emissão para uma NFC-e específica. Basta acrescentar o parâmetro com o id do NFC-e.

### Cancelar

Envia o comando de cancelamento para uma NFC-e específica. Basta acrescentar o parâmetro com o id do NFC-e e informar o motivo no body de requisição.

**Motivos de cancelamento:**

- `motivo` (string) — O limite máximo de caracteres para o campo de motivo de cancelamento de uma NFC-e é de 200 caracteres.

---

## Notas Fiscais de Serviços

### Listar

Listagem de notas fiscais de serviços.

### Cadastrar

**Campos obrigatórios:**

- `destinatario_id_cliente` (int)
- `valor_servico` (string)
- `codigo_atividade` (string)
- `codigo_natureza_operacao` (string)
- `iss_retido` (int)
- `cidade_incidencia_issqn` (string)
- `estado_incidencia_issqn` (string)
- `descricao` (string)

**Atribuição de cliente:**

- `destinatario_id_cliente` — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*

**Retenção de ISS:**

Para reter o ISS, basta informar `iss_retido = 1`. Para não reter, basta informar `iss_retido = 0`.

**Construção civil:**

- `construcao_civil` (int)
- `codigo_obra` (string)
- `codigo_art` (string) — Para emitir uma NFS-e para construção civil, basta informar `construcao_civil = 1` e informar os campos codigo_obra e codigo_art.

**Emissão automática:**

Caso queira que uma NFS-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Visualizar

Lista os dados de uma NFS-e específica. Basta acrescentar o parâmetro com o id da NFS-e.

### Editar

*(Os campos obrigatórios seguem o mesmo padrão do Cadastrar)*

**Emissão automática:**

Caso queira que uma NFS-e seja emitida automaticamente após o cadastro, basta informar `envio_automatico = 1` no body da requisição.

### Deletar

Exclui uma NFS-e específica. Basta acrescentar o parâmetro com o id do NFS-e.

### Emitir

Envia o comando de emissão para uma NFS-e específica. Basta acrescentar o parâmetro com o id do NFS-e.

### Cancelar

Envia o comando de cancelamento para uma NFS-e específica. Basta acrescentar o parâmetro com o id do NFS-e e informar o motivo no body de requisição.

**Motivos de cancelamento:**

- `motivo` (1 = Erro na Emissão, 2 = Serviço não concluído)

---

## Pagamentos

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `codigo` (int)
- `nome` (string)
- `cliente_id` (int) — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*
- `fornecedor_id` (int) — *Para conhecer os ids dos **fornecedores**, faça um GET em /api/fornecedores/*
- `transportadora_id` (int) — *Para conhecer os ids das **transportadoras**, faça um GET em /api/transportadoras/*
- `funcionario_id` (int) — *Para conhecer os ids dos **funcionários**, faça um GET em /api/funcionarios/*
- `data_inicio` (string)
- `data_fim` (string)
- `valor_inicio` (float)
- `valor_fim` (float)
- `liquidado` (ab = Em aberto, at = Em atraso, pg = Confirmado)
- `plano_contas_id` (int) — *Para conhecer os ids dos **planos de contas**, faça um GET em /api/planos_contas/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*
- `conta_bancaria_id` (int) — *Para conhecer os ids das **contas bancárias**, faça um GET em /api/contas_bancarias/*
- `forma_pagamento_id` (int) — *Para conhecer os ids das **formas de pagamentos**, faça um GET em /api/formas_pagamentos/*

### Cadastrar

**Campos obrigatórios:**

- `descricao` (string)
- `data_vencimento` (date)
- `plano_contas_id` (int)
- `forma_pagamento_id` (int)
- `conta_bancaria_id` (int)
- `valor` (float)
- `data_competencia` (date)

> Ao cadastrar é retornado o campo `valor_total` (valor + juros - desconto).

### Visualizar

Lista os dados de um pagamento específico. Basta acrescentar o parâmetro com o id do pagamento.

### Editar

**Campos obrigatórios:**

- `descricao` (string)
- `data_vencimento` (date)
- `plano_contas_id` (int)
- `forma_pagamento_id` (int)
- `conta_bancaria_id` (int)
- `valor` (float)
- `data_competencia` (date)

> Ao cadastrar é retornado o campo `valor_total` (valor + juros - desconto).

### Deletar

Exclui um pagamento específico. Basta acrescentar o parâmetro com o id do pagamento.

---

## Recebimentos

### Listar

**Filtros disponíveis:**

- `loja_id` (int) — Para conhecer os ids das lojas, faça um GET em /api/lojas/
- `codigo` (int)
- `nome` (string)
- `cliente_id` (int) — *Para conhecer os ids dos **clientes**, faça um GET em /api/clientes/*
- `fornecedor_id` (int) — *Para conhecer os ids dos **fornecedores**, faça um GET em /api/fornecedores/*
- `transportadora_id` (int) — *Para conhecer os ids das **transportadoras**, faça um GET em /api/transportadoras/*
- `funcionario_id` (int) — *Para conhecer os ids dos **funcionários**, faça um GET em /api/funcionarios/*
- `data_inicio` (string)
- `data_fim` (string)
- `valor_inicio` (float)
- `valor_fim` (float)
- `liquidado` (ab = Em aberto, at = Em atraso, pg = Confirmado)
- `plano_contas_id` (int) — *Para conhecer os ids dos **planos de contas**, faça um GET em /api/planos_contas/*
- `centro_custo_id` (int) — *Para conhecer os ids dos **centros de custos**, faça um GET em /api/centros_custos/*
- `conta_bancaria_id` (int) — *Para conhecer os ids das **contas bancárias**, faça um GET em /api/contas_bancarias/*
- `forma_pagamento_id` (int) — *Para conhecer os ids das **formas de pagamentos**, faça um GET em /api/formas_pagamentos/*
- `limit` (int) — Limite de resultados por página.

### Cadastrar

**Campos obrigatórios:**

- `descricao` (string)
- `data_vencimento` (date)
- `plano_contas_id` (int)
- `forma_pagamento_id` (int)
- `conta_bancaria_id` (int)
- `valor` (float)
- `data_competencia` (date)

### Visualizar

Lista os dados de um recebimento específico. Basta acrescentar o parâmetro com o id do recebimento.

### Editar

**Campos obrigatórios:**

- `descricao` (string)
- `data_vencimento` (date)
- `plano_contas_id` (int)
- `forma_pagamento_id` (int)
- `conta_bancaria_id` (int)
- `valor` (float)
- `data_competencia` (date)

### Deletar

Exclui um recebimento específico. Basta acrescentar o parâmetro com o id do recebimento.

---

## Campos Extras Financeiros

### Listar

Lista os campos extras de recebimentos e pagamentos.

### Cadastrar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Editar

**Campos obrigatórios:**

- `nome` (string)
- `tipo` (string) — Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples
- `opcoes*` (array) — Obrigatório nos campos extras do tipo "check_list"

### Visualizar

Visualiza um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

### Deletar

Exclui um campo extra específico. Basta acrescentar o parâmetro com o id do campo extra.

---

## Formas de Pagamentos

### Listar

Listagem de formas de pagamentos.

---

## Contas Bancárias

### Listar

Listagem de contas bancárias.

---

## Planos de Contas

### Listar

**Filtros disponíveis:**

- `tipo` (D = Débito, C = Crédito)

---

## Centros de Custos

### Listar

Listagem dos centros de custos.

---

## Usuários

### Listar

---

## Lojas

### Listar
