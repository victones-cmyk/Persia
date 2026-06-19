// apps/web/src/lib/validacao.ts
// Validações de formulário no cliente.

// O login não é um e-mail real (o sistema não envia e-mails); é só um nome de
// usuário. Aceita qualquer texto não vazio (mín. 3 caracteres).
export function usuarioValido(usuario: string): boolean {
  return usuario.trim().length >= 3;
}

// Política de senha (espelha o backend lib/senha.ts): mín. 8 caracteres,
// com ao menos uma letra e um número. Usada ao DEFINIR uma nova senha.
export function senhaValida(senha: string): boolean {
  return senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha);
}
