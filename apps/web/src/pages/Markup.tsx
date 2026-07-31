// apps/web/src/pages/Markup.tsx
// Markup próprio da revenda (autoatendimento — diferente do desconto, que é
// definido pelo admin). Passa a aparecer na calculadora de orçamento, mostrando
// o custo (já com desconto embutido) ao lado do preço sugerido ao cliente dela.

import { useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPercent } from '@fortawesome/free-solid-svg-icons';
import { useAuth, type Usuario } from '../hooks/useAuth';
import { api, ApiError } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { formatBRL } from '../lib/formatacao';

export function Markup() {
  const { usuario, atualizarUsuario } = useAuth();
  const { showToast } = useToast();
  const [markup, setMarkup] = useState(usuario?.markup_percentual != null ? String(usuario.markup_percentual) : '');
  const [salvando, setSalvando] = useState(false);

  const markupNum = Math.max(0, Number(markup) || 0);
  const custoExemplo = 100;
  const vendaExemplo = custoExemplo * (1 + markupNum / 100);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.put<{ usuario: Usuario }>('/auth/markup', {
        markup_percentual: markup === '' ? null : Number(markup),
      });
      atualizarUsuario(r.usuario);
      showToast('success', 'Markup salvo', 'A calculadora de orçamento já mostra o preço sugerido com esse markup.');
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl-ui font-bold text-neutral-800 mb-4">Markup</h1>

      <div className="card p-4 max-w-form">
        <p className="text-sm-ui text-neutral-600 mb-4">
          Defina o quanto você quer adicionar em cima do seu custo (o valor já com o desconto da sua revenda). Esse
          percentual passa a aparecer em todo orçamento que você montar, mostrando o preço sugerido para o seu cliente.
        </p>

        <form onSubmit={salvar} className="space-y-3">
          <div>
            <label className="form-label" htmlFor="markup-input">Markup (%)</label>
            <div className="relative">
              <input
                id="markup-input"
                type="number"
                className="input"
                min={0}
                max={999.99}
                step={1}
                placeholder="0"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
              />
              <span style={{ position: 'absolute', right: 10, top: 10, color: 'var(--neutral-500)' }}>
                <FontAwesomeIcon icon={faPercent} />
              </span>
            </div>
          </div>

          {markupNum > 0 && (
            <div className="bg-neutral-50 border border-neutral-300 rounded-sm p-3 text-xs-ui space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-600">Exemplo — custo</span>
                <span className="font-mono tabular-nums text-neutral-800">{formatBRL(custoExemplo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Preço sugerido ao seu cliente ({markupNum}%)</span>
                <span className="font-mono tabular-nums font-semibold" style={{ color: 'var(--color-success)' }}>{formatBRL(vendaExemplo)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button type="submit" className="btn btn-success" disabled={salvando}>
              {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
