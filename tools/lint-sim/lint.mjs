// lint:sim - lint de determinismo basado en el AST de TypeScript. Ver README.md para las reglas.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const ALLOWED_MATH = new Set(['min', 'max', 'abs', 'trunc', 'imul', 'clz32', 'sign']);
const DOM_MODULES = /^(react-dom|react|pixi(\.js)?|@pixi\/.*|jsdom|happy-dom|dom)(\/.*)?$/;
const DOM_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'alert',
]);
const TIMER_FNS = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
]);
const MAPSET = new Set(['Map', 'Set', 'ReadonlyMap', 'ReadonlySet', 'WeakMap', 'WeakSet']);
const ITER_METHODS = new Set(['keys', 'values', 'entries', 'forEach']);
const FLOAT_STR_METHODS = new Set(['toFixed', 'toPrecision', 'toExponential']);
const FLOAT_ARRAYS = new Set(['Float16Array', 'Float32Array', 'Float64Array']);
const FLOAT_VIEW_METHODS = new Set(['getFloat32', 'getFloat64', 'setFloat32', 'setFloat64']);
const OBJECT_ITER_FNS = new Set(['fromEntries', 'entries', 'keys', 'values']);
const RANDOM_MODULES = /^(node:)?crypto$/;
const SRC_EXT = /\.(ts|tsx|mts)$/;

/** Unico archivo que puede usar `/` libremente: el helper de punto fijo (ruta exacta). */
export const DEFAULT_DIV_HELPERS = [path.join(ROOT, 'packages/shared/src/fixed.ts')];

/** Letras minimas del motivo de `lint-sim-allow`. */
const MIN_REASON_LETTERS = 5;
const ALLOW_RE = /\/\/\s*lint-sim-allow:(.*)$/;
function hasAllowWithReason(line) {
  const m = ALLOW_RE.exec(line);
  if (!m) return false;
  const reason = m[1].split('//')[0]; // un `// expect-violation` posterior no cuenta como motivo
  return (reason.match(/\p{L}/gu) ?? []).length >= MIN_REASON_LETTERS;
}

function stripParens(n) {
  let cur = n;
  while (cur.parent && ts.isParenthesizedExpression(cur.parent)) cur = cur.parent;
  return cur;
}

/** `/` permitido si el resultado se trunca explicitamente: Math.trunc(a/b), (a/b)|0, (a/b)>>0, (a/b)>>>0, ~~(a/b). */
function divisionIsTruncated(node) {
  const outer = stripParens(node);
  const p = outer.parent;
  if (!p) return false;
  if (
    ts.isCallExpression(p) &&
    p.arguments[0] === outer &&
    ts.isPropertyAccessExpression(p.expression) &&
    ts.isIdentifier(p.expression.expression) &&
    p.expression.expression.text === 'Math' &&
    p.expression.name.text === 'trunc'
  )
    return true;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (
      k === ts.SyntaxKind.BarToken ||
      k === ts.SyntaxKind.GreaterThanGreaterThanToken ||
      k === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken
    ) {
      const other = p.left === outer ? p.right : p.left;
      return ts.isNumericLiteral(other) && other.text === '0';
    }
  }
  if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.TildeToken) {
    const pp = stripParens(p).parent;
    return !!pp && ts.isPrefixUnaryExpression(pp) && pp.operator === ts.SyntaxKind.TildeToken;
  }
  return false;
}

/** El recorrido de Map/Set esta ordenado si algun ancestro es una llamada `.sort(...)`/`.toSorted(...)` cuyo receptor lo contiene. */
function isSortedContext(node) {
  let cur = node;
  while (cur.parent) {
    const p = cur.parent;
    if (
      ts.isPropertyAccessExpression(p) &&
      p.expression === cur &&
      (p.name.text === 'sort' || p.name.text === 'toSorted')
    )
      return true;
    if (ts.isStatement(p)) return false;
    cur = p;
  }
  return false;
}

function typeIsMapSet(checker, expr) {
  const t = checker.getTypeAtLocation(expr);
  const types = t.isUnion() ? t.types : [t];
  return types.some((x) => {
    const s = x.getSymbol() ?? x.aliasSymbol;
    return !!s && MAPSET.has(s.getName());
  });
}

/** Expresion que enumera un Map/Set: el propio valor o `.keys()/.values()/.entries()` de uno. */
function isMapSetSource(checker, expr) {
  if (typeIsMapSet(checker, expr)) return true;
  return (
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    ITER_METHODS.has(expr.expression.name.text) &&
    typeIsMapSet(checker, expr.expression.expression)
  );
}

/** Tipo string (o any/unknown, por donde entran los strings sin tipar). */
function typeIsStringish(checker, expr) {
  const t = checker.getTypeAtLocation(expr);
  const types = t.isUnion() ? t.types : [t];
  return types.some(
    (x) =>
      x.flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown |
        ts.TypeFlags.TemplateLiteral),
  );
}

