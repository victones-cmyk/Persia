// apps/web/src/components/AvisoAmbientesRepetidos.tsx
// Avisa quando várias peças recebem o mesmo nome de ambiente.
//
// Nome repetido não é erro — a sacada dividida em folhas é exatamente isso, e o
// app depende disso para somar as folhas de um vão só. O problema é quando são
// vãos DIFERENTES com o mesmo nome, porque aí a medição do técnico não tem como
// casar com a peça certa.
//
// Aconteceu no pedido 76127: a vendedora escreveu "SALA" em três cortinas que
// ficavam em três janelas distintas. O técnico mediu os três vãos, nada pareou
// sozinho, e alguém teve que ligar peça por peça na mão depois.
//
// Por isso avisa e não impede: quem sabe se são um vão ou três é quem falou com
// o cliente.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb } from '@fortawesome/free-solid-svg-icons';

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nomes que aparecem em mais de uma peça, na ordem em que surgiram. */
export function ambientesRepetidos(nomes: string[]): { nome: string; vezes: number }[] {
  const contagem = new Map<string, { nome: string; vezes: number }>();
  for (const bruto of nomes) {
    const nome = (bruto ?? '').trim();
    if (!nome) continue;
    const k = normalizar(nome);
    const atual = contagem.get(k);
    if (atual) atual.vezes += 1;
    else contagem.set(k, { nome, vezes: 1 });
  }
  return [...contagem.values()].filter((c) => c.vezes > 1);
}

export function AvisoAmbientesRepetidos({ nomes }: { nomes: string[] }) {
  const repetidos = ambientesRepetidos(nomes);
  if (repetidos.length === 0) return null;

  const lista = repetidos.map((r) => `${r.vezes} peças em "${r.nome}"`).join('; ');

  return (
    <div
      className="text-xs-ui mb-3"
      style={{
        border: '1px solid var(--color-info-border)',
        background: 'var(--color-info-subtle)',
        color: 'var(--color-info-text)',
        borderRadius: 3,
        padding: '8px 12px',
      }}
    >
      <FontAwesomeIcon icon={faLightbulb} /> {lista}.{' '}
      Se forem <strong>vãos diferentes</strong>, vale numerar — "Sala 1", "Sala 2", "Sala Jantar".
      A medição do técnico casa sozinha com cada peça, e ninguém precisa ligar uma por uma depois.
      Se for <strong>um vão só dividido em folhas</strong>, deixe repetido mesmo: é assim que o app
      soma a largura toda.
    </div>
  );
}
