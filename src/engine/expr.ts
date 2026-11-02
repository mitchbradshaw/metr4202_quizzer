// Safe calculator for answer boxes: numbers plus + − × ÷ ^ ( ), pi, e, common functions and, optionally,
// named symbols such as L1, L2 (for screw-axis and M tables). e.g. "2*pi*12.5", "sqrt(3e5/12)", "-L1 + L3",
// "L_2+L_3", "2L1". Never uses eval.

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
};

/** Symbol table: names are matched case-insensitively with underscores ignored ("L_1" = "l1" = "L1"). */
export type Vars = Record<string, number>;

export const varKey = (name: string) => name.replace(/_/g, '').toLowerCase();

function normalise(src: string): string {
  let s = src.trim().replace(/\s+/g, '');
  s = s.replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/_/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (!s.includes('.') && /^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return s.toLowerCase();
}

export function evaluate(src: string, vars?: Vars): number {
  const s = normalise(src);
  if (!s) return NaN;
  const table = new Map<string, number>();
  if (vars) for (const [k, v] of Object.entries(vars)) table.set(varKey(k), v);
  let i = 0;
  const peek = () => s[i];
  const eat = (ch: string) => {
    if (s[i] === ch) {
      i++;
      return true;
    }
    return false;
  };

  function number(): number {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primary(): number {
    if (eat('(')) {
      const v = expr();
      if (!eat(')')) return NaN;
      return v;
    }
    const ch = peek();
    if (ch && /[\d.]/.test(ch)) return number();
    if (ch && /[a-z]/.test(ch)) {
      // A symbol may end in digits (L1, q12); try the longest match against the symbol table first.
      const withDigits = /^[a-z]+\d*/.exec(s.slice(i))![0];
      if (table.has(withDigits)) {
        i += withDigits.length;
        return table.get(withDigits)!;
      }
      const id = /^[a-z]+/.exec(s.slice(i))![0];
      if (table.has(id)) {
        i += id.length;
        return table.get(id)!;
      }
      i += id.length;
      if (id === 'pi') return Math.PI;
      if (id === 'e') return Math.E;
      const fn = FUNCS[id];
      if (!fn) return NaN;
      if (!eat('(')) {
        // allow "sqrt2"
        const v = factor();
        return fn(v);
      }
      const v = expr();
      if (!eat(')')) return NaN;
      return fn(v);
    }
    return NaN;
  }
  function implicit(v: number): number {
    // 2pi, 3(4+1), 2sqrt(2), 2L1
    while (i < s.length && /[a-z(]/.test(s[i])) v *= primary();
    return v;
  }
  function factor(): number {
    if (eat('-')) return -factor();
    if (eat('+')) return factor();
    let base = implicit(primary());
    if (eat('^')) base = Math.pow(base, factor());
    return base;
  }
  function term(): number {
    let v = factor();
    for (;;) {
      if (eat('*')) v *= factor();
      else if (eat('/')) v /= factor();
      else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }
  const v = expr();
  return i === s.length ? v : NaN;
}

/** Does the input mention any letters other than pi/e/functions (i.e. symbols)? */
export function usesSymbols(src: string): boolean {
  const s = normalise(src).replace(/(sqrt|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|exp|ln|log|abs|pi)/g, '');
  return /[a-df-z]/.test(s);
}
