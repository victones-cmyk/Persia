// apps/api/src/lib/documentoBR.ts
// Validação de CPF/CNPJ (mesmo algoritmo do lib/documentoBR.ts do frontend —
// nunca confia no que o cliente validou, revalida aqui, RN-10).

/** Dígito verificador padrão módulo 11 (usado por CPF e CNPJ). */
function digitoVerificador(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((s, d, i) => s + d * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida CPF (11 dígitos, dígitos verificadores corretos, rejeita sequências repetidas). */
export function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const nums = d.split('').map(Number);
  const dv1 = digitoVerificador(nums.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(nums.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === nums[9] && dv2 === nums[10];
}

/** Valida CNPJ (14 dígitos, dígitos verificadores corretos, rejeita sequências repetidas). */
export function cnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const nums = d.split('').map(Number);
  const dv1 = digitoVerificador(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === nums[12] && dv2 === nums[13];
}
