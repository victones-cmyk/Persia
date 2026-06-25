// apps/api/src/services/calc/formula.ts
// Avaliador seguro de fórmulas de quantidade dos componentes (RN-05, RN-06, RN-07).
// Suporta tokens [Largura] e [Altura], números decimais e operadores + - * /
// com precedência (* / antes de + -). SEM eval/Function — parser próprio.

export interface VarsFormula {
  largura: number;
  altura: number;
}

// Após substituir as variáveis, só admitimos uma sequência número (op número)*.
const EXPR_VALIDA = /^\d+(\.\d+)?([-+*/]\d+(\.\d+)?)*$/;

export function evalFormula(formula: string, vars: VarsFormula): number {
  const expr = formula
    .replace(/\[Largura\]/g, String(vars.largura))
    .replace(/\[Altura\]/g, String(vars.altura))
    .replace(/[()\s]/g, ''); // fórmulas não usam parênteses reais; remove espaços

  if (!EXPR_VALIDA.test(expr)) {
    throw new Error(`Fórmula inválida: ${formula}`);
  }

  const tokens = expr.match(/\d+(?:\.\d+)?|[-+*/]/g) as string[];

  // 1ª passada: resolve * e /
  const apos: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '*' || t === '/') {
      const a = Number(apos.pop());
      const b = Number(tokens[++i]);
      apos.push(String(t === '*' ? a * b : a / b));
    } else {
      apos.push(t);
    }
  }

  // 2ª passada: resolve + e - (esquerda → direita)
  let acc = Number(apos[0]);
  for (let i = 1; i < apos.length; i += 2) {
    const op = apos[i];
    const n = Number(apos[i + 1]);
    acc = op === '+' ? acc + n : acc - n;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Avaliador das fórmulas de QUANTIDADE das receitas de persiana (planilhas do
// Victor). Diferente do evalFormula acima, este RESPEITA PARÊNTESES — necessário
// para "(LARGURA-0.025)*2", "LARGURA*(ALTURA+0.2)*1.2" etc. Sem eval/Function:
// parser recursivo (expr → term → factor). Variáveis: LARGURA, ALTURA, TC.
// ---------------------------------------------------------------------------
export interface VarsQtd { largura: number; altura: number; tc: number; }

export function evalQuantidade(formula: string, vars: VarsQtd): number {
  const subst = formula
    .replace(/LARGURA/g, `(${vars.largura})`)
    .replace(/ALTURA/g, `(${vars.altura})`)
    .replace(/\bTC\b/g, `(${vars.tc})`)
    .replace(/\s/g, '');
  // Só dígitos, ponto, operadores e parênteses são permitidos após a substituição.
  if (!/^[-+*/().\d]+$/.test(subst)) throw new Error(`Fórmula de quantidade inválida: ${formula}`);

  let i = 0;
  const peek = () => subst[i];
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = subst[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = subst[i++];
      const r = parseFactor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parseFactor(): number {
    if (peek() === '(') {
      i++; // consome '('
      const v = parseExpr();
      if (peek() !== ')') throw new Error(`Parêntese não fechado: ${formula}`);
      i++; // consome ')'
      return v;
    }
    if (peek() === '-') { i++; return -parseFactor(); } // unário
    const start = i;
    while (i < subst.length && /[\d.]/.test(subst[i])) i++;
    if (i === start) throw new Error(`Número esperado em: ${formula}`);
    return Number(subst.slice(start, i));
  }
  const resultado = parseExpr();
  if (i !== subst.length) throw new Error(`Sobra de tokens em: ${formula}`);
  return resultado;
}
