// apps/web/src/pages/admin/AdminUsuarios.tsx
// CRUD de usuários (somente admin). Adicionar/editar via modal; desativar (soft delete).

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPen, faUserSlash, faUserCheck, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { CampoSenha } from '../../components/CampoSenha';
import { senhaValida } from '../../lib/validacao';

interface Loja {
  id: string;
  nome: string;
}
interface FuncionarioGc {
  id: string;
  nome: string;
}
interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: 'vendedor' | 'admin';
  loja_id: string | null;
  gc_usuario_id: string | null;
  ativo: boolean;
  senha_provisoria: boolean;
  loja?: Loja | null;
}

export function AdminUsuarios() {
  const { showToast } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Usuario | null | undefined>(undefined); // undefined=fechado, null=novo
  const [funcMap, setFuncMap] = useState<Record<string, string>>({}); // id do funcionário GC → nome
  const [desativarAlvo, setDesativarAlvo] = useState<Usuario | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<Usuario | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get<{ usuarios: Usuario[]; lojas: Loja[] }>('/admin/usuarios');
      setUsuarios(r.usuarios);
      setLojas(r.lojas);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Mapa id→nome dos funcionários do GC, para a coluna "Vendedor GC" mostrar o nome.
  useEffect(() => {
    api.get<{ funcionarios: FuncionarioGc[] }>('/admin/funcionarios-gc')
      .then((r) => setFuncMap(Object.fromEntries(r.funcionarios.map((f) => [f.id, f.nome]))))
      .catch(() => {});
  }, []);

  async function desativar(u: Usuario) {
    setDesativarAlvo(null);
    try {
      await api.post(`/admin/usuarios/${u.id}/desativar`);
      showToast('info', 'Usuário desativado');
      carregar();
    } catch (e) {
      showToast('error', 'Falha', e instanceof ApiError ? e.message : '');
    }
  }

  async function reativar(u: Usuario) {
    try {
      await api.put(`/admin/usuarios/${u.id}`, { ativo: true });
      showToast('success', 'Usuário reativado');
      carregar();
    } catch (e) {
      showToast('error', 'Falha', e instanceof ApiError ? e.message : '');
    }
  }

  async function excluir(u: Usuario) {
    setExcluirAlvo(null);
    try {
      await api.del(`/admin/usuarios/${u.id}`);
      showToast('success', 'Usuário excluído');
      carregar();
    } catch (e) {
      showToast('error', 'Não foi possível excluir', e instanceof ApiError ? e.message : '');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl-ui font-bold text-neutral-800">Usuários</h1>
        <button className="btn btn-success" onClick={() => setEditando(null)}>
          <FontAwesomeIcon icon={faPlus} /> Adicionar Usuário
        </button>
      </div>

      <div className="card p-0 table-scroll">
        <table className="data-table" style={{ minWidth: 1040 }}>
          <colgroup>
            <col />
            <col style={{ width: 180 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 132 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
              {['Nome', 'Usuário', 'Perfil', 'Loja', 'Vendedor GestãoClick', 'Ativo', 'Ações'].map((h) => (
                <th key={h} className={h === 'Ações' ? 'table-actions' : undefined} style={{ padding: 12, textAlign: 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={7} style={{ padding: 16 }}><div className="skeleton" style={{ height: 18 }} /></td></tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid #dee2e6', opacity: u.ativo ? 1 : 0.5 }}>
                  <td style={{ padding: 12 }} className="td-strong">
                    {u.nome}
                    {u.senha_provisoria && (
                      <span
                        className="badge ml-2"
                        style={{ background: 'var(--color-warning-subtle)', color: '#856404', borderColor: 'var(--color-warning-border)' }}
                        title="Senha provisória — o usuário trocará no primeiro acesso"
                      >
                        senha provisória
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12 }} className="text-sm-ui text-neutral-600">{u.email}</td>
                  <td style={{ padding: 12 }}><span className="badge badge-secondary">{u.perfil === 'admin' ? 'Administrador' : 'Vendedor'}</span></td>
                  <td style={{ padding: 12 }} className="text-sm-ui">{u.loja?.nome ?? '—'}</td>
                  <td style={{ padding: 12 }} className="text-sm-ui">{u.gc_usuario_id ? (funcMap[u.gc_usuario_id] ?? `ID ${u.gc_usuario_id}`) : <span className="text-error">—</span>}</td>
                  <td style={{ padding: 12 }} className="text-sm-ui">{u.ativo ? 'Sim' : 'Não'}</td>
                  <td style={{ padding: 12 }} className="table-actions">
                    <div className="table-actions-row">
                      <button className="btn btn-warning btn-xs" onClick={() => setEditando(u)} title="Editar"><FontAwesomeIcon icon={faPen} /></button>
                      {u.ativo
                        ? <button className="btn btn-danger btn-xs" onClick={() => setDesativarAlvo(u)} title="Desativar"><FontAwesomeIcon icon={faUserSlash} /></button>
                        : <button className="btn btn-success btn-xs" onClick={() => reativar(u)} title="Reativar"><FontAwesomeIcon icon={faUserCheck} /></button>}
                      <button className="btn btn-danger btn-xs" onClick={() => setExcluirAlvo(u)} title="Excluir"><FontAwesomeIcon icon={faTrash} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editando !== undefined && (
        <ModalUsuario
          usuario={editando}
          lojas={lojas}
          onFechar={() => setEditando(undefined)}
          onSalvo={() => {
            setEditando(undefined);
            carregar();
          }}
        />
      )}

      <ConfirmModal
        aberto={desativarAlvo !== null}
        titulo="Desativar usuário"
        mensagem={<>Deseja desativar o usuário <strong>{desativarAlvo?.nome}</strong>? Ele não conseguirá mais acessar a Pérsia até ser reativado.</>}
        confirmarLabel="Desativar"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => { if (desativarAlvo) void desativar(desativarAlvo); }}
        onCancelar={() => setDesativarAlvo(null)}
      />
      <ConfirmModal
        aberto={excluirAlvo !== null}
        titulo="Excluir usuário"
        mensagem={<>Excluir definitivamente o usuário <strong>{excluirAlvo?.nome}</strong>? Esta ação não pode ser desfeita.</>}
        confirmarLabel="Excluir"
        cancelarLabel="Voltar"
        perigo
        onConfirmar={() => { if (excluirAlvo) void excluir(excluirAlvo); }}
        onCancelar={() => setExcluirAlvo(null)}
      />
    </div>
  );
}

function ModalUsuario({
  usuario,
  lojas,
  onFechar,
  onSalvo,
}: {
  usuario: Usuario | null;
  lojas: Loja[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { showToast } = useToast();
  const novo = usuario === null;
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<'' | 'vendedor' | 'admin'>(usuario?.perfil ?? '');
  const [lojaId, setLojaId] = useState(usuario?.loja_id ?? '');
  const [gcUsuarioId, setGcUsuarioId] = useState(usuario?.gc_usuario_id ?? '');
  const [salvando, setSalvando] = useState(false);

  // Seletor de vendedor: lista de funcionários do GestãoClick (carregada da API).
  const [funcionarios, setFuncionarios] = useState<FuncionarioGc[]>([]);
  const [carregandoFunc, setCarregandoFunc] = useState(true);
  const [gcOffline, setGcOffline] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await api.get<{ funcionarios: FuncionarioGc[]; gc_offline: boolean }>('/admin/funcionarios-gc');
        if (!vivo) return;
        setFuncionarios(r.funcionarios);
        setGcOffline(r.gc_offline);
      } catch {
        if (vivo) setGcOffline(true);
      } finally {
        if (vivo) setCarregandoFunc(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // O vínculo atual pode apontar para um funcionário inativo/fora da lista —
  // preserva como opção extra para não perder o vínculo ao editar.
  const vinculoForaDaLista = gcUsuarioId && !funcionarios.some((f) => f.id === gcUsuarioId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Senha (quando informada) deve respeitar a política: mín. 8, com letra e número.
    if (senha && !senhaValida(senha)) {
      showToast('error', 'Senha fraca', 'A senha deve ter ao menos 8 caracteres, com uma letra e um número.');
      return;
    }
    setSalvando(true);
    try {
      const body = {
        nome,
        email,
        perfil,
        loja_id: lojaId || null,
        gc_usuario_id: gcUsuarioId || null,
        ...(senha ? { senha } : {}),
      };
      if (novo) await api.post('/admin/usuarios', body);
      else await api.put(`/admin/usuarios/${usuario!.id}`, body);
      showToast('success', novo ? 'Usuário criado' : 'Usuário atualizado');
      onSalvo();
    } catch (e) {
      showToast('error', 'Falha ao salvar', e instanceof ApiError ? e.message : '');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onFechar}>
      <div className="card" style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 460, width: '92%', boxShadow: 'var(--shadow-modal)', zIndex: 200, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="text-lg-ui font-bold mb-3">{novo ? 'Adicionar usuário' : 'Editar usuário'}</div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="form-label">Nome<span className="label-required">*</span></label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Usuário<span className="label-required">*</span></label>
            <input className="input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Senha {novo ? <span className="label-required">*</span> : <span className="label-optional">(deixe em branco p/ manter)</span>}</label>
            <CampoSenha value={senha} onChange={(e) => setSenha(e.target.value)} required={novo} autoComplete="new-password" />
            <div className="helper-text">{novo ? 'Senha provisória (mín. 8, com letra e número) — o usuário definirá a sua no primeiro acesso.' : 'Se preenchida (mín. 8, com letra e número), vira provisória e o usuário troca no próximo login.'}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Perfil<span className="label-required">*</span></label>
              <select className="input" value={perfil} required onChange={(e) => setPerfil(e.target.value as '' | 'vendedor' | 'admin')}>
                <option value="">Selecione</option>
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="form-label">Loja</label>
              <select className="input" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
                <option value="">Selecione</option>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Vendedor (GestãoClick)</label>
            {carregandoFunc ? (
              <div className="input flex items-center text-neutral-500 text-sm-ui">
                <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Carregando…
              </div>
            ) : gcOffline ? (
              <>
                <input
                  className="input"
                  value={gcUsuarioId}
                  onChange={(e) => setGcUsuarioId(e.target.value)}
                  placeholder="ID do vendedor no GC"
                />
                <div className="helper-text mt-1" style={{ color: 'var(--action-edit)' }}>GestãoClick indisponível — informe o ID manualmente.</div>
              </>
            ) : (
              <select className="input" value={gcUsuarioId} onChange={(e) => setGcUsuarioId(e.target.value)}>
                <option value="">Selecione</option>
                {vinculoForaDaLista && <option value={gcUsuarioId}>Vínculo atual (ID {gcUsuarioId})</option>}
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-default" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn btn-success" disabled={salvando}>
              {salvando ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
