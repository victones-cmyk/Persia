# Campos obrigatórios por operação

Omitir um destes costuma devolver **HTTP 404** com a explicação real no corpo —
não é rota inexistente. Ver a seção de erros no SKILL.md.

**PUT /clientes/{id}**
- tipo_pessoa (string) - PF, PJ ou ES
- nome (string)

**PUT /fornecedores/{id}**
- tipo_pessoa (string) - PF, PJ ou ES
- nome (string)

**POST /atributos_cadastros**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /atributos_cadastros/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /transportadoras/{id}**
- tipo_pessoa (string) - PF, PJ
- nome (string)

**PUT /produtos/{id}**
- nome (string)
- codigo_interno (string)
- valor_custo (float)

**POST /atributos_produtos**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /atributos_produtos/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /servicos/{id}**
- nome (string)
- codigo (string)

**PUT /orcamentos/{id}**
- tipo (tipo = produto, tipo = servico, caso não seja informado será passado tipo=produto)
- codigo (int)
- cliente_id (int)
- situacao_id (int)
- data (date)

**POST /orcamentos/gerar_parcelas**
- valor_total (float)
- forma_pagamento_id (int)
- numero_parcelas (int)

**POST /atributos_orcamentos**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido".
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list".

**PUT /atributos_orcamentos/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido"
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /vendas/{id}**
- tipo (tipo = produto, tipo = servico, caso não seja informado será passado tipo=produto)
- codigo (int)
- cliente_id (int)
- situacao_id (int)
- data (date)

**POST /vendas/gerar_parcelas**
- valor_total (float)
- forma_pagamento_id (int)
- numero_parcelas (int)

**POST /atributos_vendas**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido"
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /atributos_vendas/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido"
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /ordens_servicos/{id}**
- tipo (tipo = produto, tipo = servico, caso não seja informado será passado tipo=produto)
- codigo (int)
- cliente_id (int)
- situacao_id (int)
- data (date)

**POST /ordens_servicos/gerar_parcelas**
- valor_total (float)
- forma_pagamento_id (int)
- numero_parcelas (int)

**POST /atributos_ordens_servicos**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido"
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /atributos_ordens_servicos/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- exibir_impressao (string), Opções: "Sim", "Não" ou "Quando preenchido"
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /compras/{id}**
- codigo (int)
- fornecedor_id (int)
- situacao_id (int)
- data (date)

**POST /compras/gerar_parcelas**
- valor_total (float)
- numero_parcelas (int)

**PUT /notas_fiscais_produtos/{id}**
- loja_id (int)
- tipo_nf (int)
- id_destinatario/id_fornecedor (int)
- produtos (array)

**PUT /notas_fiscais_consumidores/{id}**
- loja_id (int)
- produtos (array)
- pagamento (array)

**PUT /notas_fiscais_servicos/{id}**
- destinatario_id_cliente (int)
- valor_servico (string)
- codigo_atividade (string)
- codigo_natureza_operacao (string)
- iss_retido (int)
- cidade_incidencia_issqn (string)
- estado_incidencia_issqn (string)
- descricao (string)

**PUT /pagamentos/{id}**
- descricao (string)
- data_vencimento (date)
- plano_contas_id (int)
- forma_pagamento_id (int)
- conta_bancaria_id (int)
- valor (float)
- data_competencia (date)

**PUT /recebimentos/{id}**
- descricao (string)
- data_vencimento (date)
- plano_contas_id (int)
- forma_pagamento_id (int)
- conta_bancaria_id (int)
- valor (float)
- data_competencia (date)

**POST /atributos_financeiros**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"

**PUT /atributos_financeiros/{id}**
- nome (string)
- tipo (string) Tipos permitidos: cpf, cnpj, check_list, data, numeros, texto_simples.
- opcoes* (array) Obrigatório nos campos extras do tipo "check_list"
