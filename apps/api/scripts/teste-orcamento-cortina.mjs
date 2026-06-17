// TESTE CONTROLADO DE ESCRITA (autorizado pelo usuário em 17/06/2026).
// Cria 1 produto sintético + 1 orçamento de cortina com linha de PRODUTO e de
// SERVIÇO (instalação) para validar o payload `tipo:'ambos' + servicos` no GC.
// Depois APAGA o produto de teste. O orçamento de teste deve ser apagado à mão
// (a API não permite excluir orçamento). Uso: node scripts/teste-orcamento-cortina.mjs
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

const envTxt = fs.readFileSync(path.resolve(process.cwd(), '../../.env'), 'utf8');
const env = {};
for (const l of envTxt.split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}
const http = axios.create({
  baseURL: env.GC_API_BASE_URL || 'https://api.gestaoclick.com',
  timeout: 20000,
  headers: { access_token: env.GESTAOCLICK_ACCESS_TOKEN, secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN, 'Content-Type': 'application/json' },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SITUACAO_EM_ABERTO = '92112';

async function main() {
  // 1) Cliente de teste: prefere um que tenha "teste" no nome; senão, o 1º da lista.
  const porTeste = (await http.get('/api/clientes', { params: { nome: 'teste' } })).data.data || [];
  let cliente = porTeste.find((c) => /teste/i.test(c.nome));
  if (!cliente) {
    const cli = (await http.get('/api/clientes', { params: { pagina: 1 } })).data.data || [];
    if (!cli.length) throw new Error('Nenhum cliente encontrado.');
    cliente = cli[0];
  }
  console.log(`Cliente de teste: [${cliente.id}] ${cliente.nome}`);
  await sleep(400);

  // 2) Serviço de instalação.
  const servs = (await http.get('/api/servicos', { params: { nome: 'instala' } })).data.data || [];
  const inst = servs.find((s) => /instala/i.test(s.nome));
  if (!inst) throw new Error('Serviço INSTALAÇÃO não encontrado.');
  console.log(`Serviço instalação: [${inst.id}] ${inst.nome} (R$ ${inst.valor_venda})`);
  await sleep(400);

  // 3) Produto sintético da cortina (valor de teste).
  const codigo_interno = `PERSIA-TESTE-${Math.floor(Date.now() / 1000)}`;
  const prodPayload = {
    nome: 'TESTE Cortina Wave • Voil Liso • 3,00×2,60m',
    codigo_interno,
    valor_custo: 80,
    movimenta_estoque: 0,
    valores: [{ tipo_id: '10969', valor_venda: 650 }],
  };
  const prod = (await http.post('/api/produtos', prodPayload)).data;
  const produtoId = prod.data?.id;
  console.log(`Produto criado: [${produtoId}] ${prodPayload.nome}`);
  await sleep(500);

  // 4) Orçamento com PRODUTO + SERVIÇO (tipo 'ambos').
  const orcPayload = {
    tipo: 'ambos',
    codigo: Math.floor(Date.now() / 1000),
    cliente_id: cliente.id,
    situacao_id: SITUACAO_EM_ABERTO,
    data: new Date().toISOString().slice(0, 10),
    produtos: [{ produto_id: produtoId, quantidade: 1, valor_venda: 650, valor_custo: 80 }],
    servicos: [{ servico_id: inst.id, quantidade: 1, valor_venda: 140 }],
  };
  let orcId = null;
  let erro = null;
  try {
    const orc = (await http.post('/api/orcamentos', orcPayload)).data;
    orcId = orc.data?.id;
    console.log(`\n>>> ORÇAMENTO CRIADO: id ${orcId} (PRODUTO 650 + SERVIÇO 140 = 790)`);
    console.log('    Verifique no GestãoClick se aparecem as 2 linhas (produto + serviço).');
  } catch (e) {
    erro = e.response?.data ?? e.message;
    console.log('\n>>> FALHA ao criar orçamento com serviço:', JSON.stringify(erro));
  }
  await sleep(500);

  // 5) Limpa o produto de teste (best-effort).
  try {
    await http.delete(`/api/produtos/${produtoId}`);
    console.log(`Produto de teste ${produtoId} apagado.`);
  } catch (e) {
    console.log(`(Não consegui apagar o produto ${produtoId}: ${e.response?.status})`);
  }

  console.log('\n=== RESUMO ===');
  console.log(JSON.stringify({ orcamento_id: orcId, produto_apagado: produtoId, erro }, null, 2));
  if (orcId) console.log(`\nAÇÃO MANUAL: apague o orçamento de teste ${orcId} no GestãoClick.`);
}

main().catch((e) => { console.error('ERRO:', e.response?.status, JSON.stringify(e.response?.data ?? e.message)); process.exit(1); });
