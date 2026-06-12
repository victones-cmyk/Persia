// Script de LEITURA (GET only) — lista os funcionários (vendedores) do GestãoClick.
// NÃO escreve nada no GestãoClick. Uso pontual.
//   node scripts/exportar-funcionarios.mjs > /tmp/funcionarios.json
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
  timeout: 15000,
  headers: {
    access_token: env.GESTAOCLICK_ACCESS_TOKEN,
    secret_access_token: env.GESTAOCLICK_SECRET_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

async function main() {
  const todos = [];
  let pagina = 1;
  for (let i = 0; i < 100; i++) {
    const { data } = await http.get('/api/funcionarios', { params: { pagina } });
    todos.push(...(data.data ?? []));
    const prox = data.meta?.proxima_pagina;
    if (!prox) break;
    pagina = prox;
    await new Promise((r) => setTimeout(r, 400));
  }

  const linhas = todos.map((f) => ({
    id: f.id,
    nome: f.nome ?? f.nome_completo ?? '',
    cargo: f.cargo ?? f.funcao ?? '',
    ativo: f.ativo ?? '',
    email: f.email ?? '',
    telefone: f.telefone ?? f.celular ?? '',
  }));
  linhas.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  process.stdout.write(JSON.stringify({ total: linhas.length, linhas }, null, 2));
}

main().catch((e) => {
  console.error('ERRO:', e.response?.status, JSON.stringify(e.response?.data ?? e.message));
  process.exit(1);
});
