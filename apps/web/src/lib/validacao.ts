// apps/web/src/lib/validacao.ts
// Validações de formulário no cliente.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function senhaValida(senha: string): boolean {
  return senha.length >= 6;
}
