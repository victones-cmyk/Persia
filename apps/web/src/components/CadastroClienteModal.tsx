// apps/web/src/components/CadastroClienteModal.tsx
// Cadastro completo de cliente no GestãoClick (PF ou PJ) — aberto a partir da busca
// de cliente (ClienteSearch) quando o vendedor/admin não encontra o cliente. Envia
// pra API real do GC; a Pérsia não guarda cliente nenhum por conta própria.

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faLocationDot, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { mascaraCpf, mascaraCnpj, mascaraTelefone, mascaraCep, cpfValido, cnpjValido } from '../lib/documentoBR';
import type { ClienteResumo } from '../lib/calcTypes';

type TipoPessoa = 'PF' | 'PJ';

interface Erros {
  nome?: string;
  documento?: string;
  email?: string;
  cep?: string;
}

const CAMPOS_VAZIOS = {
  razaoSocial: '', documento: '', email: '', telefone: '', celular: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
};

export function CadastroClienteModal({
  aberto,
  nomeInicial,
  onCriado,
  onFechar,
}: {
  aberto: boolean;
  nomeInicial?: string;
  onCriado: (cliente: ClienteResumo) => void;
  onFechar: () => void;
}) {
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>('PF');
  const [nome, setNome] = useState('');
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [mostrarEndereco, setMostrarEndereco] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  // Cliente que já existe no GestãoClick com este documento. Cadastrar de novo
  // criaria duplicata — e duplicata de cliente espalha histórico em dois lugares.
  const [duplicado, setDuplicado] = useState<ClienteResumo | null>(null);
  const [verificandoDoc, setVerificandoDoc] = useState(false);

  // Reseta o formulário toda vez que o modal abre (evita sobrar dado de uma
  // tentativa anterior se o vendedor abrir de novo pra outro cliente).
  useEffect(() => {
    if (!aberto) return;
    setTipoPessoa('PF');
    setNome(nomeInicial?.trim() ?? '');
    setCampos(CAMPOS_VAZIOS);
    setMostrarEndereco(false);
    setErros({});
    setErroGeral(null);
    setDuplicado(null);
  }, [aberto, nomeInicial]);

  // Busca o endereço assim que o CEP fica completo — esperar o vendedor sair do
  // campo fazia parecer que não funcionava, que é como isto foi reportado.
  const cepBuscado = useRef('');
  useEffect(() => {
    const limpo = campos.cep.replace(/\D/g, '');
    if (limpo.length !== 8 || cepBuscado.current === limpo) return;
    cepBuscado.current = limpo;
    void buscarCep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos.cep]);

  // Procura no GestãoClick assim que o documento fica válido: cadastrar de novo
  // alguém que já existe espalha o histórico do cliente em dois cadastros.
  const docVerificado = useRef('');
  useEffect(() => {
    const doc = campos.documento.replace(/\D/g, '');
    const valido = tipoPessoa === 'PF' ? cpfValido(doc) : cnpjValido(doc);
    if (!valido) { setDuplicado(null); return; }
    if (docVerificado.current === doc) return;
    docVerificado.current = doc;

    let vivo = true;
    setVerificandoDoc(true);
    api.get<{ clientes: ClienteResumo[] }>(`/gc/clientes?q=${encodeURIComponent(doc)}`)
      .then((r) => {
        if (!vivo) return;
        // A busca por documento é por prefixo no GC, então confirma que o
        // documento realmente bate antes de acusar duplicata.
        const igual = r.clientes.find((c) => (c.documento ?? '').replace(/\D/g, '') === doc);
        setDuplicado(igual ?? null);
      })
      .catch(() => { if (vivo) setDuplicado(null); })
      .finally(() => { if (vivo) setVerificandoDoc(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos.documento, tipoPessoa]);

  if (!aberto) return null;

  function alterar(patch: Partial<typeof CAMPOS_VAZIOS>) {
    setCampos((atual) => ({ ...atual, ...patch }));
  }

  async function buscarCep() {
    const cepLimpo = campos.cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8 || buscandoCep) return;
    setBuscandoCep(true);
    try {
      // Pelo backend: a CSP do app não deixa o navegador falar com serviço externo.
      const r = await api.get<{ endereco: { logradouro: string; bairro: string; cidade: string; estado: string } | null }>(
        `/cep/${cepLimpo}`,
      );
      if (r.endereco) {
        alterar({
          logradouro: r.endereco.logradouro || campos.logradouro,
          bairro: r.endereco.bairro || campos.bairro,
          cidade: r.endereco.cidade || campos.cidade,
          estado: r.endereco.estado || campos.estado,
        });
      }
    } catch {
      // ViaCEP fora do ar não deve travar o cadastro — o vendedor preenche à mão.
    } finally {
      setBuscandoCep(false);
    }
  }

  function validar(): boolean {
    const novosErros: Erros = {};
    if (nome.trim().length < 2) novosErros.nome = 'Informe o nome.';
    const doc = campos.documento.trim();
    if (doc) {
      const ok = tipoPessoa === 'PF' ? cpfValido(doc) : cnpjValido(doc);
      if (!ok) novosErros.documento = tipoPessoa === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.';
    }
    const email = campos.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) novosErros.email = 'E-mail inválido.';
    if (mostrarEndereco) {
      const cepLimpo = campos.cep.replace(/\D/g, '');
      if (cepLimpo && cepLimpo.length !== 8) novosErros.cep = 'CEP incompleto.';
    }
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar() {
    if (!validar()) return;
    setSalvando(true);
    setErroGeral(null);
    try {
      const r = await api.post<{ cliente: ClienteResumo }>('/gc/clientes', {
        tipo_pessoa: tipoPessoa,
        nome: nome.trim(),
        razao_social: tipoPessoa === 'PJ' ? campos.razaoSocial.trim() : undefined,
        cpf: tipoPessoa === 'PF' ? campos.documento.trim() : undefined,
        cnpj: tipoPessoa === 'PJ' ? campos.documento.trim() : undefined,
        email: campos.email.trim(),
        telefone: campos.telefone.trim(),
        celular: campos.celular.trim(),
        ...(mostrarEndereco ? {
          endereco: {
            cep: campos.cep.trim(),
            logradouro: campos.logradouro.trim(),
            numero: campos.numero.trim(),
            complemento: campos.complemento.trim(),
            bairro: campos.bairro.trim(),
            cidade: campos.cidade.trim(),
            estado: campos.estado.trim(),
          },
        } : {}),
      });
      onCriado(r.cliente);
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.data as { message?: string } | null)?.message ?? e.message
        : 'Não foi possível cadastrar o cliente.';
      setErroGeral(msg);
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
        style={{ background: '#fff', borderRadius: 3, padding: 20, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)', zIndex: 200 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cliente-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg-ui font-bold mb-1" id="novo-cliente-titulo">Novo cliente</div>
        <div className="text-sm-ui text-neutral-600 mb-4">Cadastrado direto no GestãoClick.</div>

        <div className="flex gap-2 mb-3">
          <button type="button" className={tipoPessoa === 'PF' ? 'btn btn-success flex-1' : 'btn btn-default flex-1'} onClick={() => setTipoPessoa('PF')}>
            Pessoa física
          </button>
          <button type="button" className={tipoPessoa === 'PJ' ? 'btn btn-success flex-1' : 'btn btn-default flex-1'} onClick={() => setTipoPessoa('PJ')}>
            Pessoa jurídica
          </button>
        </div>

        <div className="grid grid-cols-12 gap-2 mb-1">
          <div className={tipoPessoa === 'PJ' ? 'col-span-12 md:col-span-6' : 'col-span-12'}>
            <label className="form-label" htmlFor="cc-nome">
              {tipoPessoa === 'PJ' ? 'Nome fantasia' : 'Nome'}<span className="label-required">*</span>
            </label>
            <input
              id="cc-nome"
              className={erros.nome ? 'input input-error' : 'input'}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={150}
              autoFocus
            />
            {erros.nome && <div className="helper-error">{erros.nome}</div>}
          </div>
          {tipoPessoa === 'PJ' && (
            <div className="col-span-12 md:col-span-6">
              <label className="form-label" htmlFor="cc-razao">Razão social <span className="label-optional">(opcional)</span></label>
              <input id="cc-razao" className="input" value={campos.razaoSocial} onChange={(e) => alterar({ razaoSocial: e.target.value })} maxLength={150} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2 mb-1">
          <div className="col-span-12 md:col-span-6">
            <label className="form-label" htmlFor="cc-documento">{tipoPessoa === 'PF' ? 'CPF' : 'CNPJ'} <span className="label-optional">(opcional)</span></label>
            <input
              id="cc-documento"
              className={erros.documento ? 'input input-error' : 'input'}
              value={campos.documento}
              onChange={(e) => alterar({ documento: tipoPessoa === 'PF' ? mascaraCpf(e.target.value) : mascaraCnpj(e.target.value) })}
              placeholder={tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
            />
            {erros.documento && <div className="helper-error">{erros.documento}</div>}
            {verificandoDoc && <div className="helper-text"><FontAwesomeIcon icon={faSpinner} spin /> Procurando no GestãoClick…</div>}
          </div>
          <div className="col-span-12 md:col-span-6">
            <label className="form-label" htmlFor="cc-email">E-mail <span className="label-optional">(opcional)</span></label>
            <input
              id="cc-email"
              className={erros.email ? 'input input-error' : 'input'}
              type="email"
              value={campos.email}
              onChange={(e) => alterar({ email: e.target.value })}
              maxLength={150}
            />
            {erros.email && <div className="helper-error">{erros.email}</div>}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2 mb-3">
          <div className="col-span-6">
            <label className="form-label" htmlFor="cc-telefone">Telefone <span className="label-optional">(opcional)</span></label>
            <input id="cc-telefone" className="input" value={campos.telefone} onChange={(e) => alterar({ telefone: mascaraTelefone(e.target.value) })} placeholder="(11) 3333-4444" />
          </div>
          <div className="col-span-6">
            <label className="form-label" htmlFor="cc-celular">Celular <span className="label-optional">(opcional)</span></label>
            <input id="cc-celular" className="input" value={campos.celular} onChange={(e) => alterar({ celular: mascaraTelefone(e.target.value) })} placeholder="(11) 99999-9999" />
          </div>
        </div>

        {!mostrarEndereco ? (
          <button type="button" className="btn btn-default btn-xs mb-3" onClick={() => setMostrarEndereco(true)}>
            <FontAwesomeIcon icon={faLocationDot} /> Adicionar endereço
          </button>
        ) : (
          <div className="rounded-sm border border-neutral-300 p-3 mb-3" style={{ background: 'var(--neutral-50)' }}>
            <div className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-6 md:col-span-4">
                <label className="form-label" htmlFor="cc-cep">CEP</label>
                <input
                  id="cc-cep"
                  className={erros.cep ? 'input input-error' : 'input'}
                  value={campos.cep}
                  onChange={(e) => alterar({ cep: mascaraCep(e.target.value) })}
                  onBlur={buscarCep}
                  placeholder="00000-000"
                />
                {erros.cep && <div className="helper-error">{erros.cep}</div>}
                {buscandoCep && <div className="helper-text"><FontAwesomeIcon icon={faSpinner} spin /> Buscando endereço…</div>}
              </div>
              <div className="col-span-6 md:col-span-4">
                <label className="form-label" htmlFor="cc-cidade">Cidade</label>
                <input id="cc-cidade" className="input" value={campos.cidade} onChange={(e) => alterar({ cidade: e.target.value })} />
              </div>
              <div className="col-span-6 md:col-span-4">
                <label className="form-label" htmlFor="cc-estado">Estado</label>
                <input id="cc-estado" className="input" value={campos.estado} onChange={(e) => alterar({ estado: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} placeholder="SP" />
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 md:col-span-6">
                <label className="form-label" htmlFor="cc-logradouro">Logradouro</label>
                <input id="cc-logradouro" className="input" value={campos.logradouro} onChange={(e) => alterar({ logradouro: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-2">
                <label className="form-label" htmlFor="cc-numero">Número</label>
                <input id="cc-numero" className="input" value={campos.numero} onChange={(e) => alterar({ numero: e.target.value })} />
              </div>
              <div className="col-span-8 md:col-span-4">
                <label className="form-label" htmlFor="cc-complemento">Complemento</label>
                <input id="cc-complemento" className="input" value={campos.complemento} onChange={(e) => alterar({ complemento: e.target.value })} />
              </div>
              <div className="col-span-12">
                <label className="form-label" htmlFor="cc-bairro">Bairro</label>
                <input id="cc-bairro" className="input" value={campos.bairro} onChange={(e) => alterar({ bairro: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {duplicado && (
          <div className="alert alert-warning mb-3 text-sm-ui" style={{ display: 'block' }}>
            <div className="font-semibold mb-1">
              <FontAwesomeIcon icon={faTriangleExclamation} /> Este {tipoPessoa === 'PF' ? 'CPF' : 'CNPJ'} já tem cadastro
            </div>
            <div className="text-xs-ui mb-2">
              <strong>{duplicado.nome}</strong>
              {duplicado.documento ? ` · ${duplicado.documento}` : ''}
              {' '}— cadastrar de novo criaria um cliente duplicado, e o histórico dele ficaria dividido em dois.
            </div>
            <button type="button" className="btn btn-success btn-xs" onClick={() => onCriado(duplicado)}>
              Usar este cliente
            </button>
          </div>
        )}

        {erroGeral && <div className="helper-error mb-2">{erroGeral}</div>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn btn-default" disabled={salvando} onClick={onFechar}>Cancelar</button>
          <button
            type="button"
            className={duplicado ? 'btn btn-default' : 'btn btn-success'}
            disabled={salvando}
            onClick={salvar}
            title={duplicado ? 'Vai criar um segundo cadastro com este mesmo documento' : undefined}
          >
            {salvando && <FontAwesomeIcon icon={faSpinner} spin />}
            {duplicado ? ' Cadastrar mesmo assim' : ' Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
