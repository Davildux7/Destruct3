import { VarValue } from './types';

/**
 * Safe Expression Parser & Evaluator (Tokenizer + Recursive Descent AST).
 * Strictly zero eval() and zero new Function() for security & static-hosting safety.
 */

export interface ExpressionContext {
  getGlobalVar: (name: string) => VarValue | undefined;
  getSystemProp: (name: string) => VarValue | undefined;
  getObjectProp: (objectName: string, propChain: string[], args: VarValue[]) => VarValue;
  getLoopIndex: () => number;
}

type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'question'
  | 'colon'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const TWO_CHAR_OPS = new Set(['==', '!=', '<>', '<=', '>=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '^', '&', '=', '<', '>', '!']);

export function tokenizeExpression(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // String literal "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let str = '';
      while (i < len) {
        const c = input[i];
        if (c === '\\' && i + 1 < len) {
          const next = input[i + 1];
          if (next === 'n') str += '\n';
          else if (next === 't') str += '\t';
          else str += next;
          i += 2;
          continue;
        }
        if (c === quote) {
          // Construct-style "" escape inside double-quoted strings
          if (i + 1 < len && input[i + 1] === quote) {
            str += quote;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        str += c;
        i++;
      }
      tokens.push({ type: 'string', value: str, pos: start });
      continue;
    }

    // Number literal
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && input[i + 1] >= '0' && input[i + 1] <= '9')) {
      const start = i;
      let hasDot = false;
      while (i < len) {
        const c = input[i];
        if (c >= '0' && c <= '9') {
          i++;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'number', value: input.slice(start, i), pos: start });
      continue;
    }

    // Identifier
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const start = i;
      i++;
      while (i < len) {
        const c = input[i];
        if (
          (c >= 'a' && c <= 'z') ||
          (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') ||
          c === '_'
        ) {
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'ident', value: input.slice(start, i), pos: start });
      continue;
    }

    // Two-character operators
    if (i + 1 < len && TWO_CHAR_OPS.has(input.slice(i, i + 2))) {
      tokens.push({ type: 'op', value: input.slice(i, i + 2), pos: i });
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: i });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', pos: i });
      i++;
      continue;
    }
    if (ch === '.') {
      tokens.push({ type: 'dot', value: '.', pos: i });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'question', value: '?', pos: i });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', pos: i });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: 'eof', value: '', pos: len });
  return tokens;
}

