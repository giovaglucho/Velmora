// lint:sim - lint de determinismo basado en el AST de TypeScript. Ver README.md para las reglas.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export const ALLOWED_MATH = new Set(["min", "max", "abs", "trunc", "imul", "clz32", "sign"]);
const DOM_MODULES = /^(react-dom|react|pixi(\.js)?|@pixi\/.*|jsdom|happy-dom|dom)(\/.*)?$/;
const DOM_GLOBALS = new Set(["window", "document", "navigator", "localStorage", "sessionStorage", "requestAnimationFrame", "HTMLElement", "HTMLCanvasElement", "alert"]);
const TIMER_FNS = new Set(["setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "requestIdleCallback"]);
const MAPSET = new Set(["Map", "Set", "ReadonlyMap", "ReadonlySet", "WeakMap", "WeakSet"]);
const ITER_METHODS = new Set(["keys", "values", "entries", "forEach"]);
const FLOAT_STR_METHODS = new Set(["toFixed", "toPrecision", "toExponential"]);

/** Archivos que pueden usar `/` libremente: son los helpers de punto fijo. */
const DIV_HELPER_FILE = /(^|[\\/])fixed[^\\/]*\.ts$/;

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
  if (ts.isCallExpression(p) && p.arguments[0] === outer && ts.isPropertyAccessExpression(p.expression) &&
      ts.isIdentifier(p.expression.expression) && p.expression.expression.text === "Math" && p.expression.name.text === "trunc") return true;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (k === ts.SyntaxKind.BarToken || k === ts.SyntaxKind.GreaterThanGreaterThanToken || k === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken) {
      const other = p.left === outer ? p.right : p.left;
      return ts.isNumericLiteral(other) && other.text === "0";
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
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && (p.name.text === "sort" || p.name.text === "toSorted")) return true;
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

function isDeclarationName(n) {
  const p = n.parent;
  if (!p) return false;
  if ((ts.isPropertyAccessExpression(p) && p.name === n)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) ||
       ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isBindingElement(p) ||
       ts.isImportSpecifier(p) || ts.isTypeReferenceNode(p) || ts.isQualifiedName(p)) && p.name === n) return true;
  return false;
}

