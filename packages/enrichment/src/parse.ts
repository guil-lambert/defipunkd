import { parse as babelParse } from "@babel/parser";
import _traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { inferPurpose } from "./purpose-heuristic.js";
import type {
  ChainName,
  DynamicResolution,
  ParsedAdapter,
  StaticAddress,
} from "./types.js";

// @babel/traverse ships as CJS-with-default; ESM consumers need the `.default` shim.
const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Lowercase chain names commonly used as top-level keys in DeFiLlama adapter
 * configuration objects. When a `const config = { ... }` (or similar) has ≥2
 * properties whose keys are in this set, we treat it as a chain map even if
 * it's not directly assigned to module.exports — adapters frequently do
 * `Object.keys(config).forEach(c => module.exports[c] = {...})`.
 */
const KNOWN_CHAIN_KEYS = new Set([
  "ethereum", "arbitrum", "optimism", "base", "polygon", "bsc", "avalanche", "avax",
  "fantom", "mantle", "sonic", "berachain", "solana", "cronos", "era", "zksync",
  "blast", "scroll", "linea", "mode", "hyperliquid", "plasma", "metis", "kava",
  "celo", "aurora", "gnosis", "zora", "moonbeam", "moonriver", "harmony", "heco",
  "klaytn", "rsk", "sei", "sui", "starknet", "tron", "core", "manta", "fraxtal",
  "taiko", "tangle", "xdai", "pulse", "wax", "neon", "boba", "nova", "polygon_zkevm",
]);

interface LineRange {
  startLine: number;
  endLine: number;
}

interface ChainRange extends LineRange {
  chain: ChainName;
}

interface IdentifierBinding {
  chain: ChainName;
  /** Property key the identifier is bound under inside the chain block, if any. */
  propertyKey: string | null;
}

interface ChainContextMap {
  /** Direct ranges from module.exports chain blocks. */
  directRanges: ChainRange[];
  /** Identifier name → chain it's referenced from + the property key it's bound under. */
  identifierToChain: Map<string, IdentifierBinding>;
  /** Identifier name → declaration line range (function / const). */
  identifierRanges: Map<string, LineRange>;
}

function lineInRange(line: number, r: LineRange): boolean {
  return line >= r.startLine && line <= r.endLine;
}

/** Resolve a literal at a given line to {chain, override-context-from-property-key}. */
function lineToChain(
  line: number,
  ctx: ChainContextMap,
): { chain: ChainName | null; propertyKey: string | null } {
  // 1. Innermost matching direct chain block wins.
  let best: ChainRange | null = null;
  for (const r of ctx.directRanges) {
    if (!lineInRange(line, r)) continue;
    if (!best || r.endLine - r.startLine < best.endLine - best.startLine) {
      best = r;
    }
  }
  if (best) return { chain: best.chain, propertyKey: null };
  // 2. Indirect: literal lives inside a top-level declaration referenced by a chain block.
  for (const [ident, range] of ctx.identifierRanges) {
    if (!lineInRange(line, range)) continue;
    const binding = ctx.identifierToChain.get(ident);
    if (binding) {
      return { chain: binding.chain, propertyKey: binding.propertyKey };
    }
  }
  return { chain: null, propertyKey: null };
}

function propertyKeyName(prop: t.ObjectProperty): string | null {
  if (t.isIdentifier(prop.key)) return prop.key.name;
  if (t.isStringLiteral(prop.key)) return prop.key.value;
  return null;
}

/** Map identifier names referenced inside a chain block to their binding property key. */
function collectReferencedIdentifiers(
  node: t.ObjectExpression,
): Map<string, string | null> {
  const idents = new Map<string, string | null>();
  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const v = prop.value;
    if (t.isIdentifier(v)) {
      // `oracle: ETH_ORACLE`  → ETH_ORACLE bound under "oracle"
      // `{ tvl }`             → tvl bound under "tvl" (shorthand uses key=value name)
      idents.set(v.name, propertyKeyName(prop));
    }
  }
  return idents;
}

/** Top-level declarations whose body may contain addresses for a chain. */
function collectIdentifierRanges(ast: t.File): Map<string, LineRange> {
  const ranges = new Map<string, LineRange>();
  for (const stmt of ast.program.body) {
    if (t.isFunctionDeclaration(stmt) && stmt.id?.name && stmt.loc) {
      ranges.set(stmt.id.name, {
        startLine: stmt.loc.start.line,
        endLine: stmt.loc.end.line,
      });
    } else if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id)) continue;
        if (!decl.init || !decl.init.loc) continue;
        ranges.set(decl.id.name, {
          startLine: decl.init.loc.start.line,
          endLine: decl.init.loc.end.line,
        });
      }
    }
  }
  return ranges;
}

