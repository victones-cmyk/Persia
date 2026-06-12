-- Senha provisória: quando true, o usuário deve trocar a senha no próximo login.
ALTER TABLE "usuarios" ADD COLUMN "senha_provisoria" BOOLEAN NOT NULL DEFAULT false;