function isObjectOperand(node) {
  const p = node.parent;
  return (
    !!p &&
    (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) &&
    p.expression === node
  );
}

function isDeclarationName(n) {
  const p = n.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isBindingElement(p) ||
      ts.isImportSpecifier(p) ||
      ts.isTypeReferenceNode(p) ||
      ts.isQualifiedName(p)) &&
    p.name === n
  )
    return true;
  return false;
}

function lintSourceFile(sf, checker, fileName, divHelpers) {
  const out = [];
  const add = (node, rule, message) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file: fileName, line: line + 1, rule, message });
  };
  const isDivHelper = divHelpers.includes(path.resolve(fileName));

  const visit = (node) => {
    // --- float literals
    if (ts.isNumericLiteral(node)) {
      const txt = node.getText(sf);
      if (!/^0[xXbBoO]/.test(txt) && (/\./.test(txt) || /[eE]-/.test(txt)))
        add(node, 'no-float-literal', `literal en coma flotante '${txt}'`);
    }
    // --- division
    if (ts.isBinaryExpression(node)) {
      const k = node.operatorToken.kind;
      if (
        (k === ts.SyntaxKind.SlashToken && !divisionIsTruncated(node) && !isDivHelper) ||
        (k === ts.SyntaxKind.SlashEqualsToken && !isDivHelper)
      ) {
        add(
          node,
          'no-division',
          "operador '/' sin truncado explicito (Math.trunc / | 0 / >> 0) ni helper de fixed.ts",
        );
      }
      if (
        k === ts.SyntaxKind.AsteriskAsteriskToken ||
        k === ts.SyntaxKind.AsteriskAsteriskEqualsToken
      )
        add(node, 'no-exponent', "operador '**' prohibido");
    }
    // --- globals (identificador suelto o `globalThis.X`)
    const globalUse = (n, isCallee) => {
      if (n === 'parseFloat') add(node, 'no-parsefloat', 'parseFloat prohibido');
      if (DOM_GLOBALS.has(n)) add(node, 'no-dom', `acceso a global de DOM '${n}'`);
      if (TIMER_FNS.has(n) && isCallee) add(node, 'no-timers', `${n} prohibido (usar ticks)`);
      if (n === 'crypto') add(node, 'no-crypto', 'crypto.* prohibido (usar PRNG de la partida)');
      if (FLOAT_ARRAYS.has(n)) add(node, 'no-float-array', `${n} prohibido (usar Int32Array)`);
      if (n === 'Math' && !isObjectOperand(node))
        add(
          node,
          'no-math',
          'alias/desestructuracion de Math prohibido (usar Math.min(...) directo)',
        );
    };
    const isCallee = (n) => ts.isCallExpression(n.parent) && n.parent.expression === n;
    if (ts.isIdentifier(node) && !isDeclarationName(node)) {
      if (node.text === 'globalThis' && !isObjectOperand(node))
        add(node, 'no-global-alias', 'alias de globalThis prohibido');
      globalUse(node.text, isCallee(node));
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'globalThis'
    )
      globalUse(node.name.text, isCallee(node));
    // --- property access
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const objText = node.expression.getText(sf).replace(/^globalThis\./, '');
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : null;
      if (objText === 'Math') {
        if (name === null) add(node, 'no-math', 'Math[...] dinamico prohibido');
        else if (name === 'random')
          add(node, 'no-math-random', 'Math.random prohibido (usar PRNG de la partida)');
        else if (!ALLOWED_MATH.has(name))
          add(node, 'no-math', `Math.${name} no permitido (solo ${[...ALLOWED_MATH].join('/')})`);
      }
      if (name !== null) {
        if (objText === 'Date' && name === 'now') add(node, 'no-time', 'Date.now prohibido');
        if (objText === 'performance' && name === 'now')
          add(node, 'no-time', 'performance.now prohibido');
        if (objText === 'Number' && name === 'parseFloat')
          add(node, 'no-parsefloat', 'Number.parseFloat prohibido');
        if (FLOAT_STR_METHODS.has(name)) add(node, 'no-tofixed', `.${name} prohibido`);
        if (FLOAT_VIEW_METHODS.has(name)) add(node, 'no-float-array', `.${name} prohibido`);
        if (objText === 'JSON' && name === 'parse')
          add(
            node,
            'no-json-parse',
            'JSON.parse prohibido (puede introducir floats; usar @reinos/data)',
          );
        if (
          objText === 'Object' &&
          OBJECT_ITER_FNS.has(name) &&
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          node.parent.arguments[0] &&
          isMapSetSource(checker, node.parent.arguments[0]) &&
          !isSortedContext(node.parent)
        )
          add(node, 'no-unordered-iteration', `Object.${name}(Map/Set) sin ordenar`);
        if (
          ts.isPropertyAccessExpression(node) &&
          ITER_METHODS.has(name) &&
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          typeIsMapSet(checker, node.expression) &&
          !isSortedContext(node)
        ) {
          add(
            node,
            'no-unordered-iteration',
            `.${name}() sobre Map/Set sin ordenar (envolver en [...].sort(...))`,
          );
        }
        if (objText === 'Array' && name === 'from') {
          const call = node.parent;
          if (
            ts.isCallExpression(call) &&
            call.expression === node &&
            call.arguments[0] &&
            isMapSetSource(checker, call.arguments[0]) &&
            !isSortedContext(call)
          ) {
            add(node, 'no-unordered-iteration', 'Array.from(Map/Set) sin ordenar');
          }
        }
      }
    }
    // --- Number(str) / +str
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Number' &&
      node.arguments[0] &&
      typeIsStringish(checker, node.arguments[0])
    )
      add(node, 'no-string-to-number', 'Number(string) prohibido (puede producir floats)');
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.PlusToken &&
      typeIsStringish(checker, node.operand)
    )
      add(node, 'no-string-to-number', '+string prohibido (puede producir floats)');
    // --- new Date / new Date()
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(sf).replace(/^globalThis\./, '') === 'Date'
    )
      add(node, 'no-time', 'new Date prohibido');
    // --- for..of / spread over Map/Set
    if (
      ts.isForOfStatement(node) &&
      typeIsMapSet(checker, node.expression) &&
      !isSortedContext(node.expression)
    )
      add(node.expression, 'no-unordered-iteration', 'for..of sobre Map/Set sin ordenar');
    if (
      ts.isForOfStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      ITER_METHODS.has(node.expression.expression.name.text)
    ) {
      /* ya cubierto por la regla de llamada */
    }
    if (
      ts.isSpreadElement(node) &&
      typeIsMapSet(checker, node.expression) &&
      !isSortedContext(node)
    )
      add(node, 'no-unordered-iteration', 'spread de Map/Set sin ordenar');
    // --- DOM imports / references
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      DOM_MODULES.test(node.moduleSpecifier.text)
    ) {
      add(node, 'no-dom', `import de DOM/render '${node.moduleSpecifier.text}' prohibido en sim`);
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      RANDOM_MODULES.test(node.moduleSpecifier.text)
    )
      add(node, 'no-crypto', `import de '${node.moduleSpecifier.text}' prohibido en sim`);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      DOM_MODULES.test(node.arguments[0].text)
    ) {
      add(node, 'no-dom', 'require de DOM/render prohibido en sim');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (/\/\/\/\s*<reference\s+lib=["']dom/.test(sf.text))
    out.push({ file: fileName, line: 1, rule: 'no-dom', message: 'reference lib dom prohibido' });

  // escape por linea (motivo con >= MIN_REASON_LETTERS letras)
  const lines = sf.text.split(/\r?\n/);
  const seen = new Set();
  return out.filter((v) => {
    const key = `${v.line}:${v.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (hasAllowWithReason(lines[v.line - 1] ?? '')) return false;
    const prev = lines[v.line - 2] ?? '';
    return !(/^\s*\/\//.test(prev) && hasAllowWithReason(prev));
  });
}

/**
 * Lintea una lista de archivos .ts/.tsx/.mts. Devuelve violaciones [{file,line,rule,message}] ordenadas.
 * `opts.divisionHelpers`: rutas exactas con `/` libre (por defecto solo packages/shared/src/fixed.ts).
 */
export function lintFiles(files, opts = {}) {
  const divHelpers = (opts.divisionHelpers ?? DEFAULT_DIV_HELPERS).map((f) => path.resolve(f));
  const abs = files.map((f) => path.resolve(f));
  const program = ts.createProgram(abs, {
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    types: [],
    noEmit: true,
    skipLibCheck: true,
    allowJs: false,
    jsx: ts.JsxEmit.Preserve,
  });
  const checker = program.getTypeChecker();
  const out = [];
  for (const f of abs) {
    const sf = program.getSourceFile(f);
    if (!sf) {
      out.push({ file: f, line: 1, rule: 'io', message: 'no se pudo leer el archivo' });
      continue;
    }
    out.push(...lintSourceFile(sf, checker, f, divHelpers));
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function isSourceFile(name) {
  return (
    SRC_EXT.test(name) && !/\.d\.(ts|mts)$/.test(name) && !/\.(test|spec)\.(ts|tsx|mts)$/.test(name)
  );
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (isSourceFile(e.name)) acc.push(p);
  }
  return acc;
}

/** Archivos que lintea `pnpm lint:sim` por defecto, relativos a la raiz del repo. */
export function defaultTargets(root) {
  return [
    ...walk(path.join(root, 'packages/sim/src'), []),
    ...walk(path.join(root, 'packages/shared/src'), []),
  ];
}
