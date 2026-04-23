//
// src/lib/dialogueRunner.ts
//
// Pure-function dialogue runtime for NERIUM RV. Owner: Linus.
// Contract: docs/contracts/dialogue_schema.contract.md v0.1.0 Section 4.
//
// Exports:
//   - DialogueReducerState: canonical reducer state shape
//   - DialogueAction: discriminated union of reducer inputs
//   - reducer(state, action, dialogues): next state, no side effects
//   - availableChoices(node, ctx): filters choices by narrow `if` DSL
//   - evaluateCondition(expr, ctx): narrow safe predicate DSL evaluator
//   - interpolate(text, vars): `{name}` variable substitution for lines
//   - isTerminal(state, dialogues): terminal-node detection
//   - validateDialogue: re-export from _schema for runtime load
//
// Design choices (see docs/linus.decisions.md):
//   - No `new Function`, no `eval`: narrow recursive descent parser lives in this file.
//   - No jsep dep: grammar is small enough for zero-dep hand rolled parser.
//   - Reducer is pure; side effects (bridge events, store writes) are the caller's job.
//

import type {
  Choice,
  Dialogue,
  DialogueId,
  DialogueVars,
  Effect,
  Node as DNode,
  NodeId,
} from '../data/dialogues/_schema';

export { parseDialogue } from '../data/dialogues/_schema';

// ========= Reducer types =========

export interface DialogueReducerState {
  activeDialogueId: DialogueId | null;
  currentNodeId: NodeId | null;
  streaming: boolean;
  streamBuffer: string;
  vars: DialogueVars;
  awaitingPhaserEvent: string | null;
  pendingEffects: Effect[];
  closed: boolean;
  lastChoiceIndex: number | null;
  lastSubmission: { slotId: string; value: string } | null;
}

export type DialogueAction =
  | { type: 'OPEN'; dialogueId: DialogueId; startNode?: NodeId; seedVars?: DialogueVars }
  | { type: 'ADVANCE_TO'; nodeId: NodeId }
  | { type: 'SELECT_CHOICE'; index: number }
  | { type: 'SUBMIT_CHALLENGE'; value: string }
  | { type: 'STREAM_CHUNK'; chunk: string }
  | { type: 'STREAM_COMPLETE' }
  | { type: 'PHASER_RESUMED'; event: string }
  | { type: 'SET_VAR'; name: string; value: unknown }
  | { type: 'CLOSE' };

export function initialDialogueState(): DialogueReducerState {
  return {
    activeDialogueId: null,
    currentNodeId: null,
    streaming: false,
    streamBuffer: '',
    vars: {},
    awaitingPhaserEvent: null,
    pendingEffects: [],
    closed: false,
    lastChoiceIndex: null,
    lastSubmission: null,
  };
}

// ========= Condition DSL =========
//
// Allowed identifiers:
//   trust.<npcId>
//   inventory.hasItem("<itemId>")              (boolean helper)
//   inventory.hasItem("<itemId>", <minQty>)    (boolean helper, optional minQty)
//   vars.<varName>
//   quest.<questId>.stepIndex
// Allowed operators: === !== > >= < <= && || ! + - * /
// Allowed literals: number, double-quoted string, true, false, null.
//

export interface ConditionContext {
  vars: DialogueVars;
  trust: Record<string, number>;
  questStepIndex: Record<string, number>;
  hasItem: (itemId: string, minQuantity?: number) => boolean;
}

export class ExpressionParseError extends Error {
  constructor(message: string, public readonly expression: string, public readonly position?: number) {
    super(message);
    this.name = 'ExpressionParseError';
  }
}

type Token =
  | { kind: 'NUM'; value: number; pos: number }
  | { kind: 'STR'; value: string; pos: number }
  | { kind: 'BOOL'; value: boolean; pos: number }
  | { kind: 'NULL'; pos: number }
  | { kind: 'IDENT'; value: string; pos: number }
  | { kind: 'OP'; value: string; pos: number }
  | { kind: 'LPAREN'; pos: number }
  | { kind: 'RPAREN'; pos: number }
  | { kind: 'COMMA'; pos: number }
  | { kind: 'DOT'; pos: number }
  | { kind: 'EOF'; pos: number };

