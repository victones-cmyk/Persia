// apps/web/src/lib/documentoBR.ts
// Máscaras e validação de CPF/CNPJ/telefone/CEP pt-BR (mesmo padrão de mascaraData
// em dataBR.ts: strip não-dígitos, slice no tamanho máximo, remonta com separadores).

/** Máscara 000.000.000-00 enquanto digita. */
export function mascaraCpf(v: string): string {
  const only = v.replace(/\D/g, '').slice(0, 11);
  let out = only.slice(0, 3);
  if (only.length > 3) out += '.' + only.slice(3, 6);
  if (only.length > 6) out += '.' + only.slice(6, 9);
  if (only.length > 9) out += '-' + only.slice(9, 11);
  return out;
}

/** Máscara 00.000.000/0000-00 enquanto digita. */
export function mascaraCnpj(v: string): string {
  const only = v.replace(/\D/g, '').slice(0, 14);
  let out = only.slice(0, 2);
  if (only.length > 2) out += '.' + only.slice(2, 5);
  if (only.length > 5) out += '.' + only.slice(5, 8);
  if (only.length > 8) out += '/' + only.slice(8, 12);
  if (only.length > 12) out += '-' + only.slice(12, 14);
  return out;
}

/** Máscara (00) 00000-0000 (ou 8 dígitos) enquanto digita. */
export function mascaraTelefone(v: string): string {
  const only = v.replace(/\D/g, '').slice(0, 11);
  if (only.length === 0) return '';
  let out = '(' + only.slice(0, 2);
  if (only.length >= 3) out += ') ' + only.slice(2, only.length > 10 ? 7 : 6);
  if (only.length > 6) out += '-' + only.slice(only.length > 10 ? 7 : 6, 11);
  return out;
}

/** Máscara 00000-000 enquanto digita. */
export function mascaraCep(v: string): string {
  const only = v.replace(/\D/g, '').slice(0, 8);
  let out = only.slice(0, 5);
  if (only.length > 5) out += '-' + only.slice(5, 8);
  return out;
}

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
