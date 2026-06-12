// apps/web/src/lib/validacao.ts
// Validações de formulário no cliente.

// O login não é um e-mail real (o sistema não envia e-mails); é só um nome de
// usuário. Aceita qualquer texto não vazio (mín. 3 caracteres).
export function usuarioValido(usuario: string): boolean {
  return usuario.trim().length >= 3;
}

export function senhaValida(senha: string): boolean {
  return senha.length >= 6;
}