function tokenize(expr: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      out.push({ kind: 'LPAREN', pos: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      out.push({ kind: 'RPAREN', pos: i });
      i += 1;
      continue;
    }
    if (ch === ',') {
      out.push({ kind: 'COMMA', pos: i });
      i += 1;
      continue;
    }
    if (ch === '.') {
      out.push({ kind: 'DOT', pos: i });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let s = '';
      while (j < expr.length && expr[j] !== quote) {
        if (expr[j] === '\\' && j + 1 < expr.length) {
          s += expr[j + 1];
          j += 2;
        } else {
          s += expr[j];
          j += 1;
        }
      }
      if (j >= expr.length) {
        throw new ExpressionParseError('unterminated string literal', expr, i);
      }
      out.push({ kind: 'STR', value: s, pos: i });
      i = j + 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) {
        j += 1;
      }
      const raw = expr.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new ExpressionParseError(`bad numeric literal '${raw}'`, expr, i);
      }
      out.push({ kind: 'NUM', value: n, pos: i });
      i = j;
      continue;
    }
    const twoCh = expr.slice(i, i + 3);
    if (twoCh === '===' || twoCh === '!==') {
      out.push({ kind: 'OP', value: twoCh, pos: i });
      i += 3;
      continue;
    }
    const one2 = expr.slice(i, i + 2);
    if (one2 === '>=' || one2 === '<=' || one2 === '&&' || one2 === '||') {
      out.push({ kind: 'OP', value: one2, pos: i });
      i += 2;
      continue;
    }
    if ('><!+-*/'.includes(ch)) {
      out.push({ kind: 'OP', value: ch, pos: i });
      i += 1;
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let j = i;
      while (
        j < expr.length &&
        ((expr[j] >= 'a' && expr[j] <= 'z') ||
          (expr[j] >= 'A' && expr[j] <= 'Z') ||
          (expr[j] >= '0' && expr[j] <= '9') ||
          expr[j] === '_')
      ) {
        j += 1;
      }
      const name = expr.slice(i, j);
      if (name === 'true' || name === 'false') {
        out.push({ kind: 'BOOL', value: name === 'true', pos: i });
      } else if (name === 'null') {
        out.push({ kind: 'NULL', pos: i });
      } else {
        out.push({ kind: 'IDENT', value: name, pos: i });
      }
      i = j;
      continue;
    }
    throw new ExpressionParseError(`unexpected character '${ch}'`, expr, i);
  }
  out.push({ kind: 'EOF', pos: i });
  return out;
}

type ExprAst =
  | { kind: 'lit'; value: unknown }
  | { kind: 'ident'; path: string[] }
  | { kind: 'call'; path: string[]; args: ExprAst[] }
  | { kind: 'unary'; op: string; arg: ExprAst }
  | { kind: 'binary'; op: string; left: ExprAst; right: ExprAst };

class Parser {
  private i = 0;
  constructor(private tokens: Token[], private src: string) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private eat(): Token {
    const t = this.tokens[this.i];
    this.i += 1;
    return t;
  }
  private expect(kind: Token['kind'], value?: string): Token {
    const t = this.eat();
    if (t.kind !== kind || (value !== undefined && (t as { value?: string }).value !== value)) {
      throw new ExpressionParseError(
        `expected ${kind}${value ? ` '${value}'` : ''} at position ${t.pos}`,
        this.src,
        t.pos,
      );
    }
    return t;
  }

  parse(): ExprAst {
    const ast = this.orExpr();
    if (this.peek().kind !== 'EOF') {
      throw new ExpressionParseError(
        `unexpected trailing token at position ${this.peek().pos}`,
        this.src,
        this.peek().pos,
      );
    }
    return ast;
  }

