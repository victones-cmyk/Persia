export function erroGcLegivel(erro: string | null | undefined): string {
  if (!erro) return 'Erro não informado.';
  if (!/<html[\s>]|<!doctype html/i.test(erro)) return erro;

  const codigo = erro.match(/Error code\s*(\d{3})/i)?.[1] ?? erro.match(/HTTP\s*(\d{3})/i)?.[1] ?? '5xx';
  const host = erro.match(/<span[^>]*>\s*([^<]*\.[^<]*)\s*<\/span>\s*<h3[^>]*>[\s\S]*?Host/i)?.[1]?.trim()
    ?? erro.match(/campaign=([^"&]+).*?Host/i)?.[1]?.trim()
    ?? null;
  const alvo = host ? ` (${host})` : '';
  return `GestãoClick indisponível${alvo}: servidor retornou HTTP ${codigo}. Tente reenviar em alguns minutos.`;
}