function lintSourceFile(sf, checker, fileName) {
  const out = [];
  const add = (node, rule, message) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file: fileName, line: line + 1, rule, message });
  };
  const isDivHelper = DIV_HELPER_FILE.test(fileName);

  const visit = (node) => {
    // --- float literals
    if (ts.isNumericLiteral(node)) {
      const txt = node.getText(sf);
      if (!/^0[xXbBoO]/.test(txt) && (/\./.test(txt) || /[eE]-/.test(txt))) add(node, "no-float-literal", `literal en coma flotante '${txt}'`);
    }
    // --- division
    if (ts.isBinaryExpression(node)) {
      const k = node.operatorToken.kind;
      if ((k === ts.SyntaxKind.SlashToken && !divisionIsTruncated(node) && !isDivHelper) || (k === ts.SyntaxKind.SlashEqualsToken && !isDivHelper)) {
        add(node, "no-division", "operador '/' sin truncado explicito (Math.trunc / | 0 / >> 0) ni helper de fixed.ts");
      }
      if (k === ts.SyntaxKind.AsteriskAsteriskToken || k === ts.SyntaxKind.AsteriskAsteriskEqualsToken) add(node, "no-exponent", "operador '**' prohibido");
    }
    // --- identifiers
    if (ts.isIdentifier(node) && !isDeclarationName(node)) {
      const n = node.text;
      if (n === "parseFloat") add(node, "no-parsefloat", "parseFloat prohibido");
      if (DOM_GLOBALS.has(n)) add(node, "no-dom", `acceso a global de DOM '${n}'`);
      if (TIMER_FNS.has(n) && (ts.isCallExpression(node.parent) && node.parent.expression === node)) add(node, "no-timers", `${n} prohibido (usar ticks)`);
    }
    // --- property access
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const objText = node.expression.getText(sf);
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : (ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null);
      if (objText === "Math") {
        if (name === null) add(node, "no-math", "Math[...] dinamico prohibido");
        else if (name === "random") add(node, "no-math-random", "Math.random prohibido (usar PRNG de la partida)");
        else if (!ALLOWED_MATH.has(name)) add(node, "no-math", `Math.${name} no permitido (solo ${[...ALLOWED_MATH].join("/")})`);
      }
      if (name !== null) {
        if (objText === "Date" && name === "now") add(node, "no-time", "Date.now prohibido");
        if (objText === "performance" && name === "now") add(node, "no-time", "performance.now prohibido");
        if (objText === "Number" && (name === "parseFloat")) add(node, "no-parsefloat", "Number.parseFloat prohibido");
        if (FLOAT_STR_METHODS.has(name)) add(node, "no-tofixed", `.${name} prohibido`);
        if (ts.isPropertyAccessExpression(node) && ITER_METHODS.has(name) && ts.isCallExpression(node.parent) && node.parent.expression === node &&
            typeIsMapSet(checker, node.expression) && !isSortedContext(node)) {
          add(node, "no-unordered-iteration", `.${name}() sobre Map/Set sin ordenar (envolver en [...].sort(...))`);
        }
        if (objText === "Array" && name === "from") {
          const call = node.parent;
          if (ts.isCallExpression(call) && call.expression === node && call.arguments[0] &&
              (typeIsMapSet(checker, call.arguments[0]) || /\.(keys|values|entries)\(\)$/.test(call.arguments[0].getText(sf)) && ts.isCallExpression(call.arguments[0]) && ts.isPropertyAccessExpression(call.arguments[0].expression) && typeIsMapSet(checker, call.arguments[0].expression.expression)) &&
              !isSortedContext(call)) {
            add(node, "no-unordered-iteration", "Array.from(Map/Set) sin ordenar");
          }
        }
      }
    }
    // --- new Date / new Date()
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") add(node, "no-time", "new Date prohibido");
    // --- for..of / spread over Map/Set
    if (ts.isForOfStatement(node) && typeIsMapSet(checker, node.expression) && !isSortedContext(node.expression)) add(node.expression, "no-unordered-iteration", "for..of sobre Map/Set sin ordenar");
    if (ts.isForOfStatement(node) && ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression) &&
        ITER_METHODS.has(node.expression.expression.name.text)) { /* ya cubierto por la regla de llamada */ }
    if (ts.isSpreadElement(node) && typeIsMapSet(checker, node.expression) && !isSortedContext(node)) add(node, "no-unordered-iteration", "spread de Map/Set sin ordenar");
    // --- DOM imports / references
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && DOM_MODULES.test(node.moduleSpecifier.text)) {
      add(node, "no-dom", `import de DOM/render '${node.moduleSpecifier.text}' prohibido en sim`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && DOM_MODULES.test(node.arguments[0].text)) {
      add(node, "no-dom", "require de DOM/render prohibido en sim");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (/\/\/\/\s*<reference\s+lib=["']dom/.test(sf.text)) out.push({ file: fileName, line: 1, rule: "no-dom", message: "reference lib dom prohibido" });

  // escape por linea
  const lines = sf.text.split(/\r?\n/);
  const allowRe = /\/\/\s*lint-sim-allow:\s*\S/;
  const seen = new Set();
  return out.filter((v) => {
    const key = `${v.line}:${v.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (allowRe.test(lines[v.line - 1] ?? "")) return false;
    const prev = lines[v.line - 2] ?? "";
    return !(/^\s*\/\//.test(prev) && allowRe.test(prev));
  });
}

/** Lintea una lista de archivos .ts. Devuelve violaciones [{file,line,rule,message}] ordenadas. */
export function lintFiles(files) {
  const abs = files.map((f) => path.resolve(f));
  const program = ts.createProgram(abs, { target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"], types: [], noEmit: true, skipLibCheck: true, allowJs: false });
  const checker = program.getTypeChecker();
  const out = [];
  for (const f of abs) {
    const sf = program.getSourceFile(f);
    if (!sf) { out.push({ file: f, line: 1, rule: "io", message: "no se pudo leer el archivo" }); continue; }
    out.push(...lintSourceFile(sf, checker, f));
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Archivos que lintea `pnpm lint:sim` por defecto, relativos a la raiz del repo. */
export function defaultTargets(root) {
  const files = walk(path.join(root, "packages/sim/src"), []);
  const shared = path.join(root, "packages/shared/src");
  if (fs.existsSync(shared)) {
    for (const e of fs.readdirSync(shared)) if (/^(fixed|prng|hash)[^/]*\.ts$/.test(e) && !/\.test\.ts$/.test(e)) files.push(path.join(shared, e));
  }
  return files;
}
