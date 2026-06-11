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
