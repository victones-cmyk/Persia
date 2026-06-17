// Script de LEITURA (GET only) — mapeia a árvore de grupos de produtos do
// GestãoClick e conta produtos por grupo, para localizar os ACESSÓRIOS de cortina
// (varão, trilho, suporte, ilhós, argolas, rodízios, ponteira, entretela, wave…).
// NÃO escreve nada no GestãoClick. Uso pontual.
//   node scripts/recon-acessorios-cortina.mjs
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

const envPath = path.resolve(process.cwd(), '../../.env');
const envTxt = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envTxt.split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}

const BASE = env.GC_API_BASE_URL || 'https://api.gestaoclick.com';
const http = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: {
    access_token: env.GESTAOCLICK_ACCESS_TOKEN,
    secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function todasPaginas(url, params = {}) {
  const out = [];
  let pagina = 1;
  for (let i = 0; i < 200; i++) {
    const { data } = await http.get(url, { params: { ...params, pagina } });
    out.push(...(data.data ?? []));
    const prox = data.meta?.proxima_pagina;
    if (!prox) break;
    pagina = prox;
    await sleep(380);
  }
  return out;
}

// Palavras que indicam acessório de cortina.
const ALVOS = ['varão', 'varao', 'trilho', 'suporte', 'ilhós', 'ilhos', 'ilhose', 'argola',
  'rodízio', 'rodizio', 'gancho', 'ponteira', 'entretela', 'kos', 'wave', 'cordão', 'cordao',
  'base click', 'terminal', 'deslizante', 'cortina'];
const bate = (s) => ALVOS.some((a) => (s || '').toLowerCase().includes(a));

async function main() {
  const grupos = await todasPaginas('/api/grupos_produtos');
  const porId = new Map(grupos.map((g) => [String(g.id), g]));
  const filhos = new Map();
  for (const g of grupos) {
    const pai = String(g.grupo_pai_id || '0');
    if (!filhos.has(pai)) filhos.set(pai, []);
    filhos.get(pai).push(g);
  }

  console.log(`\n=== ${grupos.length} grupos no GestãoClick ===\n`);
  // Imprime a árvore, destacando grupos que "parecem" de cortina/acessório.
  function imprime(paiId, nivel) {
    const lista = (filhos.get(paiId) || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    for (const g of lista) {
      const flag = bate(g.nome) ? '  <<< CORTINA/ACESSÓRIO?' : '';
      console.log(`${'  '.repeat(nivel)}- [${g.id}] ${g.nome}${flag}`);
      imprime(String(g.id), nivel + 1);
    }
  }
  imprime('0', 0);

  // Para os grupos que parecem de acessório, lista os produtos com preço VAREJO.
  const alvosGrupos = grupos.filter((g) => bate(g.nome));
  console.log(`\n\n=== Produtos nos ${alvosGrupos.length} grupos candidatos ===`);
  for (const g of alvosGrupos) {
    const prods = await todasPaginas('/api/produtos', { grupo_id: g.id, ativo: 1 });
    console.log(`\n## [${g.id}] ${g.nome} — ${prods.length} produto(s)`);
    for (const p of prods.slice(0, 40)) {
      const v = (p.valores || []).find((x) => x.nome_tipo === 'VAREJO' || x.tipo_id === '10969');
      const preco = v ? v.valor_venda : p.valor_venda;
      console.log(`   [${p.id}] ${p.nome}  — R$ ${preco}`);
    }
    if (prods.length > 40) console.log(`   … +${prods.length - 40} produtos`);
  }
}

main().catch((e) => {
  console.error('ERRO:', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
  process.exit(1);
});
