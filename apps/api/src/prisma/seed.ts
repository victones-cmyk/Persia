// apps/api/src/prisma/seed.ts
// Seed de dados — Projeto Pérsia (SRD §6)
// Cria o estado mínimo para o primeiro uso: lojas, admin (Victor),
// vendedores de homologação e configurações globais.
//
// NOTA: o SRD §6 usa bcrypt. Adotamos bcryptjs (API idêntica, hashSync/compareSync)
// para evitar dependência de toolchain de compilação nativa no ambiente de dev/CI.
// Decisão registrada na Fase 1.

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Lê a senha inicial de uma variável de ambiente OBRIGATÓRIA. Nunca usar senha
 * literal no código (regra de segurança): credenciais não podem ir ao git.
 * Em dev, defina as variáveis antes de rodar o seed (ver .env.example).
 */
function senhaInicial(nomeVar: string): string {
  const valor = process.env[nomeVar];
  if (!valor || valor.trim().length < 8) {
    throw new Error(
      `[seed] Variável obrigatória ausente ou curta: ${nomeVar}. ` +
        `Defina uma senha inicial com ao menos 8 caracteres antes de rodar o seed.`,
    );
  }
  return valor;
}

async function upsertLoja(nome: string, gc_loja_id: string) {
  const existente = await prisma.loja.findFirst({ where: { nome } });
  if (existente) {
    return prisma.loja.update({ where: { id: existente.id }, data: { gc_loja_id } });
  }
  return prisma.loja.create({ data: { nome, gc_loja_id } });
}

async function main() {
  // 1. Lojas (PLACEHOLDER-01 RESOLVIDO em 11/06/2026)
  const lojaSP = await upsertLoja('Matriz (SP)', '8274');
  const lojaSBC = await upsertLoja('Filial SBC', '8284');

  // 2. Usuário Administrador (Victor)
  await prisma.usuario.upsert({
    where: { email: 'victor.pavoni' },
    update: {
      nome: 'Victor Nogueira Pavoni',
      perfil: 'admin',
      loja_id: null, // admin acessa todas as lojas
      gc_usuario_id: '10512', // Victor — RESOLVIDO 11/06/2026
      desconto_max_pct: 30.0, // PLACEHOLDER-03
    },
    create: {
      nome: 'Victor Nogueira Pavoni',
      email: 'victor.pavoni',
      senha_hash: bcrypt.hashSync(senhaInicial('SEED_ADMIN_SENHA'), 10),
      perfil: 'admin',
      loja_id: null,
      gc_usuario_id: '10512',
      desconto_max_pct: 30.0,
      // Senha inicial é provisória — o admin é obrigado a trocá-la no 1º acesso.
      senha_provisoria: true,
    },
  });

  // 3. Vendedor SP (homologação)
  await prisma.usuario.upsert({
    where: { email: 'loja.sp' },
    update: {
      nome: 'Vendedor SP Teste',
      perfil: 'vendedor',
      loja_id: lojaSP.id,
      desconto_max_pct: 10.0, // PLACEHOLDER-03
    },
    create: {
      nome: 'Vendedor SP Teste',
      email: 'loja.sp',
      senha_hash: bcrypt.hashSync(senhaInicial('SEED_VENDEDOR_SP_SENHA'), 10),
      perfil: 'vendedor',
      loja_id: lojaSP.id,
      gc_usuario_id: null, // PLACEHOLDER-02
      desconto_max_pct: 10.0,
      senha_provisoria: true,
    },
  });

  // 4. Vendedor SBC (homologação)
  await prisma.usuario.upsert({
    where: { email: 'loja.sbc' },
    update: {
      nome: 'Vendedor SBC Teste',
      perfil: 'vendedor',
      loja_id: lojaSBC.id,
      desconto_max_pct: 10.0,
    },
    create: {
      nome: 'Vendedor SBC Teste',
      email: 'loja.sbc',
      senha_hash: bcrypt.hashSync(senhaInicial('SEED_VENDEDOR_SBC_SENHA'), 10),
      perfil: 'vendedor',
      loja_id: lojaSBC.id,
      gc_usuario_id: null, // PLACEHOLDER-02
      desconto_max_pct: 10.0,
      senha_provisoria: true,
    },
  });

  // 5. Configurações globais (PLACEHOLDER-03: confirmar com Victor)
  const configs = [
    { chave: 'desconto_max_vendedor_pct', valor: '10', descricao: 'PLACEHOLDER-03: confirmar com Victor' },
    { chave: 'desconto_max_admin_pct', valor: '30', descricao: 'PLACEHOLDER-03: confirmar com Victor' },
  ];
  for (const cfg of configs) {
    await prisma.configuracao.upsert({
      where: { chave: cfg.chave },
      update: { valor: cfg.valor, descricao: cfg.descricao },
      create: cfg,
    });
  }

  console.log('✅ Seed concluído:');
  console.log('   • Lojas: Matriz (SP) [gc 8274], Filial SBC [gc 8284]');
  console.log('   • Admin: victor@rainhadascortinas.com.br');
  console.log('   • Vendedores: vendedor.sp@ / vendedor.sbc@');
  console.log('   • Configurações: desconto_max_vendedor_pct=10, desconto_max_admin_pct=30');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
