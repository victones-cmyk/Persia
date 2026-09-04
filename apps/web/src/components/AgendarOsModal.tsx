// apps/web/src/components/AgendarOsModal.tsx
// Marca a visita técnica a partir do orçamento — o caminho "vende primeiro,
// mede depois". Antes disso o vendedor abria o app Agenda e refazia o cadastro
// do cliente à mão; aqui cliente, endereço e telefone vêm do GestãoClick.
//
// Os ambientes que ele lista aqui nascem com identidade própria e chegam ao
// técnico já nomeados, dizendo o que medir. As medidas voltam pela mesma
// identidade, sem ninguém redigitar em nenhum dos sentidos.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPlus, faTrash, faCalendarPlus } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';

type TipoOs = 'measurement' | 'installation';
type TipoProduto = 'persiana' | 'cortina';

interface Tecnico { id: number; name: string }

interface AmbienteLinha {
  id: string;
  nome: string;
  tipos: TipoProduto[];
  trilho: boolean;
}

interface ClienteCompleto {
  nome: string;
  telefone: string | null;
  celular: string | null;
  endereco: { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string } | null;
}

const linhaVazia = (): AmbienteLinha => ({ id: crypto.randomUUID(), nome: '', tipos: [], trilho: false });

/** Endereço do GestãoClick em uma linha só, como o técnico precisa ler no celular. */
function enderecoEmTexto(e: ClienteCompleto['endereco']): string {
  if (!e) return '';
  const linha = [e.logradouro, e.numero].filter(Boolean).join(', ');
  return [linha, e.complemento, e.bairro, [e.cidade, e.estado].filter(Boolean).join('/')]
    .filter((p) => p && String(p).trim() !== '')
    .join(' - ');
}

