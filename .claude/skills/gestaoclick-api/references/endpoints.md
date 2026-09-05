# Endpoints do GestãoClick

Todos os caminhos são relativos a `GC_API_BASE_URL` + `/api`.
Ex.: `POST /orcamentos` → `https://api.gestaoclick.com/api/orcamentos`.

Listagens aceitam filtros por query string e vêm paginadas (`meta.proxima_pagina`).

## Clientes  `/clientes`

- **GET /clientes** — Listar
- **POST /clientes** — Cadastrar
- **GET /clientes/{id}** — Visualizar
- **PUT /clientes/{id}** — Editar
- **DELETE /clientes/{id}** — Deletar

## Fornecedores  `/fornecedores`

- **GET /fornecedores** — Listar
- **POST /fornecedores** — Cadastrar
- **GET /fornecedores/{id}** — Visualizar
- **PUT /fornecedores/{id}** — Editar
- **DELETE /fornecedores/{id}** — Deletar

## Funcionários  `/funcionarios`

- **GET /funcionarios** — Listar

## Campos extras de cadastros  `/atributos_cadastros`

- **GET /atributos_cadastros** — Listar
- **POST /atributos_cadastros** — Cadastrar
- **PUT /atributos_cadastros/{id}** — Editar
- **GET /atributos_cadastros/{id}** — Visualizar
- **DELETE /atributos_cadastros/{id}** — Deletar

## Transportadoras  `/transportadoras`

- **GET /transportadoras** — Listar
- **POST /transportadoras** — Cadastrar
- **GET /transportadoras/{id}** — Visualizar
- **PUT /transportadoras/{id}** — Editar
- **DELETE /transportadoras/{id}** — Deletar

## Tipos de contatos  `/tipos_contatos`

- **GET /tipos_contatos** — Listar

## Tipos de endereços  `/tipos_enderecos`

- **GET /tipos_enderecos** — Listar

## Estados  `/estados`

- **GET /estados** — Listar

## Cidades  `/cidades`

- **GET /cidades** — Listar

## Produtos  `/produtos`

- **GET /produtos** — Listar
- **POST /produtos** — Cadastrar
- **GET /produtos/{id}** — Visualizar
- **PUT /produtos/{id}** — Editar
- **DELETE /produtos/{id}** — Deletar

## Grupos de produtos  `/grupos_produtos`

- **GET /grupos_produtos** — Listar

## Campos extras de produtos  `/atributos_produtos`

- **GET /atributos_produtos** — Listar
- **POST /atributos_produtos** — Cadastrar
- **PUT /atributos_produtos/{id}** — Editar
- **GET /atributos_produtos/{id}** — Visualizar
- **DELETE /atributos_produtos/{id}** — Deletar

## Serviços  `/servicos`

- **GET /servicos** — Listar
- **POST /servicos** — Cadastrar
- **GET /produtos/{id}** — Visualizar
- **PUT /servicos/{id}** — Editar
- **DELETE /servicos/{id}** — Deletar

## Orçamentos  `/orcamentos`

- **GET /orcamentos** — Listar
- **POST /orcamentos** — Cadastrar
- **GET /orcamentos/{id}** — Visualizar
- **PUT /orcamentos/{id}** — Editar
- **DELETE /orcamentos/{id}** — Deletar
- **POST /orcamentos/gerar_parcelas** — Gerar parcelas

## Situações de orçamentos  `/situacoes_orcamentos`

- **GET /situacoes_orcamentos** — Listar

## Campos extras de orçamentos  `/atributos_orcamentos`

- **GET /atributos_orcamentos** — Listar
- **POST /atributos_orcamentos** — Cadastrar
- **PUT /atributos_orcamentos/{id}** — Editar
- **GET /atributos_orcamentos/{id}** — Visualizar
- **DELETE /atributos_orcamentos/{id}** — Deletar

## Vendas  `/vendas`

- **GET /vendas** — Listar
- **POST /vendas** — Cadastrar
- **GET /vendas/{id}** — Visualizar
- **PUT /vendas/{id}** — Editar
- **DELETE /vendas/{id}** — Deletar
- **POST /vendas/gerar_parcelas** — Gerar parcelas

## Situações de vendas  `/situacoes_vendas`

- **GET /situacoes_vendas** — Listar

## Campos extras vendas  `/atributos_vendas`

- **GET /atributos_vendas** — Listar
- **POST /atributos_vendas** — Cadastrar
- **PUT /atributos_vendas/{id}** — Editar
- **GET /atributos_vendas/{id}** — Visualizar
- **DELETE /atributos_vendas/{id}** — Deletar

