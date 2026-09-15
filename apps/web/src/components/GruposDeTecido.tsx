// apps/web/src/components/GruposDeTecido.tsx
// Como a Pérsia enxerga os rolos do mesmo tecido.
//
// Esta tela existe porque agrupamento errado NÃO dá erro. Ele só deixa de
// recomendar o rolo mais barato, ou — pior — recomenda o de outra cor. As duas
// coisas passam despercebidas na operação: ninguém repara numa sugestão que
// não apareceu.
//
// Enquanto o agrupamento sai do nome, isso depende de o nome trazer a largura
// no fim. Quando o campo COD TECIDO estiver preenchido nos dois rolos, ele
// manda — e a linha mostra de qual dos dois o grupo veio.

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLayerGroup, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '../lib/api';
import { formatNum } from '../lib/formatacao';

interface Rolo { id: string; nome: string; dimensao_m: number; codigo_tecido: string }
interface Grupo { chave: string; por_codigo: boolean; rolos: Rolo[] }
interface Resposta { total_tecidos: number; com_codigo: number; grupos: Grupo[]; orfaos: Grupo[] }

export function GruposDeTecido() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<Resposta>('/admin/gc/tecidos/grupos')
      .then(setDados)
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar.'));
  }, []);

  if (erro) return <div className="card p-4 text-sm-ui text-danger">{erro}</div>;
  if (!dados) return <div className="card p-4"><div className="skeleton" style={{ height: 96 }} /></div>;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-1">
        <FontAwesomeIcon icon={faLayerGroup} className="text-neutral-500" />
        <div>
          <div className="text-lg-ui font-semibold text-neutral-800">Tecidos com mais de um rolo</div>
          <div className="text-sm-ui text-neutral-600">
            {dados.grupos.length} de {dados.total_tecidos} tecidos têm larguras alternativas.{' '}
            {dados.com_codigo > 0
              ? `${dados.com_codigo} com COD TECIDO preenchido.`
              : 'Nenhum com COD TECIDO ainda — o agrupamento está saindo do nome.'}
          </div>
        </div>
      </div>

      {dados.orfaos.length > 0 && (
        <div className="alert alert-warning my-3 text-xs-ui">
          <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
          <strong>{dados.orfaos.length} com COD TECIDO que não pareou com ninguém.</strong>{' '}
          Quem preenche um código espera parear — sozinho, quase sempre é digitação diferente
          entre os dois rolos:
          <ul className="mt-1 ml-4" style={{ listStyle: 'disc' }}>
            {dados.orfaos.map((o) => (
              <li key={o.rolos[0].id}>
                <span className="font-mono">{o.rolos[0].codigo_tecido}</span> — {o.rolos[0].nome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dados.grupos.length === 0 ? (
        <div className="text-sm-ui text-neutral-500 mt-3">Nenhum tecido com largura alternativa.</div>
      ) : (
        <div className="flex flex-col gap-3 mt-3">
          {dados.grupos.map((g) => (
            <div key={g.chave} style={{ borderLeft: '2px solid var(--neutral-300)', paddingLeft: 10 }}>
              <div className="text-xs-ui font-semibold flex items-center gap-2">
                <span className="font-mono">{g.chave}</span>
                <span className={`badge ${g.por_codigo ? 'badge-success' : 'badge-secondary'}`}>
                  {g.por_codigo ? 'por COD TECIDO' : 'pelo nome'}
                </span>
              </div>
              {g.rolos.map((r) => (
                <div key={r.id} className="text-xs-ui text-neutral-600 flex gap-2">
                  <span className="font-mono tabular-nums" style={{ width: 52 }}>{formatNum(r.dimensao_m)} m</span>
                  <span>{r.nome}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