export function AgendarOsModal({
  aberto,
  orcamentoId,
  nomeCliente,
  gcClienteId,
  onAgendado,
  onFechar,
}: {
  aberto: boolean;
  orcamentoId: string;
  nomeCliente: string;
  gcClienteId: string | null;
  onAgendado: () => void;
  onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoOs>('measurement');
  const [data, setData] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [cliente, setCliente] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [ambientes, setAmbientes] = useState<AmbienteLinha[]>([linhaVazia()]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTipo('measurement');
    // Padrão: amanhã. Marcar visita para hoje é exceção, não regra.
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    setData(amanha.toISOString().slice(0, 10));
    setTecnicoId(''); setCliente(nomeCliente === '(sem cliente)' ? '' : nomeCliente);
    setEndereco(''); setTelefone(''); setCep(''); setObservacoes('');
    setAmbientes([linhaVazia()]); setErro(null);

    let vivo = true;
    setCarregando(true);
    // Técnicos e dados do cliente em paralelo: nenhum dos dois bloqueia o outro,
    // e falhar em qualquer um deixa o agendamento possível com preenchimento manual.
    Promise.allSettled([
      api.get<{ tecnicos: Tecnico[] }>('/agenda/tecnicos'),
      gcClienteId ? api.get<{ cliente: ClienteCompleto }>(`/gc/clientes/${encodeURIComponent(gcClienteId)}/completo`) : Promise.reject(),
    ]).then(([rt, rc]) => {
      if (!vivo) return;
      if (rt.status === 'fulfilled') setTecnicos(rt.value.tecnicos);
      if (rc.status === 'fulfilled') {
        const c = rc.value.cliente;
        setCliente(c.nome || nomeCliente);
        setEndereco(enderecoEmTexto(c.endereco));
        setTelefone(c.celular || c.telefone || '');
        setCep(c.endereco?.cep ?? '');
      }
    }).finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [aberto, nomeCliente, gcClienteId]);

  if (!aberto) return null;

  const alterar = (id: string, patch: Partial<AmbienteLinha>) =>
    setAmbientes((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const alternarTipo = (a: AmbienteLinha, t: TipoProduto) => {
    const tipos = a.tipos.includes(t) ? a.tipos.filter((x) => x !== t) : [...a.tipos, t];
    alterar(a.id, { tipos, trilho: tipos.includes('cortina') ? a.trilho : false });
  };

  const nomeados = ambientes.filter((a) => a.nome.trim() !== '');
  const podeAgendar = cliente.trim() !== '' && !salvando && !carregando;

  async function agendar() {
    if (!podeAgendar) return;
    setSalvando(true); setErro(null);
    try {
      await api.post(`/orcamentos/${orcamentoId}/agenda/agendar`, {
        tipo,
        // Meio-dia evita que o fuso jogue o agendamento para o dia anterior.
        agendado_para: data ? `${data}T12:00:00` : undefined,
        tecnico_id: tecnicoId ? Number(tecnicoId) : undefined,
        cliente_nome: cliente.trim(),
        cliente_endereco: endereco.trim(),
        cliente_telefone: telefone.trim(),
        cliente_cep: cep.trim(),
        observacoes: observacoes.trim(),
        ambientes: nomeados.map((a) => ({
          nome: a.nome.trim(),
          tipos_produto: a.tipos,
          trilho_especial: a.trilho,
        })),
      });
      onAgendado();
    } catch (e) {
      setErro(e instanceof ApiError
        ? (e.data as { message?: string } | null)?.message ?? e.message
        : 'Não foi possível criar a OS no Agenda.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => !salvando && onFechar()}
    >
      <div
        className="card"
        style={{ background: '#fff', borderRadius: 3, maxWidth: 620, width: '100%', maxHeight: '90vh', boxShadow: 'var(--shadow-modal)', zIndex: 200, display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agendar-os-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ overflowY: 'auto', padding: 20 }}>
          <div className="text-lg-ui font-bold mb-1" id="agendar-os-titulo">Agendar visita técnica</div>
          <div className="text-sm-ui text-neutral-600 mb-4">
            A OS é criada no Agenda já vinculada a este orçamento. Os ambientes que você listar chegam ao técnico dizendo o que medir.
          </div>

          {carregando && (
            <div className="text-neutral-500 text-sm-ui mb-3"><FontAwesomeIcon icon={faSpinner} spin /> Buscando dados do cliente…</div>
          )}

          <div className="grid grid-cols-12 gap-2 mb-2">
            <div className="col-span-12 md:col-span-4">
              <label className="form-label" htmlFor="os-tipo">Tipo</label>
              <select id="os-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOs)}>
                <option value="measurement">Medição</option>
                <option value="installation">Instalação</option>
              </select>
            </div>
            <div className="col-span-6 md:col-span-4">
              <label className="form-label" htmlFor="os-data">Data</label>
              <input id="os-data" className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="col-span-6 md:col-span-4">
              <label className="form-label" htmlFor="os-tecnico">Técnico <span className="label-optional">(opcional)</span></label>
              <select id="os-tecnico" className="input" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                <option value="">A definir</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-2">
            <div className="col-span-12 md:col-span-7">
              <label className="form-label" htmlFor="os-cliente">Cliente<span className="label-required">*</span></label>
              <input id="os-cliente" className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={100} />
            </div>
            <div className="col-span-7 md:col-span-3">
              <label className="form-label" htmlFor="os-telefone">Telefone</label>
              <input id="os-telefone" className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} />
            </div>
            <div className="col-span-5 md:col-span-2">
              <label className="form-label" htmlFor="os-cep">CEP</label>
              <input id="os-cep" className="input" value={cep} onChange={(e) => setCep(e.target.value)} maxLength={20} />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="os-endereco">Endereço</label>
            <input id="os-endereco" className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={500} placeholder="Rua, número, bairro, cidade" />
            <div className="helper-text">Vem do cadastro no GestãoClick. Ajuste se a visita for em outro lugar.</div>
          </div>

          <div className="form-label">Ambientes a medir <span className="label-optional">(opcional)</span></div>
          <div className="helper-text mb-2">O técnico recebe esta lista e completa as medidas. Marque o que já estiver decidido.</div>
          <div className="space-y-2 mb-2">
            {ambientes.map((a) => (
              <div key={a.id} className="rounded-sm border border-neutral-300 p-2 flex flex-wrap items-center gap-2" style={{ background: 'var(--neutral-50)' }}>
                <input
                  className="input"
                  style={{ flex: '1 1 160px', minWidth: 0 }}
                  value={a.nome}
                  onChange={(e) => alterar(a.id, { nome: e.target.value })}
                  placeholder="Ex.: Sacada frente"
                  maxLength={100}
                  aria-label="Nome do ambiente"
                />
                {(['persiana', 'cortina'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-xs-ui text-neutral-700" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={a.tipos.includes(t)} onChange={() => alternarTipo(a, t)} />
                    {t === 'persiana' ? 'Persiana' : 'Cortina'}
                  </label>
                ))}
                {a.tipos.includes('cortina') && (
                  <label className="flex items-center gap-1 text-xs-ui text-neutral-600" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={a.trilho} onChange={(e) => alterar(a.id, { trilho: e.target.checked })} />
                    Trilho
                  </label>
                )}
                <button
                  type="button"
                  className="text-error hover:opacity-80 text-xs-ui"
                  onClick={() => setAmbientes((xs) => (xs.length === 1 ? [linhaVazia()] : xs.filter((x) => x.id !== a.id)))}
                  aria-label="Remover ambiente"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-default btn-xs mb-3" onClick={() => setAmbientes((xs) => [...xs, linhaVazia()])}>
            <FontAwesomeIcon icon={faPlus} /> Adicionar ambiente
          </button>

          <label className="form-label" htmlFor="os-obs">Observações para o técnico <span className="label-optional">(opcional)</span></label>
          <textarea id="os-obs" className="input" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} style={{ height: 'auto' }} />

          {erro && <div className="helper-error mt-3">{erro}</div>}
        </div>

        <div className="flex justify-end gap-2" style={{ padding: '12px 20px', borderTop: '1px solid var(--neutral-300)' }}>
          <button type="button" className="btn btn-default" disabled={salvando} onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-success" disabled={!podeAgendar} onClick={() => void agendar()}>
            {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faCalendarPlus} /> Criar OS</>}
          </button>
        </div>
      </div>
    </div>
  );
}
