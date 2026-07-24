// apps/api/scripts/inativar-produtos-sinteticos.ts
// Limpeza retroativa (fase 2): inativa no GestãoClick os produtos SINTÉTICOS
// (criados pela Pérsia, um por item de orçamento) cujos orçamentos já chegaram
// ao fim da vida útil — venda gerada/vinculada ou cancelamento. Produtos de
// orçamentos ainda "em aberto" (enviado, sem venda) ficam ativos.
//
// Uso (na raiz do repositório, com o .env configurado):
//   npx tsx apps/api/scripts/inativar-produtos-sinteticos.ts              # simulação (não altera nada)
//   npx tsx apps/api/scripts/inativar-produtos-sinteticos.ts --apply     # inativa o grupo A (finalizados)
//   npx tsx apps/api/scripts/inativar-produtos-sinteticos.ts --apply --incluir-orfaos
//     (órfãos = produtos com assinatura Pérsia sem orçamento correspondente; revise a lista antes)

import '../src/config/env';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { inativarProduto } from '../src/services/gc/produtos';
import { produtosSinteticosDoOrcamento } from '../src/services/gc/limpezaProdutos';

// Assinatura dos produtos criados pela Pérsia: nome termina em " #12345678"
// (sufixo do codigo_interno) e/ou codigo_interno de 16 dígitos vindo de
// Date.now()+sequência (começa com "17" até ~2029).
const RE_NOME_SINTETICO = / #\d{8}$/;
const RE_CODIGO_SINTETICO = /^17\d{14}$/;

async function main() {
  const apply = process.argv.includes('--apply');
  const incluirOrfaos = process.argv.includes('--incluir-orfaos');

  const orcamentos = await prisma.orcamento.findMany({
    where: { payload_gc_enviado: { not: Prisma.AnyNull } },
    select: {
      id: true, status: true, gc_codigo: true, gc_orcamento_id: true,
      gc_pedido_id: true, gc_pedido_codigo: true,
      resposta_gc: true, payload_gc_enviado: true, itens_json: true,
    },
  });

  const protegidos = new Set<string>();
  const finalizados = new Set<string>();
  for (const orc of orcamentos) {
    const ids = produtosSinteticosDoOrcamento(orc);
    const temVenda = Boolean(orc.gc_pedido_id || orc.gc_pedido_codigo);
    const finalizado = temVenda || orc.status === 'cancelado';
    for (const id of ids) (finalizado ? finalizados : protegidos).add(id);
  }
  // Um produto referenciado por QUALQUER orçamento em aberto fica protegido.
  for (const id of protegidos) finalizados.delete(id);

  const catalogo = await prisma.gcProdutoLocal.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, codigo_interno: true },
  });
  const porId = new Map(catalogo.map((p) => [p.id, p]));

  const alvoFinalizados = [...finalizados].filter((id) => porId.has(id)); // ainda ativos
  const conhecidos = new Set([...finalizados, ...protegidos]);
  const orfaos = catalogo.filter((p) =>
    !conhecidos.has(p.id)
    && (RE_NOME_SINTETICO.test(p.nome) || RE_CODIGO_SINTETICO.test(p.codigo_interno ?? '')));

  console.log(`Orçamentos enviados analisados: ${orcamentos.length}`);
  console.log(`Protegidos (orçamento em aberto): ${protegidos.size}`);
  console.log(`\nGRUPO A — finalizados e ainda ativos no catálogo: ${alvoFinalizados.length}`);
  for (const id of alvoFinalizados) console.log(`  ${id}  ${porId.get(id)?.nome ?? '(fora do catálogo local)'}`);
  console.log(`\nGRUPO B — órfãos com assinatura Pérsia (sem orçamento correspondente): ${orfaos.length}`);
  for (const p of orfaos) console.log(`  ${p.id}  ${p.nome}`);

  if (!apply) {
    console.log('\nSimulação: nada foi alterado. Rode com --apply para inativar o grupo A' +
      (orfaos.length ? ' (e --incluir-orfaos para o grupo B, após revisar a lista acima).' : '.'));
    return;
  }

  const alvos = incluirOrfaos ? [...alvoFinalizados, ...orfaos.map((p) => p.id)] : alvoFinalizados;
  console.log(`\nInativando ${alvos.length} produto(s) no GestãoClick...`);
  const ok: string[] = [];
  const falhas: string[] = [];
  for (const id of alvos) {
    try {
      await inativarProduto(id);
      ok.push(id);
      console.log(`  ok  ${id}  ${porId.get(id)?.nome ?? ''}`);
    } catch (e) {
      falhas.push(id);
      console.log(`  FALHA  ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (ok.length > 0) {
    await prisma.gcProdutoLocal.updateMany({ where: { id: { in: ok } }, data: { ativo: false } });
  }
  console.log(`\nConcluído: ${ok.length} inativado(s), ${falhas.length} falha(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('FALHA:', e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
