// apps/api/src/lib/senha.ts
// Política de senha — ponto ÚNICO de validação, reutilizado em todos os lugares
// onde uma senha é definida (troca pelo próprio usuário, criação/edição pelo admin).
// Mantém a regra consistente e evita divergência entre os controllers.

export const SENHA_MIN = 8;

/**
 * Valida a força mínima da senha. Retorna a mensagem de erro (pt-BR) quando
 * inválida, ou `null` quando a senha é aceitável.
 * Regra: mínimo de 8 caracteres, com ao menos uma letra e um número.
 */
export function validarSenha(senha: unknown): string | null {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) {
    return `A senha deve ter ao menos ${SENHA_MIN} caracteres.`;
  }
  const temLetra = /[a-zA-Z]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  if (!temLetra || !temNumero) {
    return 'A senha deve conter ao menos uma letra e um número.';
  }
  return null;
}