type ASTNode =
  | { kind: 'literal'; value: VarValue }
  | { kind: 'ident'; name: string }
  | { kind: 'member'; chain: string[]; args?: ASTNode[] }
  | { kind: 'call'; name: string; args: ASTNode[] }
  | { kind: 'unary'; op: string; expr: ASTNode }
  | { kind: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { kind: 'ternary'; cond: ASTNode; thenExpr: ASTNode; elseExpr: ASTNode };

const astCache = new Map<string, ASTNode>();

export function parseExpression(source: string): ASTNode {
  const trimmed = source.trim();
  if (!trimmed) return { kind: 'literal', value: '' };
  const cached = astCache.get(trimmed);
  if (cached) return cached;

  const tokens = tokenizeExpression(trimmed);
  let idx = 0;

  const peek = (): Token => tokens[idx];
  const consume = (): Token => tokens[idx++];

  const parsePrimary = (): ASTNode => {
    const t = peek();
    if (t.type === 'number') {
      consume();
      return { kind: 'literal', value: Number(t.value) };
    }
    if (t.type === 'string') {
      consume();
      return { kind: 'literal', value: t.value };
    }
    if (t.type === 'ident') {
      consume();
      const lower = t.value.toLowerCase();
      if (lower === 'true' && peek().type !== 'dot' && peek().type !== 'lparen') {
        return { kind: 'literal', value: true };
      }
      if (lower === 'false' && peek().type !== 'dot' && peek().type !== 'lparen') {
        return { kind: 'literal', value: false };
      }

      // Member chain: Player.Platform.Speed or Player.Timer.CurrentTime("tag")
      if (peek().type === 'dot') {
        const chain = [t.value];
        while (peek().type === 'dot') {
          consume();
          const next = peek();
          if (next.type !== 'ident') {
            throw new Error(`Expected property name after '.' at position ${next.pos}`);
          }
          consume();
          chain.push(next.value);
        }
        let args: ASTNode[] | undefined;
        if (peek().type === 'lparen') {
          args = parseArgs();
        }
        return { kind: 'member', chain, args };
      }

      // Function call: sin(x)
      if (peek().type === 'lparen') {
        const args = parseArgs();
        return { kind: 'call', name: t.value, args };
      }

      return { kind: 'ident', name: t.value };
    }
    if (t.type === 'lparen') {
      consume();
      const inner = parseTernary();
      if (peek().type !== 'rparen') {
        throw new Error(`Expected ')' at position ${peek().pos}`);
      }
      consume();
      return inner;
    }

    throw new Error(`Unexpected token '${t.value || 'EOF'}' at position ${t.pos}`);
  };

  const parseArgs = (): ASTNode[] => {
    consume(); // '('
    const args: ASTNode[] = [];
    if (peek().type !== 'rparen') {
      args.push(parseTernary());
      while (peek().type === 'comma') {
        consume();
        args.push(parseTernary());
      }
    }
    if (peek().type !== 'rparen') {
      throw new Error(`Expected ')' in call at position ${peek().pos}`);
    }
    consume();
    return args;
  };

  const parseUnary = (): ASTNode => {
    const t = peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '!')) {
      consume();
      return { kind: 'unary', op: t.value, expr: parseUnary() };
    }
    return parsePrimary();
  };

  const parsePower = (): ASTNode => {
    let left = parseUnary();
    if (peek().type === 'op' && peek().value === '^') {
      consume();
      const right = parsePower(); // right-associative
      left = { kind: 'binary', op: '^', left, right };
    }
    return left;
  };

  const parseMul = (): ASTNode => {
    let left = parsePower();
    while (peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = consume().value;
      const right = parsePower();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseAdd = (): ASTNode => {
    let left = parseMul();
    while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseMul();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseConcat = (): ASTNode => {
    let left = parseAdd();
    while (peek().type === 'op' && peek().value === '&') {
      consume();
      const right = parseAdd();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  };

  const parseCompare = (): ASTNode => {
    let left = parseConcat();
    while (
      peek().type === 'op' &&
      (peek().value === '=' ||
        peek().value === '==' ||
        peek().value === '!=' ||
        peek().value === '<>' ||
        peek().value === '<' ||
        peek().value === '<=' ||
        peek().value === '>' ||
        peek().value === '>=')
    ) {
      const op = consume().value;
      const right = parseConcat();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  };

  const parseAnd = (): ASTNode => {
    let left = parseCompare();
    while (peek().type === 'op' && peek().value === '&&') {
      consume();
      const right = parseCompare();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  };

  const parseOr = (): ASTNode => {
    let left = parseAnd();
    while (peek().type === 'op' && peek().value === '||') {
      consume();
      const right = parseAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  };

  const parseTernary = (): ASTNode => {
    const cond = parseOr();
    if (peek().type === 'question') {
      consume();
      const thenExpr = parseTernary();
      if (peek().type !== 'colon') {
        throw new Error(`Expected ':' in ternary expression at position ${peek().pos}`);
      }
      consume();
      const elseExpr = parseTernary();
      return { kind: 'ternary', cond, thenExpr, elseExpr };
    }
    return cond;
  };

  const ast = parseTernary();
  if (peek().type !== 'eof') {
    throw new Error(`Unexpected token '${peek().value}' at position ${peek().pos}`);
  }
  if (astCache.size > 1500) astCache.clear();
  astCache.set(trimmed, ast);
  return ast;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function toNumber(val: VarValue): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'boolean') return val ? 1 : 0;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toBool(val: VarValue): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  return val.length > 0 && val.toLowerCase() !== 'false' && val !== '0';
}

export function toStringVal(val: VarValue): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

function evalFunction(name: string, args: VarValue[]): VarValue {
  const fn = name.toLowerCase();
  const n0 = () => toNumber(args[0] ?? 0);
  const n1 = () => toNumber(args[1] ?? 0);
  const n2 = () => toNumber(args[2] ?? 0);
  const n3 = () => toNumber(args[3] ?? 0);

  switch (fn) {
    case 'sin':
      return Math.sin(n0() * DEG_TO_RAD);
    case 'cos':
      return Math.cos(n0() * DEG_TO_RAD);
    case 'tan':
      return Math.tan(n0() * DEG_TO_RAD);
    case 'asin':
      return Math.asin(Math.max(-1, Math.min(1, n0()))) * RAD_TO_DEG;
    case 'acos':
      return Math.acos(Math.max(-1, Math.min(1, n0()))) * RAD_TO_DEG;
    case 'atan':
      return Math.atan(n0()) * RAD_TO_DEG;
    case 'atan2':
      return Math.atan2(n0(), n1()) * RAD_TO_DEG;
    case 'abs':
      return Math.abs(n0());
    case 'ceil':
      return Math.ceil(n0());
    case 'floor':
      return Math.floor(n0());
    case 'round':
      return Math.round(n0());
    case 'sqrt':
      return Math.sqrt(Math.max(0, n0()));
    case 'pow':
      return Math.pow(n0(), n1());
    case 'log':
      return Math.log(Math.max(1e-9, n0()));
    case 'exp':
      return Math.exp(n0());
    case 'min':
      return args.length === 0 ? 0 : Math.min(...args.map(toNumber));
    case 'max':
      return args.length === 0 ? 0 : Math.max(...args.map(toNumber));
    case 'clamp': {
      const x = n0();
      const lo = n1();
      const hi = n2();
      return Math.max(lo, Math.min(hi, x));
    }
    case 'lerp':
      return n0() + (n1() - n0()) * n2();
    case 'unlerp': {
      const a = n0();
      const b = n1();
      if (b === a) return 0;
      return (n2() - a) / (b - a);
    }
    case 'anglelerp': {
      const a = n0();
      const b = n1();
      const t = n2();
      let diff = ((b - a + 540) % 360) - 180;
      return (a + diff * t + 360) % 360;
    }
    case 'random': {
      if (args.length <= 1) {
        return Math.random() * n0();
      }
      const a = n0();
      const b = n1();
      return a + Math.random() * (b - a);
    }
    case 'choose': {
      if (args.length === 0) return 0;
      return args[Math.floor(Math.random() * args.length)];
    }
    case 'distance': {
      const dx = n2() - n0();
      const dy = n3() - n1();
      return Math.hypot(dx, dy);
    }
    case 'angle': {
      const dx = n2() - n0();
      const dy = n3() - n1();
      return ((Math.atan2(dy, dx) * RAD_TO_DEG) % 360 + 360) % 360;
    }
    case 'int':
      return Math.trunc(toNumber(args[0] ?? 0));
    case 'float':
      return parseFloat(toStringVal(args[0] ?? '0')) || 0;
    case 'str':
      return toStringVal(args[0] ?? '');
    case 'len':
      return toStringVal(args[0] ?? '').length;
    case 'uppercase':
      return toStringVal(args[0] ?? '').toUpperCase();
    case 'lowercase':
      return toStringVal(args[0] ?? '').toLowerCase();
    case 'trim':
      return toStringVal(args[0] ?? '').trim();
    case 'left':
      return toStringVal(args[0] ?? '').slice(0, Math.max(0, Math.trunc(n1())));
    case 'right': {
      const s = toStringVal(args[0] ?? '');
      const count = Math.max(0, Math.trunc(n1()));
      return count === 0 ? '' : s.slice(-count);
    }
    case 'mid': {
      const s = toStringVal(args[0] ?? '');
      const start = Math.max(0, Math.trunc(n1()));
      const count = Math.max(0, Math.trunc(n2()));
      return s.slice(start, start + count);
    }
    case 'find':
      return toStringVal(args[0] ?? '').indexOf(toStringVal(args[1] ?? ''));
    case 'replace':
      return toStringVal(args[0] ?? '').split(toStringVal(args[1] ?? '')).join(toStringVal(args[2] ?? ''));
    case 'rgbex': {
      const r = Math.round(Math.max(0, Math.min(100, n0())) * 2.55);
      const g = Math.round(Math.max(0, Math.min(100, n1())) * 2.55);
      const b = Math.round(Math.max(0, Math.min(100, n2())) * 2.55);
      return `rgb(${r},${g},${b})`;
    }
    case 'rgbex255': {
      const r = Math.round(Math.max(0, Math.min(255, n0())));
      const g = Math.round(Math.max(0, Math.min(255, n1())));
      const b = Math.round(Math.max(0, Math.min(255, n2())));
      return `rgb(${r},${g},${b})`;
    }
    case 'rgba': {
      const r = Math.round(Math.max(0, Math.min(255, n0())));
      const g = Math.round(Math.max(0, Math.min(255, n1())));
      const b = Math.round(Math.max(0, Math.min(255, n2())));
      const aRaw = n3();
      const a = aRaw > 1 ? Math.max(0, Math.min(100, aRaw)) / 100 : Math.max(0, Math.min(1, aRaw));
      return `rgba(${r},${g},${b},${a})`;
    }
    default:
      return 0;
  }
}

export function evaluateAST(node: ASTNode, ctx: ExpressionContext): VarValue {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'ident': {
      const lower = node.name.toLowerCase();
      if (lower === 'pi') return Math.PI;
      if (lower === 'newline') return '\n';
      if (lower === 'loopindex') return ctx.getLoopIndex();
      const sysVal = ctx.getSystemProp(node.name);
      if (sysVal !== undefined) return sysVal;
      const gVal = ctx.getGlobalVar(node.name);
      if (gVal !== undefined) return gVal;
      return 0;
    }
    case 'member': {
      const [objName, ...rest] = node.chain;
      const evalArgs = node.args ? node.args.map((a) => evaluateAST(a, ctx)) : [];
      return ctx.getObjectProp(objName, rest, evalArgs);
    }
    case 'call': {
      const evalArgs = node.args.map((a) => evaluateAST(a, ctx));
      return evalFunction(node.name, evalArgs);
    }
    case 'unary': {
      const v = evaluateAST(node.expr, ctx);
      if (node.op === '-') return -toNumber(v);
      if (node.op === '+') return +toNumber(v);
      if (node.op === '!') return !toBool(v);
      return v;
    }
    case 'binary': {
      if (node.op === '&&') {
        return toBool(evaluateAST(node.left, ctx)) && toBool(evaluateAST(node.right, ctx));
      }
      if (node.op === '||') {
        return toBool(evaluateAST(node.left, ctx)) || toBool(evaluateAST(node.right, ctx));
      }
      const l = evaluateAST(node.left, ctx);
      const r = evaluateAST(node.right, ctx);
      switch (node.op) {
        case '&':
          return toStringVal(l) + toStringVal(r);
        case '+':
          return toNumber(l) + toNumber(r);
        case '-':
          return toNumber(l) - toNumber(r);
        case '*':
          return toNumber(l) * toNumber(r);
        case '/': {
          const den = toNumber(r);
          return den === 0 ? 0 : toNumber(l) / den;
        }
        case '%': {
          const den = toNumber(r);
          return den === 0 ? 0 : toNumber(l) % den;
        }
        case '^':
          return Math.pow(toNumber(l), toNumber(r));
        case '=':
        case '==':
          return compareValues(l, '=', r);
        case '!=':
        case '<>':
          return compareValues(l, '!=', r);
        case '<':
          return compareValues(l, '<', r);
        case '<=':
          return compareValues(l, '<=', r);
        case '>':
          return compareValues(l, '>', r);
        case '>=':
          return compareValues(l, '>=', r);
        default:
          return 0;
      }
    }
    case 'ternary': {
      return toBool(evaluateAST(node.cond, ctx))
        ? evaluateAST(node.thenExpr, ctx)
        : evaluateAST(node.elseExpr, ctx);
    }
  }
}

export function compareValues(left: VarValue, cmp: string, right: VarValue): boolean {
  const bothStrings = typeof left === 'string' && typeof right === 'string';
  if (bothStrings) {
    switch (cmp) {
      case '=':
      case '==':
        return left === right;
      case '!=':
      case '<>':
        return left !== right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
    }
  }
  const ln = toNumber(left);
  const rn = toNumber(right);
  switch (cmp) {
    case '=':
    case '==':
      return ln === rn;
    case '!=':
    case '<>':
      return ln !== rn;
    case '<':
      return ln < rn;
    case '<=':
      return ln <= rn;
    case '>':
      return ln > rn;
    case '>=':
      return ln >= rn;
    default:
      return false;
  }
}

export function evaluateExpression(source: string, ctx: ExpressionContext): VarValue {
  try {
    const ast = parseExpression(source);
    return evaluateAST(ast, ctx);
  } catch {
    return 0;
  }
}

export function validateExpressionSyntax(source: string): string | null {
  try {
    parseExpression(source);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid expression';
  }
}