  private orExpr(): ExprAst {
    let left = this.andExpr();
    while (this.peek().kind === 'OP' && (this.peek() as { value: string }).value === '||') {
      this.eat();
      const right = this.andExpr();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }
  private andExpr(): ExprAst {
    let left = this.eqExpr();
    while (this.peek().kind === 'OP' && (this.peek() as { value: string }).value === '&&') {
      this.eat();
      const right = this.eqExpr();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }
  private eqExpr(): ExprAst {
    let left = this.cmpExpr();
    while (this.peek().kind === 'OP') {
      const op = (this.peek() as { value: string }).value;
      if (op !== '===' && op !== '!==') break;
      this.eat();
      const right = this.cmpExpr();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private cmpExpr(): ExprAst {
    let left = this.addExpr();
    while (this.peek().kind === 'OP') {
      const op = (this.peek() as { value: string }).value;
      if (op !== '>' && op !== '>=' && op !== '<' && op !== '<=') break;
      this.eat();
      const right = this.addExpr();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private addExpr(): ExprAst {
    let left = this.mulExpr();
    while (this.peek().kind === 'OP') {
      const op = (this.peek() as { value: string }).value;
      if (op !== '+' && op !== '-') break;
      this.eat();
      const right = this.mulExpr();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private mulExpr(): ExprAst {
    let left = this.unaryExpr();
    while (this.peek().kind === 'OP') {
      const op = (this.peek() as { value: string }).value;
      if (op !== '*' && op !== '/') break;
      this.eat();
      const right = this.unaryExpr();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  private unaryExpr(): ExprAst {
    const t = this.peek();
    if (t.kind === 'OP' && (t.value === '!' || t.value === '-')) {
      this.eat();
      const arg = this.unaryExpr();
      return { kind: 'unary', op: t.value, arg };
    }
    return this.primary();
  }
  private primary(): ExprAst {
    const t = this.peek();
    if (t.kind === 'NUM') {
      this.eat();
      return { kind: 'lit', value: t.value };
    }
    if (t.kind === 'STR') {
      this.eat();
      return { kind: 'lit', value: t.value };
    }
    if (t.kind === 'BOOL') {
      this.eat();
      return { kind: 'lit', value: t.value };
    }
    if (t.kind === 'NULL') {
      this.eat();
      return { kind: 'lit', value: null };
    }
    if (t.kind === 'LPAREN') {
      this.eat();
      const inner = this.orExpr();
      this.expect('RPAREN');
      return inner;
    }
    if (t.kind === 'IDENT') {
      return this.identOrCall();
    }
    throw new ExpressionParseError(`unexpected token at position ${t.pos}`, this.src, t.pos);
  }
  private identOrCall(): ExprAst {
    const path: string[] = [];
    const head = this.expect('IDENT');
    path.push((head as { value: string }).value);
    while (this.peek().kind === 'DOT') {
      this.eat();
      const next = this.expect('IDENT');
      path.push((next as { value: string }).value);
    }
    if (this.peek().kind === 'LPAREN') {
      this.eat();
      const args: ExprAst[] = [];
      if (this.peek().kind !== 'RPAREN') {
        args.push(this.orExpr());
        while (this.peek().kind === 'COMMA') {
          this.eat();
          args.push(this.orExpr());
        }
      }
      this.expect('RPAREN');
      return { kind: 'call', path, args };
    }
    return { kind: 'ident', path };
  }
}

function evalIdent(path: string[], ctx: ConditionContext): unknown {
  if (path.length === 0) return undefined;
  const [head, ...rest] = path;
  if (head === 'trust') {
    if (rest.length !== 1) return undefined;
    const v = ctx.trust[rest[0]];
    return typeof v === 'number' ? v : 0;
  }
  if (head === 'vars') {
    if (rest.length === 0) return ctx.vars;
    let cur: unknown = ctx.vars;
    for (const seg of rest) {
      if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        return undefined;
      }
    }
    return cur;
  }
  if (head === 'quest') {
    if (rest.length === 2 && rest[1] === 'stepIndex') {
      const v = ctx.questStepIndex[rest[0]];
      return typeof v === 'number' ? v : 0;
    }
    return undefined;
  }
  if (head === 'inventory') {
    return undefined;
  }
  return undefined;
}

function evalCall(path: string[], args: unknown[], ctx: ConditionContext): unknown {
  if (path.length === 2 && path[0] === 'inventory' && path[1] === 'hasItem') {
    const itemId = args[0];
    const minQty = args[1];
    if (typeof itemId !== 'string') return false;
    const min = typeof minQty === 'number' ? minQty : 1;
    return ctx.hasItem(itemId, min);
  }
  return undefined;
}

function evalAst(ast: ExprAst, ctx: ConditionContext): unknown {
  switch (ast.kind) {
    case 'lit':
      return ast.value;
    case 'ident':
      return evalIdent(ast.path, ctx);
    case 'call':
      return evalCall(
        ast.path,
        ast.args.map((a) => evalAst(a, ctx)),
        ctx,
      );
    case 'unary': {
      const v = evalAst(ast.arg, ctx);
      if (ast.op === '!') return !v;
      if (ast.op === '-') return typeof v === 'number' ? -v : NaN;
      return undefined;
    }
    case 'binary': {
      if (ast.op === '&&') {
        const l = evalAst(ast.left, ctx);
        return l ? evalAst(ast.right, ctx) : l;
      }
      if (ast.op === '||') {
        const l = evalAst(ast.left, ctx);
        return l ? l : evalAst(ast.right, ctx);
      }
      const l = evalAst(ast.left, ctx);
      const r = evalAst(ast.right, ctx);
      switch (ast.op) {
        case '===':
          return l === r;
        case '!==':
          return l !== r;
        case '>':
          return (l as number) > (r as number);
        case '>=':
          return (l as number) >= (r as number);
        case '<':
          return (l as number) < (r as number);
        case '<=':
          return (l as number) <= (r as number);
        case '+':
          return (l as number) + (r as number);
        case '-':
          return (l as number) - (r as number);
        case '*':
          return (l as number) * (r as number);
        case '/':
          return (l as number) / (r as number);
      }
      return undefined;
    }
  }
}

const astCache = new Map<string, ExprAst>();

function compile(expr: string): ExprAst {
  const cached = astCache.get(expr);
  if (cached) return cached;
  const tokens = tokenize(expr);
  const ast = new Parser(tokens, expr).parse();
  astCache.set(expr, ast);
  return ast;
}

export function evaluateCondition(expr: string, ctx: ConditionContext): boolean {
  if (!expr || expr.trim() === '') return true;
  try {
    const ast = compile(expr);
    const result = evalAst(ast, ctx);
    return Boolean(result);
  } catch (err) {
    if (err instanceof ExpressionParseError) {
      throw err;
    }
    return false;
  }
}

// ========= Public helpers =========

export function availableChoices(node: DNode, ctx: ConditionContext): Choice[] {
  if (!node.choices || node.choices.length === 0) return [];
  return node.choices.filter((c) => {
    if (!c.if) return true;
    return evaluateCondition(c.if, ctx);
  });
}

export function interpolate(text: string, vars: DialogueVars): string {
  return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

export function isTerminal(state: DialogueReducerState, dialogues: Map<DialogueId, Dialogue>): boolean {
  if (state.closed) return true;
  if (!state.activeDialogueId || !state.currentNodeId) return true;
  const d = dialogues.get(state.activeDialogueId);
  if (!d) return true;
  const node = d.nodes[state.currentNodeId];
  if (!node) return true;
  return Boolean(node.end);
}

export function shouldFireTriggerOnChoice(choice: Choice): Effect | null {
  if (!choice.effects || choice.effects.length === 0) return null;
  for (const effect of choice.effects) {
    if (effect.type === 'fire_trigger' || effect.type === 'emit_event') {
      return effect;
    }
  }
  return null;
}

// ========= Reducer =========
//
// Pure. No bridge emission, no store writes. The caller reads `pendingEffects`
// after each transition and dispatches them to quest, inventory, audio, and Phaser.
// This keeps tests trivial and integration flexible.
//

function resolveEffectsOnEnter(
  dialogue: Dialogue,
  nodeId: NodeId,
): Effect[] {
  const node = dialogue.nodes[nodeId];
  if (!node) return [];
  return node.effects ?? [];
}

export function reducer(
  state: DialogueReducerState,
  action: DialogueAction,
  dialogues: Map<DialogueId, Dialogue>,
): DialogueReducerState {
  switch (action.type) {
    case 'OPEN': {
      const dialogue = dialogues.get(action.dialogueId);
      if (!dialogue) return state;
      const startNode = action.startNode ?? dialogue.start;
      if (!dialogue.nodes[startNode]) return state;
      const seedVars = { ...dialogue.vars, ...(action.seedVars ?? {}) };
      const enterEffects = resolveEffectsOnEnter(dialogue, startNode);
      return {
        ...initialDialogueState(),
        activeDialogueId: dialogue.id,
        currentNodeId: startNode,
        vars: seedVars,
        pendingEffects: enterEffects,
      };
    }
    case 'ADVANCE_TO': {
      if (!state.activeDialogueId) return state;
      const dialogue = dialogues.get(state.activeDialogueId);
      if (!dialogue) return state;
      if (!dialogue.nodes[action.nodeId]) return state;
      const enterEffects = resolveEffectsOnEnter(dialogue, action.nodeId);
      return {
        ...state,
        currentNodeId: action.nodeId,
        pendingEffects: enterEffects,
        lastChoiceIndex: null,
        lastSubmission: null,
        awaitingPhaserEvent: null,
      };
    }
    case 'SELECT_CHOICE': {
      if (!state.activeDialogueId || !state.currentNodeId) return state;
      const dialogue = dialogues.get(state.activeDialogueId);
      if (!dialogue) return state;
      const node = dialogue.nodes[state.currentNodeId];
      if (!node || !node.choices || action.index < 0 || action.index >= node.choices.length) {
        return state;
      }
      const choice = node.choices[action.index];
      const choiceEffects: Effect[] = choice.effects ?? [];
      const nextNodeId = choice.next;
      const targetExists = Boolean(dialogue.nodes[nextNodeId]);
      const enterEffects = targetExists ? resolveEffectsOnEnter(dialogue, nextNodeId) : [];
      return {
        ...state,
        currentNodeId: targetExists ? nextNodeId : state.currentNodeId,
        pendingEffects: [...choiceEffects, ...enterEffects],
        lastChoiceIndex: action.index,
        lastSubmission: null,
        awaitingPhaserEvent: null,
      };
    }
    case 'SUBMIT_CHALLENGE': {
      if (!state.activeDialogueId || !state.currentNodeId) return state;
      const dialogue = dialogues.get(state.activeDialogueId);
      if (!dialogue) return state;
      const node = dialogue.nodes[state.currentNodeId];
      if (!node || !node.challenge || !node.onSubmit) return state;
      if (node.challenge.kind === 'prompt_input') {
        if (action.value.length < node.challenge.minChars) return state;
        if (action.value.length > node.challenge.maxChars) return state;
      }
      const slotId = node.challenge.kind === 'prompt_input' ? node.challenge.slotId : '';
      const submitEffects: Effect[] = node.onSubmit.effects ?? [];
      const hasStream = Boolean(node.onSubmit.stream);
      const nextNodeId = node.onSubmit.next;
      const shouldAdvance = !hasStream && Boolean(nextNodeId);
      const advanceTarget = shouldAdvance && nextNodeId && dialogue.nodes[nextNodeId] ? nextNodeId : state.currentNodeId;
      const enterEffects = shouldAdvance && advanceTarget !== state.currentNodeId
        ? resolveEffectsOnEnter(dialogue, advanceTarget)
        : [];
      return {
        ...state,
        currentNodeId: advanceTarget,
        streaming: hasStream,
        streamBuffer: hasStream ? '' : state.streamBuffer,
        pendingEffects: [...submitEffects, ...enterEffects],
        lastSubmission: { slotId, value: action.value },
        lastChoiceIndex: null,
      };
    }
    case 'STREAM_CHUNK': {
      return {
        ...state,
        streaming: true,
        streamBuffer: state.streamBuffer + action.chunk,
      };
    }
    case 'STREAM_COMPLETE': {
      if (!state.activeDialogueId || !state.currentNodeId) {
        return { ...state, streaming: false };
      }
      const dialogue = dialogues.get(state.activeDialogueId);
      if (!dialogue) return { ...state, streaming: false };
      const node = dialogue.nodes[state.currentNodeId];
      const nextNodeId = node?.onSubmit?.next;
      if (nextNodeId && dialogue.nodes[nextNodeId]) {
        const enterEffects = resolveEffectsOnEnter(dialogue, nextNodeId);
        return {
          ...state,
          streaming: false,
          currentNodeId: nextNodeId,
          pendingEffects: enterEffects,
        };
      }
      return { ...state, streaming: false };
    }
    case 'PHASER_RESUMED': {
      if (!state.activeDialogueId || !state.currentNodeId) return state;
      const dialogue = dialogues.get(state.activeDialogueId);
      if (!dialogue) return state;
      const node = dialogue.nodes[state.currentNodeId];
      if (!node) return state;
      const wantedEvent = node.phaser?.resumeOnEvent ?? node.phaser?.event;
      if (wantedEvent && wantedEvent !== action.event) return state;
      const nextNodeId = node.next;
      if (nextNodeId && dialogue.nodes[nextNodeId]) {
        const enterEffects = resolveEffectsOnEnter(dialogue, nextNodeId);
        return {
          ...state,
          currentNodeId: nextNodeId,
          pendingEffects: enterEffects,
          awaitingPhaserEvent: null,
        };
      }
      return { ...state, awaitingPhaserEvent: null };
    }
    case 'SET_VAR': {
      return { ...state, vars: { ...state.vars, [action.name]: action.value } };
    }
    case 'CLOSE': {
      return { ...initialDialogueState(), closed: true };
    }
    default:
      return state;
  }
}
