// Script de LEITURA (GET only) — exporta os tecidos do grupo "TECIDOS PARA PERSIANA"
// (235486) do GestãoClick para um JSON, indicando quais têm/não têm largura.
// NÃO escreve nada no GestãoClick. Uso pontual.
//   node scripts/exportar-tecidos.mjs > /tmp/tecidos.json
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

// Carrega tokens do .env da raiz do monorepo.
const envPath = path.resolve(process.cwd(), '../../.env');
const envTxt = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envTxt.split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
}

const GRUPO = '235486';
const BASE = env.GC_API_BASE_URL || 'https://api.gestaoclick.com';
const http = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: {
    access_token: env.GESTAOCLICK_ACCESS_TOKEN,
    secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

const DIM_RE = /(\d+[.,]\d{1,2})\s*M\b/i;

// Mesma lógica de gc/tecidos.ts: largura do campo, fallback no nome.
function larguraCampo(p) {
  const v = Number(String(p.largura ?? '').replace(',', '.'));
  return Number.isFinite(v) && v >= 1 && v <= 4 ? v : null;
}
function larguraNome(p) {
  const m = DIM_RE.exec(p.nome || '');
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v >= 1 && v <= 4) return v;
  }
  return null;
}
function precoVarejo(p) {
  const v = (p.valores || []).find((x) => x.tipo_id === '10969' || x.nome_tipo === 'VAREJO');
  const n = Number(v ? v.valor_venda : p.valor_venda);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const todos = [];
  let pagina = 1;
  for (let i = 0; i < 100; i++) {
    const { data } = await http.get('/api/produtos', { params: { grupo_id: GRUPO, ativo: 1, pagina } });
    todos.push(...(data.data ?? []));
    const prox = data.meta?.proxima_pagina;
    if (!prox) break;
    pagina = prox;
    await new Promise((r) => setTimeout(r, 400)); // respeita rate limit (3 req/s)
  }

  const linhas = todos.map((p) => {
    const campo = larguraCampo(p);
    const nome = larguraNome(p);
    const efetiva = campo ?? nome; // o que a calculadora usa hoje
    return {
      id: p.id,
      codigo_interno: p.codigo_interno || '',
      nome: p.nome || '',
      largura_campo: campo,        // valor do campo "largura" no GC
      largura_no_nome: nome,       // valor inferido do nome (fallback)
      largura_efetiva: efetiva,    // o que a calculadora consegue usar
      tem_largura: efetiva !== null,
      preco_varejo: precoVarejo(p),
    };
  });

  // sem largura primeiro, depois por nome
  linhas.sort((a, b) => {
    if (a.tem_largura !== b.tem_largura) return a.tem_largura ? 1 : -1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const comLargura = linhas.filter((l) => l.tem_largura).length;
  process.stdout.write(JSON.stringify({
    total: linhas.length,
    com_largura: comLargura,
    sem_largura: linhas.length - comLargura,
    linhas,
  }, null, 2));
}

main().catch((e) => {
  console.error('ERRO:', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
  process.exit(1);
});