## Ordens de serviços  `/ordens_servicos`

- **GET /ordens_servicos** — Listar
- **POST /ordens_servicos** — Cadastrar
- **GET /ordens_servicos/{id}** — Visualizar
- **PUT /ordens_servicos/{id}** — Editar
- **DELETE /ordens_servicos/{id}** — Deletar
- **POST /ordens_servicos/gerar_parcelas** — Gerar parcelas

## Situações de OS  `/situacoes_ordens_servicos`

- **GET /situacoes_ordens_servicos** — Listar

## Campos extras ordens serviço  `/atributos_ordens_servicos`

- **GET /atributos_ordens_servicos** — Listar
- **POST /atributos_ordens_servicos** — Cadastrar
- **PUT /atributos_ordens_servicos/{id}** — Editar
- **GET /atributos_ordens_servicos/{id}** — Visualizar
- **DELETE /atributos_ordens_servicos/{id}** — Deletar

## Compras  `/compras`

- **GET /compras** — Listar
- **POST /compras** — Cadastrar
- **GET /compras/{id}** — Visualizar
- **PUT /compras/{id}** — Editar
- **DELETE /compras/{id}** — Deletar
- **POST /compras/gerar_parcelas** — Gerar parcelas

## Situações de compras  `/situacoes_compras`

- **GET /situacoes_compras** — Listar

## Notas Fiscais de Produtos  `/notas_fiscais_produtos`

- **GET /notas_fiscais_produtos** — Listar
- **POST /notas_fiscais_produtos** — Cadastrar
- **GET /notas_fiscais_produtos/{id}** — Visualizar
- **PUT /notas_fiscais_produtos/{id}** — Editar
- **DELETE /notas_fiscais_produtos/{id}** — Deletar
- **POST /notas_fiscais_produtos/emitir/{id}** — Emitir
- **POST /notas_fiscais_produtos/cancelar/{id}** — Cancelar

## Notas Fiscais de Consumidores  `/notas_fiscais_consumidores`

- **GET /notas_fiscais_consumidores** — Listar
- **POST /notas_fiscais_consumidores** — Cadastrar
- **GET /notas_fiscais_consumidores/{id}** — Visualizar
- **PUT /notas_fiscais_consumidores/{id}** — Editar
- **DELETE /notas_fiscais_consumidores/{id}** — Deletar
- **POST /notas_fiscais_consumidores/emitir/{id}** — Emitir
- **POST /notas_fiscais_consumidores/cancelar/{id}** — Cancelar

## Notas Fiscais de Serviços  `/notas_fiscais_servicos`

- **GET /notas_fiscais_servicos** — Listar
- **POST /notas_fiscais_servicos** — Cadastrar
- **GET /notas_fiscais_servicos/{id}** — Visualizar
- **PUT /notas_fiscais_servicos/{id}** — Editar
- **DELETE /notas_fiscais_servicos/{id}** — Deletar
- **POST /notas_fiscais_servicos/emitir/{id}** — Emitir
- **POST /notas_fiscais_servicos/cancelar/{id}** — Cancelar

## Pagamentos  `/pagamentos`

- **GET /pagamentos** — Listar
- **POST /pagamentos** — Cadastrar
- **GET /pagamentos/{id}** — Visualizar
- **PUT /pagamentos/{id}** — Editar
- **DELETE /pagamentos/{id}** — Deletar

## Recebimentos  `/recebimentos`

- **GET /recebimentos** — Listar
- **POST /recebimentos** — Cadastrar
- **GET /recebimentos/{id}** — Visualizar
- **PUT /recebimentos/{id}** — Editar
- **DELETE /recebimentos/{id}** — Deletar

## Campos extras financeiros  `/atributos_financeiros`

- **GET /atributos_financeiros** — Listar
- **POST /atributos_financeiros** — Cadastrar
- **PUT /atributos_financeiros/{id}** — Editar
- **GET /atributos_financeiros/{id}** — Visualizar
- **DELETE /atributos_financeiros/{id}** — Deletar

## Formas pagamentos  `/formas_pagamentos`

- **GET /formas_pagamentos** — Listar

## Contas bancárias  `/contas_bancarias`

- **GET /contas_bancarias** — Listar

## Planos de contas  `/planos_contas`

- **GET /planos_contas** — Listar

## Centros de custos  `/centros_custos`

- **GET /centros_custos** — Listar

## Usuários  `/usuarios`

- **GET /usuarios** — Listar

## Lojas  `/lojas`

- **GET /lojas** — Listar