/**
 * Heuristic: an ObjectExpression looks like a per-chain config if at least two
 * of its top-level keys are in KNOWN_CHAIN_KEYS. Lets us recognize patterns
 * like `const config = { ethereum: {...}, base: {...} }` even when the export
 * is wired up dynamically.
 */
function looksLikeChainConfig(obj: t.ObjectExpression): boolean {
  let chainKeyHits = 0;
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const k = propertyKeyName(prop);
    if (k && KNOWN_CHAIN_KEYS.has(k.toLowerCase())) chainKeyHits++;
    if (chainKeyHits >= 2) return true;
  }
  return false;
}

function addChainRangesFromObjectExpression(
  obj: t.ObjectExpression,
  directRanges: ChainRange[],
  identifierToChain: Map<string, IdentifierBinding>,
): void {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = propertyKeyName(prop);
    if (!key) continue;
    const loc = prop.value.loc;
    if (!loc) continue;
    if (t.isObjectExpression(prop.value)) {
      directRanges.push({
        chain: key,
        startLine: loc.start.line,
        endLine: loc.end.line,
      });
      for (const [ident, propKey] of collectReferencedIdentifiers(prop.value)) {
        identifierToChain.set(ident, { chain: key, propertyKey: propKey });
      }
    } else if (t.isIdentifier(prop.value)) {
      identifierToChain.set(prop.value.name, { chain: key, propertyKey: key });
    }
  }
}

function collectChainContext(ast: t.File): ChainContextMap {
  const directRanges: ChainRange[] = [];
  const identifierToChain = new Map<string, IdentifierBinding>();
  const identifierRanges = collectIdentifierRanges(ast);

  // Pass 1: top-level `const X = { ethereum: {...}, base: {...} }` chain configs.
  for (const stmt of ast.program.body) {
    if (!t.isVariableDeclaration(stmt)) continue;
    for (const decl of stmt.declarations) {
      if (!decl.init || !t.isObjectExpression(decl.init)) continue;
      if (!looksLikeChainConfig(decl.init)) continue;
      addChainRangesFromObjectExpression(decl.init, directRanges, identifierToChain);
    }
  }

  // Pass 2: `module.exports = { ... }` (the canonical export pattern).
  traverse(ast, {
    AssignmentExpression(path) {
      const { node } = path;
      if (
        !(
          t.isMemberExpression(node.left) &&
          t.isIdentifier(node.left.object, { name: "module" }) &&
          t.isIdentifier(node.left.property, { name: "exports" }) &&
          t.isObjectExpression(node.right)
        )
      ) {
        return;
      }
      addChainRangesFromObjectExpression(node.right, directRanges, identifierToChain);
      path.skip();
    },
  });

  return { directRanges, identifierToChain, identifierRanges };
}

/**
 * Walk up from a string-literal node to find the closest meaningful identifier:
 *   - the property key it's a value of, or
 *   - the variable it's assigned to.
 */
function inferContext(path: NodePath<t.StringLiteral>): string | null {
  const parent = path.parent;
  // `key: "0x…"` — preferred when present.
  if (t.isObjectProperty(parent) && parent.value === path.node) {
    if (t.isIdentifier(parent.key)) return parent.key.name;
    if (t.isStringLiteral(parent.key)) return parent.key.value;
  }
  // `const foo = "0x…"`
  if (t.isVariableDeclarator(parent) && parent.init === path.node) {
    if (t.isIdentifier(parent.id)) return parent.id.name;
  }
  // `foo = "0x…"`
  if (t.isAssignmentExpression(parent) && parent.right === path.node) {
    if (t.isIdentifier(parent.left)) return parent.left.name;
    if (
      t.isMemberExpression(parent.left) &&
      t.isIdentifier(parent.left.property)
    ) {
      return parent.left.property.name;
    }
  }
  return null;
}

