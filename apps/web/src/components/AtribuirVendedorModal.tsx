// apps/web/src/components/AtribuirVendedorModal.tsx
// Prompt que aparece pro admin ao salvar/enviar um orçamento sem vendedor
// atribuído ainda: pergunta se quer atribuir a alguém (o orçamento passa a
// aparecer na listagem dessa pessoa) ou deixar só para si mesmo.

import { useState } from 'react';

export function AtribuirVendedorModal({
  aberto,
  vendedores,
  onResolver,
  onFechar,
}: {
  aberto: boolean;
  vendedores: { id: string; nome: string }[];
  /** null = "Não" (fica só com o admin); string = id do vendedor escolhido. */
  onResolver: (vendedorId: string | null) => void;
  onFechar: () => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [selecionado, setSelecionado] = useState('');

  if (!aberto) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 420, width: '92%', boxShadow: 'var(--shadow-modal)', zIndex: 200 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {!escolhendo ? (
          <>
            <div className="text-lg-ui font-bold mb-1">Atribuir a um vendedor?</div>
            <div className="text-sm-ui text-neutral-600 mb-4">
              Deseja atribuir este orçamento a um vendedor? Ele passará a aparecer na listagem dele. Se preferir, fica só com você.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-default" onClick={() => onResolver(null)}>Não</button>
              <button type="button" className="btn btn-success" onClick={() => setEscolhendo(true)} autoFocus>Sim</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg-ui font-bold mb-1">Escolha o vendedor</div>
            <div className="mb-4">
              <label className="form-label" htmlFor="atribuir-vendedor-select">Vendedor</label>
              <select
                id="atribuir-vendedor-select"
                className="input"
                value={selecionado}
                onChange={(e) => setSelecionado(e.target.value)}
                autoFocus
              >
                <option value="">Selecione…</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-default" onClick={() => setEscolhendo(false)}>Voltar</button>
              <button type="button" className="btn btn-success" disabled={!selecionado} onClick={() => onResolver(selecionado)}>Atribuir</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
