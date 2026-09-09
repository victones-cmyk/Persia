// apps/web/src/hooks/useVersaoNova.ts
// Descobre que esta aba ficou para trás depois de um deploy.
//
// O problema é real e já custou caro: o Victor deixou o app aberto numa aba,
// subimos uma correção, e ele passou a investigação inteira concluindo que o
// deploy não tinha ido ao ar — quando o servidor já tinha tudo e o navegador
// dele é que rodava o JavaScript de antes. Nada na tela dizia isso.
//
// Compara o bundle que ESTA aba carregou com o que o servidor serve agora. Os
// dois vêm do mesmo lugar (o Vite versiona o nome por conteúdo), então
// diferença significa deploy novo — nunca falso positivo por cache de CDN.
//
// Não recarrega sozinho. Recarregar por conta própria descartaria um orçamento
// meio preenchido, que é bem pior que uma aba desatualizada. Quem decide é
// quem está com o trabalho na tela.

import { useEffect, useState } from 'react';

/** De quanto em quanto tempo perguntar. Deploy é raro; pergunta de hora em hora basta. */
const INTERVALO_MS = 60 * 60 * 1000;

/** O bundle que esta aba está rodando, lido da própria tag <script>. */
function bundleDaAba(): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src;
  return src?.match(/(index-[A-Za-z0-9_-]+\.js)/)?.[1] ?? null;
}

export function useVersaoNova(): boolean {
  const [temNova, setTemNova] = useState(false);

  useEffect(() => {
    const meu = bundleDaAba();
    // Em desenvolvimento não há bundle versionado — o hook fica inerte.
    if (!meu) return;

    let vivo = true;
    async function conferir() {
      if (!vivo || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/versao', { credentials: 'include' });
        if (!r.ok) return;
        const { bundle } = (await r.json()) as { bundle: string | null };
        if (vivo && bundle && bundle !== meu) setTemNova(true);
      } catch {
        // Sem rede ou servidor reiniciando: não é assunto deste aviso.
      }
    }

    void conferir();
    const timer = setInterval(() => { void conferir(); }, INTERVALO_MS);
    // Voltar para a aba é o momento em que a defasagem importa — é quando a
    // pessoa vai usar o app de novo, depois de horas com ele aberto.
    document.addEventListener('visibilitychange', conferir);
    window.addEventListener('focus', conferir);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', conferir);
      window.removeEventListener('focus', conferir);
    };
  }, []);

  return temNova;
}
