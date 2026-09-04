// apps/api/src/config/env.ts
// Carregamento e validação centralizada de variáveis de ambiente.
// Regra inviolável (SRD §17): credenciais só existem no backend, nunca no frontend.

import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

// O .env vive na raiz do monorepo (persia/.env), conforme a estrutura do projeto.
// Em produção (Railway) as variáveis vêm do ambiente — o arquivo pode não existir.
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
const localEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config(); // fallback: variáveis já presentes no ambiente (Railway)
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[env] Variável obrigatória ausente: ${name}. ` +
        `Copie .env.example para .env e preencha os valores.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  // Banco
  DATABASE_URL: required('DATABASE_URL'),

  // Sessão
  SESSION_SECRET: required('SESSION_SECRET'),
  SESSION_MAX_AGE: Number(optional('SESSION_MAX_AGE', '28800000')), // 8h

  // GestãoClick (preenchidos a partir da Fase 4 — opcionais na Fase 1)
  GESTAOCLICK_ACCESS_TOKEN: optional('GESTAOCLICK_ACCESS_TOKEN', ''),
  GESTAOCLICK_SECRET_ACCESS_TOKEN: optional('GESTAOCLICK_SECRET_ACCESS_TOKEN', ''),
  GC_API_BASE_URL: optional('GC_API_BASE_URL', 'https://api.gestaoclick.com'),
  GC_CLIENTE_URL_TEMPLATE: optional('GC_CLIENTE_URL_TEMPLATE', 'https://app.rainhadascortinas.com.br/clientes/editar/{id}'),
  GC_LOJA_ID_SP: optional('GC_LOJA_ID_SP', '8274'),
  GC_LOJA_ID_SBC: optional('GC_LOJA_ID_SBC', '8284'),
  // Usuário (login) do GestãoClick usado como "usuário de integração" nos orçamentos.
  // Vazio → omitido (GC usa o usuário master). O vendedor real vai em vendedor_id.
  GC_USUARIO_INTEGRACAO_ID: optional('GC_USUARIO_INTEGRACAO_ID', ''),
  GC_DEBUG_LOG: optional('GC_DEBUG_LOG', 'false') === 'true',
  GC_TIMEOUT_MS: Number(optional('GC_TIMEOUT_MS', '10000')),

  // Producao / Zebra
  ZEBRA_DPI: Number(optional('ZEBRA_DPI', '203')),
  ZEBRA_PRINTER_NAME: optional('ZEBRA_PRINTER_NAME', ''),
  ZEBRA_HOST: optional('ZEBRA_HOST', ''),
  ZEBRA_PORT: Number(optional('ZEBRA_PORT', '9100')),
  ZEBRA_TCP_TIMEOUT_MS: Number(optional('ZEBRA_TCP_TIMEOUT_MS', '3000')),

  // App Agenda (CurtainField) — outro app no mesmo servidor Postgres. Conexão
  // dedicada com usuário restrito (SELECT em appointments/users + UPDATE apenas
  // de order_number). Vazio → integração desligada, sem quebrar o resto do app.
  AGENDA_DATABASE_URL: optional('AGENDA_DATABASE_URL', ''),
  AGENDA_BASE_URL: optional('AGENDA_BASE_URL', 'https://agenda.texhaus.com.br'),
  // Chave da API de integração do Agenda (criar OS a partir de uma venda).
  // Vazia → a Pérsia continua LENDO o Agenda pelo banco, mas não cria OS por lá.
  AGENDA_API_KEY: optional('AGENDA_API_KEY', ''),

  // Servidor
  PORT: Number(optional('PORT', '3001')),
  NODE_ENV: optional('NODE_ENV', 'development'),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),
} as const;

export const isProduction = env.NODE_ENV === 'production';
