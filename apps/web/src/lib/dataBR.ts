// apps/web/src/lib/dataBR.ts
// Utilitários de data no formato brasileiro (dd/mm/aaaa), no fuso LOCAL.

/** 'dd/mm/aaaa' → Date no fuso LOCAL; null se incompleto/inválido (ex.: 31/02). */
export function parseBR(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return dt;
}

/** Máscara dd/mm/aaaa enquanto digita, com dia limitado a 31 e mês a 12. */
export function mascaraData(v: string): string {
  const only = v.replace(/\D/g, '').slice(0, 8);
  let dia = only.slice(0, 2);
  let mes = only.slice(2, 4);
  const ano = only.slice(4, 8);
  if (dia.length === 2 && Number(dia) > 31) dia = '31';
  if (mes.length === 2 && Number(mes) > 12) mes = '12';
  let out = dia;
  if (only.length >= 3) out += '/' + mes;
  if (only.length >= 5) out += '/' + ano;
  return out;
}

/** Date → 'dd/mm/aaaa'. */
export function formatBR(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Compara se duas datas são o mesmo dia (ignora horário). */
export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
