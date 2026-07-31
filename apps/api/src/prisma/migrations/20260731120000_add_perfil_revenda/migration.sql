-- Adiciona o valor 'revenda' ao enum Perfil (novo tipo de usuário: revendedor
-- atrelado a um cliente fixo do GestãoClick, com desconto e acesso por calculadora).
ALTER TYPE "Perfil" ADD VALUE IF NOT EXISTS 'revenda';
