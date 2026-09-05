---
name: gestaoclick-api
description: Referência da API REST do GestãoClick (ERP que a Pérsia integra) — endpoints, campos obrigatórios, formato de erro e os ids de situação desta instalação. Use SEMPRE que for mexer em qualquer chamada ao GestãoClick, mesmo que pareça simples: criar/editar/apagar orçamento, venda, produto, cliente, ordem de serviço, estoque, ou ao investigar erro vindo do GC (especialmente 404). Consulte antes de sondar a API de produção — ela é o ERP real da loja, e descobrir comportamento por tentativa e erro cria registro de verdade e leva a conclusões erradas.
---

# API do GestãoClick

O ERP onde vivem clientes, produtos, orçamentos e vendas da Rainha das Cortinas.
A Pérsia lê e escreve nele em quase todo fluxo importante.

**Antes de mexer:** o que você chamar acontece na operação real da loja — orçamento
criado aparece para o vendedor, produto criado polui a busca do PDV, estoque
decrementado é estoque decrementado. Leia a referência primeiro; se ainda assim
precisar testar, crie um registro descartável claramente marcado
(`TESTE PERSIA APAGAR`) e apague em seguida.

## O erro que engana (leia isto primeiro)

**O GestãoClick devolve HTTP 404 para erro de validação.** Não é rota inexistente.
A explicação de verdade vem no corpo:

```json
{"code":404,"status":"error",
 "data":{"erro":"Not Found",
         "mensagem":"O valor do pedido não pode ser diferente do valor das parcelas..."}}
```

Isso já causou uma conclusão errada: um `PUT /orcamentos/{id}` com corpo incompleto
devolveu 404 e foi lido como "a API não permite editar orçamento" — quando permite,
e o problema era campo obrigatório faltando. **Sempre leia o corpo do 404 antes de
concluir qualquer coisa sobre o que a API suporta.**

Erro real de rota também é 404, então a distinção só existe na mensagem.

## Autenticação e base

```
GET/POST/PUT/DELETE  {GC_API_BASE_URL}/api/{recurso}
Headers: access_token, secret_access_token
```

- Base em produção: `https://api.gestaoclick.com` (env `GC_API_BASE_URL`)
- A documentação escreve os headers com hífen (`access-token`); **o código usa
  underscore e funciona** — mantenha underscore, é o que está em produção.
- Limite de 3 requisições por segundo. O cliente em
  `apps/api/src/services/gc/client.ts` já cuida disso com fila e retry de 429 —
  use `gcRequest`, não `fetch` direto.

## Situações desta instalação

Situação é um campo obrigatório em orçamento e venda, e os ids são **específicos
desta conta** — não são universais. Confirme com
`GET /api/situacoes_orcamentos` quando desconfiar; o endpoint devolve as
situações de todos os tipos misturadas.

**Orçamento:**

| id | nome | uso |
|---|---|---|
| 92112 | Em aberto | padrão ao criar (`SITUACAO_EM_ABERTO` no código) |
| 92113 | Em andamento | |
| 92114 | Concretizado | virou venda |
| 92115 | Cancelado | desistência do cliente |
| 9442250 | Substituído | orçamento refeito após remedição — criada para distinguir de cancelado, para não poluir relatório de venda perdida |

## Orçamentos — o que dá e o que não dá

| operação | rota | observação |
|---|---|---|
| criar | `POST /orcamentos` | devolve `id` e `codigo` (o número que o vendedor vê) |
| ler | `GET /orcamentos/{id}` | |
| **editar** | `PUT /orcamentos/{id}` | **funciona**, mas exige payload completo |
| apagar | `DELETE /orcamentos/{id}` | |

O `PUT` exige `codigo`, `cliente_id`, `situacao_id`, `data` — e mais: se o orçamento
tem parcelas, o total dos produtos enviados precisa bater com o das parcelas, senão
vem o 404 de validação. Na prática, **reenvie o orçamento inteiro** com o campo
alterado, não só o campo.

## Onde olhar

- `references/endpoints.md` — os 76 endpoints, por recurso. Comece por aqui para
  saber se algo existe.
- `references/campos-obrigatorios.md` — campos obrigatórios de 30 operações.
  Consulte antes de montar qualquer POST ou PUT; é a causa mais comum do 404.

Quando a resposta não estiver nesses dois, o blueprint completo está em
<https://gestaoclick.docs.apiary.io/api-description-document> (a página normal é
renderizada por JavaScript e vem vazia; esta URL devolve o texto cru).

## Como o código já conversa com o GC

Antes de escrever chamada nova, veja se já existe:

- `services/gc/client.ts` — `gcRequest`, fila de 3 req/s, retry de 429/5xx
- `services/gc/clientes.ts` — buscar, buscar por id (com endereço), criar PF/PJ
- `services/gc/orcamentos.ts` — montar payload, criar, apagar
- `services/gc/produtos.ts` — produtos sintéticos por item de orçamento
- `services/gc/vendas.ts` — venda direta e venda a partir de orçamento
- `services/gc/estoque.ts` — baixa de estoque
- `services/gc/catalogoLocal.ts` — cópia local do catálogo, sincronizada; a leitura
  de produto passa por aqui e **não** bate no GC a cada consulta

Um detalhe que já custou dinheiro: o motor de preço casa componente da receita com
produto do catálogo pelo **`codigo_interno`**, nunca pelo id do produto — o id muda
entre sincronizações. Se um preço mudou sozinho, suspeite de código interno
apontando para outro produto.
