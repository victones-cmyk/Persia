// LEITURA (GET only) — verifica, para cada acessório de cortina, se existe produto
// no GestãoClick e em que grupo(s) está. Usa o filtro nome= da API /api/produtos.
// NÃO escreve nada. Uso: node scripts/verificar-acessorios-cortina.mjs
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

const envTxt = fs.readFileSync(path.resolve(process.cwd(), '../../.env'), 'utf8');
const env = {};
for (const line of envTxt.split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}
const http = axios.create({
  baseURL: env.GC_API_BASE_URL || 'https://api.gestaoclick.com',
  timeout: 20000,
  headers: { access_token: env.GESTAOCLICK_ACCESS_TOKEN, secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscaNome(nome) {
  const out = [];
  let pagina = 1;
  for (let i = 0; i < 30; i++) {
    const { data } = await http.get('/api/produtos', { params: { nome, ativo: 1, pagina } });
    out.push(...(data.data ?? []));
    const prox = data.meta?.proxima_pagina;
    if (!prox) break;
    pagina = prox;
    await sleep(380);
  }
  return out;
}

// Acessório que a calculadora gera → termos de busca.
const ACESSORIOS = [
  { nome: 'Varão', termos: ['varão', 'varao'] },
  { nome: 'Trilho', termos: ['trilho'] },
  { nome: 'Suporte', termos: ['suporte'] },
  { nome: 'Ilhós', termos: ['ilhós', 'ilhos'] },
  { nome: 'Argola', termos: ['argola'] },
  { nome: 'Rodízio/Gancho', termos: ['rodízio', 'rodizio', 'gancho'] },
  { nome: 'Ponteira', termos: ['ponteira'] },
  { nome: 'Entretela (KOS)', termos: ['entretela', 'kos'] },
  { nome: 'Wave — cordão', termos: ['cordão', 'cordao'] },
  { nome: 'Wave — rodízio/base click', termos: ['base click', 'rodizio wave', 'rodízio wave'] },
  { nome: 'Wave — terminal', termos: ['terminal'] },
  { nome: 'Deslizante', termos: ['deslizante'] },
];

async function main() {
  for (const a of ACESSORIOS) {
    const vistos = new Map(); // id -> produto (dedup entre termos)
    for (const t of a.termos) {
      for (const p of await buscaNome(t)) vistos.set(p.id, p);
      await sleep(250);
    }
    const prods = [...vistos.values()];
    // tally por grupo
    const porGrupo = new Map();
    for (const p of prods) {
      const g = `${p.nome_grupo || '(sem grupo)'} [${p.grupo_id || '-'}]`;
      porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    }
    const status = prods.length === 0 ? 'NAO EXISTE' :
      (porGrupo.size === 1 && [...porGrupo.keys()][0].includes('ACESSÓRIOS [76945]')) ? 'SOLTO no pai ACESSÓRIOS' :
      'OK';
    console.log(`\n### ${a.nome}  →  ${prods.length} produto(s)  [${status}]`);
    for (const [g, n] of [...porGrupo.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`   ${n.toString().padStart(4)}  em  ${g}`);
    }
    for (const p of prods.slice(0, 3)) {
      const v = (p.valores || []).find((x) => x.nome_tipo === 'VAREJO' || x.tipo_id === '10969');
      console.log(`        ex: [${p.id}] ${p.nome}  — R$ ${v ? v.valor_venda : p.valor_venda}`);
    }
    await sleep(250);
  }
}

main().catch((e) => {
  console.error('ERRO:', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
  process.exit(1);
});