function dedupeStatic(addrs: StaticAddress[]): StaticAddress[] {
  const seen = new Map<string, StaticAddress>();
  for (const a of addrs) {
    const key = `${a.chain ?? ""}|${a.address}`;
    const existing = seen.get(key);
    // Keep the one with the most informative context.
    if (!existing || (existing.context === null && a.context !== null)) {
      seen.set(key, a);
    }
  }
  return [...seen.values()].sort((a, b) => {
    const ca = a.chain ?? "";
    const cb = b.chain ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.address.localeCompare(b.address);
  });
}

function isSdkAbiCall(node: t.CallExpression): boolean {
  // Match sdk.api.abi.call / sdk.api2.abi.call / sdk.api.abi.multiCall / api.abi.call etc.
  const callee = node.callee;
  if (!t.isMemberExpression(callee)) return false;
  if (!t.isIdentifier(callee.property)) return false;
  const method = callee.property.name;
  if (!/^(call|multiCall)$/.test(method)) return false;
  let cursor: t.Node = callee.object;
  while (t.isMemberExpression(cursor)) {
    if (t.isIdentifier(cursor.property, { name: "abi" })) return true;
    cursor = cursor.object;
  }
  return false;
}

function extractDynamic(
  path: NodePath<t.CallExpression>,
  ctx: ChainContextMap,
): DynamicResolution | null {
  const node = path.node;
  if (!isSdkAbiCall(node)) return null;
  const arg = node.arguments[0];
  if (!arg || !t.isObjectExpression(arg)) return null;
  let factory: string | null = null;
  let abiCall: string | null = null;
  let chainProp: string | null = null;
  for (const prop of arg.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = propertyKeyName(prop);
    if (!key) continue;
    if (key === "target" && t.isStringLiteral(prop.value)) {
      const v = prop.value.value;
      if (ADDRESS_RE.test(v)) factory = v.toLowerCase();
    }
    if (key === "abi" && t.isStringLiteral(prop.value)) {
      abiCall = prop.value.value;
    }
    // sdk.api.abi.call({ chain: "ethereum", ... })
    if (key === "chain" && t.isStringLiteral(prop.value)) {
      chainProp = prop.value.value;
    }
  }
  if (!factory && !abiCall) return null;
  const line = node.loc?.start.line ?? 0;
  return {
    chain: chainProp ?? lineToChain(line, ctx).chain,
    factory,
    abi_call: abiCall,
    source_line: line,
    note: "addresses resolved at runtime via factory call",
  };
}

export function parseAdapter(source: string): ParsedAdapter {
  const warnings: string[] = [];
  let ast: t.File;
  try {
    ast = babelParse(source, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: ["objectRestSpread"],
    });
  } catch (err) {
    return {
      static_addresses: [],
      dynamic_resolution: [],
      imports: [],
      warnings: [`parse error: ${(err as Error).message}`],
    };
  }

  const ctx = collectChainContext(ast);
  const staticAddresses: StaticAddress[] = [];
  const dynamicResolutions: DynamicResolution[] = [];
  const imports: string[] = [];

  traverse(ast, {
    StringLiteral(path) {
      const value = path.node.value;
      if (!ADDRESS_RE.test(value)) return;
      const line = path.node.loc?.start.line ?? 0;
      const directContext = inferContext(path);
      const { chain, propertyKey } = lineToChain(line, ctx);
      // If the literal was attributed to a chain via an identifier reference,
      // the chain block's property key is the more meaningful context label.
      const context = propertyKey ?? directContext;
      staticAddresses.push({
        chain,
        address: value.toLowerCase(),
        context,
        source_line: line,
        purpose_hint: inferPurpose(context),
      });
    },
    CallExpression(path) {
      // Imports via require("…")
      if (
        t.isIdentifier(path.node.callee, { name: "require" }) &&
        path.node.arguments.length === 1 &&
        t.isStringLiteral(path.node.arguments[0])
      ) {
        imports.push((path.node.arguments[0] as t.StringLiteral).value);
        return;
      }
      const dyn = extractDynamic(path, ctx);
      if (dyn) dynamicResolutions.push(dyn);
    },
    ImportDeclaration(path) {
      imports.push(path.node.source.value);
    },
  });

  // Stable ordering for diff-friendly output.
  imports.sort();
  dynamicResolutions.sort(
    (a, b) => a.source_line - b.source_line || (a.factory ?? "").localeCompare(b.factory ?? ""),
  );

  return {
    static_addresses: dedupeStatic(staticAddresses),
    dynamic_resolution: dynamicResolutions,
    imports: [...new Set(imports)],
    warnings,
  };
}
