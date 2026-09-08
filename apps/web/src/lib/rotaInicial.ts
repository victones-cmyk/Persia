// apps/web/src/lib/rotaInicial.ts
// Onde cada perfil cai ao entrar no app.
//
// Existe como função única porque "a página inicial" estava escrita em quatro
// lugares — login, troca de senha, rota raiz e o logo da barra de topo — e
// mudar num só deixaria os outros levando para o lugar antigo, o que é o tipo
// de inconsistência que ninguém reporta e todo mundo estranha.

export type PerfilUsuario = 'admin' | 'vendedor' | 'revenda' | string | undefined;

/**
 * Admin e vendedor caem em "Próximas ações": para eles a pergunta ao abrir o
 * app é "o que está parado esperando alguém".
 *
 * Revenda continua em Orçamentos. As filas daquela tela — pedido sem ordem de
 * produção, etiqueta a imprimir, baixa de estoque — são trabalho da fábrica,
 * não dela; abrir o app numa lista de tarefas que ela não executa seria pedir
 * atenção para o que não lhe cabe.
 */
export function rotaInicial(perfil: PerfilUsuario): string {
  return perfil === 'revenda' ? '/orcamentos' : '/proximas-acoes';
}
