import { parse as babelParse } from "@babel/parser";
import _traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { AddressBook } from "./address-book.js";
import { inferPurpose } from "./purpose-heuristic.js";
import type {
  ChainName,
  DynamicResolution,
  ParsedAdapter,
  StaticAddress,
} from "./types.js";

export interface ParseAdapterOptions {
  /** Optional flattened coreAssets.json — see address-book.ts. */
  addressBook?: AddressBook;
}

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
 *   - the property key it's a value of (skipping uninformative SDK keys), or
 *   - the variable it's assigned to.
 */
function inferContext(path: NodePath<t.StringLiteral>): string | null {
  const parent = path.parent;
  // `key: "0x…"` — preferred when present, unless it's an SDK convention key.
  if (t.isObjectProperty(parent) && parent.value === path.node) {
    let key: string | null = null;
    if (t.isIdentifier(parent.key)) key = parent.key.name;
    else if (t.isStringLiteral(parent.key)) key = parent.key.value;
    if (key && !SDK_CONVENTION_KEYS.has(key)) return key;
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

/**
 * A binding from an identifier in the adapter source to a concrete address.
 * Created either from `const X = "0x..."` or by resolving a member expression
 * like `ADDRESSES.ethereum.STETH` against the address book.
 */
interface SymbolEntry {
  address: string;
  /** Chain inferred from the address-book lookup, if any. Beats lineToChain. */
  chain: ChainName | null;
  /** Symbol label from the address book (e.g. "STETH"), if any. */
  label: string | null;
}

type SymbolTable = Map<string, SymbolEntry>;

/**
 * Detect `<root>.<chain>.<SYMBOL>` shape (3 levels deep) and resolve via the
 * address book. Returns null if the shape doesn't match or the lookup misses.
 *
 * Conventional adapter usage is `ADDRESSES.ethereum.STETH`, but we don't gate
 * on the root identifier name — any matching shape that resolves in the book
 * is accepted, since name detection would require following the require()
 * import chain.
 */
function resolveAddressBookMember(
  node: t.Node,
  book: AddressBook,
): SymbolEntry | null {
  if (!t.isMemberExpression(node) || node.computed) return null;
  if (!t.isIdentifier(node.property)) return null;
  const symbol = node.property.name;
  // Two-level shape: ADDRESSES.null
  if (t.isIdentifier(node.object)) {
    const hit = book.get(symbol);
    if (hit) return { address: hit.address, chain: hit.chain, label: hit.symbol };
    return null;
  }
  // Three-level shape: ADDRESSES.ethereum.STETH
  if (
    t.isMemberExpression(node.object) &&
    !node.object.computed &&
    t.isIdentifier(node.object.property)
  ) {
    const chain = node.object.property.name;
    const hit = book.get(`${chain}.${symbol}`);
    if (hit) return { address: hit.address, chain: hit.chain, label: hit.symbol };
  }
  return null;
}

/**
 * Build a symbol table over the whole AST. Tracks both file-scope and
 * function-scope `const X = ...` declarations whose right-hand side is either:
 *   - a hex string literal, or
 *   - a member expression resolving via the address book.
 *
 * Block-scoped shadowing isn't a real concern in adapter source — addresses
 * are conventionally hoisted to single-binding consts — so a flat name map
 * is sufficient.
 */
function collectSymbolTable(ast: t.File, book: AddressBook): SymbolTable {
  const table: SymbolTable = new Map();
  traverse(ast, {
    VariableDeclarator(path) {
      const { node } = path;
      if (!t.isIdentifier(node.id) || !node.init) return;
      const name = node.id.name;
      if (t.isStringLiteral(node.init) && ADDRESS_RE.test(node.init.value)) {
        table.set(name, {
          address: node.init.value.toLowerCase(),
          chain: null,
          label: null,
        });
        return;
      }
      const resolved = resolveAddressBookMember(node.init, book);
      if (resolved) table.set(name, resolved);
    },
  });
  return table;
}

/**
 * Try to resolve any value-position node to an address binding:
 *   - Identifier looked up in the symbol table
 *   - MemberExpression resolved against the address book
 *   - StringLiteral with a 40-hex address
 * Returns null when no resolution applies.
 */
function tryResolveValue(
  node: t.Node,
  table: SymbolTable,
  book: AddressBook,
): SymbolEntry | null {
  if (t.isStringLiteral(node)) {
    if (!ADDRESS_RE.test(node.value)) return null;
    return { address: node.value.toLowerCase(), chain: null, label: null };
  }
  if (t.isIdentifier(node)) {
    return table.get(node.name) ?? null;
  }
  if (t.isMemberExpression(node)) {
    return resolveAddressBookMember(node, book);
  }
  return null;
}

/**
 * Compare two same-address candidates and return the more informative one.
 * Priorities, in order:
 *   1. specific purpose_hint over "unknown"
 *   2. context present over null
 *   3. shorter context (e.g. "oracle" beats "ETH_ORACLE")
 *   4. lower-case context (e.g. "oracle" beats "Oracle")
 */
function compareInformative(a: StaticAddress, b: StaticAddress): number {
  const aHint = a.purpose_hint === "unknown" ? 1 : 0;
  const bHint = b.purpose_hint === "unknown" ? 1 : 0;
  if (aHint !== bHint) return aHint - bHint;
  const aHasCtx = a.context ? 0 : 1;
  const bHasCtx = b.context ? 0 : 1;
  if (aHasCtx !== bHasCtx) return aHasCtx - bHasCtx;
  if (a.context && b.context) {
    if (a.context.length !== b.context.length) return a.context.length - b.context.length;
    const aLower = a.context === a.context.toLowerCase() ? 0 : 1;
    const bLower = b.context === b.context.toLowerCase() ? 0 : 1;
    if (aLower !== bLower) return aLower - bLower;
  }
  return 0;
}

function pickBest(list: StaticAddress[]): StaticAddress {
  let best = list[0]!;
  for (let i = 1; i < list.length; i++) {
    if (compareInformative(list[i]!, best) < 0) best = list[i]!;
  }
  return best;
}

function dedupeStatic(addrs: StaticAddress[]): StaticAddress[] {
  // 1. Group by address.
  // 2. If any entry for an address has a chain attribution, the chain=null
  //    entries (file-scope bindings before chain context resolved) can still
  //    contribute their context if it's more informative — lift it onto the
  //    chained pick.
  const byAddress = new Map<string, StaticAddress[]>();
  for (const a of addrs) {
    const list = byAddress.get(a.address) ?? [];
    list.push(a);
    byAddress.set(a.address, list);
  }
  const merged: StaticAddress[] = [];
  for (const [, list] of byAddress) {
    const chained = list.filter((x) => x.chain !== null);
    if (chained.length === 0) {
      merged.push(pickBest(list));
      continue;
    }
    const nullChain = list.filter((x) => x.chain === null);
    const bestNull = nullChain.length > 0 ? pickBest(nullChain) : null;
    // Group chained entries by chain so multi-chain occurrences each get one row.
    const groups = new Map<string, StaticAddress[]>();
    for (const a of chained) {
      const key = `${a.chain}|${a.address}`;
      const g = groups.get(key) ?? [];
      g.push(a);
      groups.set(key, g);
    }
    for (const [, g] of groups) {
      let best = pickBest(g);
      // Lift null-chain context if strictly more informative.
      if (bestNull && compareInformative(bestNull, best) < 0) {
        best = {
          ...best,
          context: bestNull.context,
          purpose_hint: bestNull.purpose_hint,
        };
      }
      merged.push(best);
    }
  }
  return merged.sort((a, b) => {
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

/**
 * Extract `sdk.api.abi.call({ target, abi, chain })` shape.
 * `target` may be a literal, identifier, or member expression — we try to
 * resolve all three. When fully resolved, the caller emits a static_address
 * AND skips the dynamic_resolution entry (the call is no longer "dynamic" in
 * any meaningful sense). Only truly unresolved targets land in dynamic[].
 */
function extractAbiCall(
  path: NodePath<t.CallExpression>,
  ctx: ChainContextMap,
  table: SymbolTable,
  book: AddressBook,
): {
  resolvedTarget: SymbolEntry | null;
  abiCall: string | null;
  chain: ChainName | null;
  rawTargetUnresolved: boolean;
  line: number;
} | null {
  const node = path.node;
  if (!isSdkAbiCall(node)) return null;
  const arg = node.arguments[0];
  if (!arg || !t.isObjectExpression(arg)) return null;
  let resolvedTarget: SymbolEntry | null = null;
  let rawTargetUnresolved = false;
  let abiCall: string | null = null;
  let chainProp: ChainName | null = null;
  for (const prop of arg.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = propertyKeyName(prop);
    if (!key) continue;
    if (key === "target") {
      resolvedTarget = tryResolveValue(prop.value, table, book);
      if (!resolvedTarget) rawTargetUnresolved = true;
    }
    if (key === "abi" && t.isStringLiteral(prop.value)) {
      abiCall = prop.value.value;
    }
    if (key === "chain" && t.isStringLiteral(prop.value)) {
      chainProp = prop.value.value;
    }
  }
  if (!resolvedTarget && !rawTargetUnresolved && !abiCall) return null;
  const line = node.loc?.start.line ?? 0;
  const chain = chainProp ?? resolvedTarget?.chain ?? lineToChain(line, ctx).chain;
  return { resolvedTarget, abiCall, chain, rawTargetUnresolved, line };
}

/**
 * True if this Identifier path is at a binding site or otherwise not a
 * "value-position read." Used to filter the Identifier visitor so we don't
 * try to resolve declaration names, parameters, callees, property keys, etc.
 */
function isBindingOrNonValueIdentifier(path: NodePath<t.Identifier>): boolean {
  const parent = path.parent;
  // `const X = ...` — X is the binding, not a use
  if (t.isVariableDeclarator(parent) && parent.id === path.node) return true;
  // `function X() {}` / `function (X) {}` / `(X) => ...` — declarations and params
  if (
    (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent)) &&
    (parent.id === path.node || (parent.params as t.Node[]).includes(path.node))
  ) {
    return true;
  }
  if (
    t.isArrowFunctionExpression(parent) &&
    (parent.params as t.Node[]).includes(path.node)
  ) {
    return true;
  }
  // Property key (foo: X — only when the key, not when X is the value)
  if (t.isObjectProperty(parent) && parent.key === path.node && !parent.computed) return true;
  if (t.isObjectMethod(parent) && parent.key === path.node && !parent.computed) return true;
  // Member expression property side (.X)
  if (t.isMemberExpression(parent) && parent.property === path.node && !parent.computed) return true;
  // Callee position — `X(...)` is a function call, not an address read
  if (t.isCallExpression(parent) && parent.callee === path.node) return true;
  // import { X } / import X from
  if (t.isImportSpecifier(parent) || t.isImportDefaultSpecifier(parent) || t.isImportNamespaceSpecifier(parent)) {
    return true;
  }
  // For of / catch params
  if (t.isCatchClause(parent) && parent.param === path.node) return true;
  return false;
}

/**
 * True when this MemberExpression is the property side of an outer member
 * expression (e.g. ADDRESSES.ethereum within ADDRESSES.ethereum.STETH).
 * We only want to resolve at the outermost member expression.
 */
function isInnerMemberStep(path: NodePath<t.MemberExpression>): boolean {
  return t.isMemberExpression(path.parent) && (path.parent as t.MemberExpression).object === path.node;
}

export function parseAdapter(source: string, opts: ParseAdapterOptions = {}): ParsedAdapter {
  const addressBook: AddressBook = opts.addressBook ?? new Map();
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
  const symbolTable = collectSymbolTable(ast, addressBook);
  const staticAddresses: StaticAddress[] = [];
  const dynamicResolutions: DynamicResolution[] = [];
  const imports: string[] = [];

  /**
   * Emit a static address from a resolved value (literal / identifier / member
   * expression). `entry.chain` (if set, e.g. from an ADDRESSES.x.y lookup)
   * wins over line-based attribution; `entry.label` becomes the context when
   * present (e.g. "STETH"), unless the property-key override applies.
   */
  function emit(entry: SymbolEntry, line: number, directContext: string | null): void {
    const lineCtx = lineToChain(line, ctx);
    const chain = entry.chain ?? lineCtx.chain;
    // Context priority: explicit label from address book (e.g. "STETH") wins;
    // then the local variable/property name (most informative); fall back to
    // the chain-block binding's property key only when there's nothing else.
    const context = entry.label ?? directContext ?? lineCtx.propertyKey;
    staticAddresses.push({
      chain,
      address: entry.address,
      context,
      source_line: line,
      purpose_hint: inferPurpose(context),
    });
  }

  traverse(ast, {
    StringLiteral(path) {
      const value = path.node.value;
      if (!ADDRESS_RE.test(value)) return;
      const line = path.node.loc?.start.line ?? 0;
      emit(
        { address: value.toLowerCase(), chain: null, label: null },
        line,
        inferContext(path),
      );
    },
    Identifier(path) {
      if (isBindingOrNonValueIdentifier(path)) return;
      const entry = symbolTable.get(path.node.name);
      if (!entry) return;
      const line = path.node.loc?.start.line ?? 0;
      // Use the local property/variable name as context if no label.
      const directContext = inferIdentifierContext(path);
      emit(entry, line, directContext);
    },
    MemberExpression(path) {
      if (isInnerMemberStep(path)) return;
      const entry = resolveAddressBookMember(path.node, addressBook);
      if (!entry) return;
      const line = path.node.loc?.start.line ?? 0;
      const directContext = inferMemberContext(path);
      emit(entry, line, directContext);
    },
    CallExpression(path) {
      // require("…")
      if (
        t.isIdentifier(path.node.callee, { name: "require" }) &&
        path.node.arguments.length === 1 &&
        t.isStringLiteral(path.node.arguments[0])
      ) {
        imports.push((path.node.arguments[0] as t.StringLiteral).value);
        return;
      }
      const abiCall = extractAbiCall(path, ctx, symbolTable, addressBook);
      if (!abiCall) return;
      const { resolvedTarget, abiCall: abiSig, chain, rawTargetUnresolved, line } = abiCall;
      if (resolvedTarget) {
        // Static enough — emit only as static_address, with context "target".
        // Identifier visitor will *also* emit it via the same target argument
        // (the `target: X` value), so dedupe handles double-emission.
        const directContext = resolvedTarget.label ?? "target";
        emit(resolvedTarget, line, directContext);
      } else if (rawTargetUnresolved || abiSig) {
        // Genuinely dynamic: factory unknown / abi present / target is computed.
        dynamicResolutions.push({
          chain,
          factory: null,
          abi_call: abiSig,
          source_line: line,
          note: "addresses resolved at runtime via factory call",
        });
      }
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

/**
 * SDK-convention property keys that describe how an address is USED rather
 * than what it IS. Suppress these as contexts so that more meaningful labels
 * (variable names, chain-block property keys) can take over.
 *
 *   `api.call({ target: X })`           — "target" is uninformative
 *   `api.sumTokens({ owner: X })`       — "owner" is uninformative
 *   `api.sumTokens({ tokens: [X] })`    — "tokens" is uninformative
 */
const SDK_CONVENTION_KEYS = new Set([
  "target",
  "owner",
  "tokens",
  "tokensAndOwners",
  "abi",
  "chain",
  "fromBlock",
  "toBlock",
  "args",
  "params",
  "block",
  "options",
  "permitTags",
  "ownerTokens",
]);

/**
 * Identifier-as-value context: parent property key or variable binding,
 * skipping uninformative SDK convention keys.
 */
function inferIdentifierContext(path: NodePath<t.Identifier>): string | null {
  const parent = path.parent;
  if (t.isObjectProperty(parent) && parent.value === path.node) {
    let key: string | null = null;
    if (t.isIdentifier(parent.key)) key = parent.key.name;
    else if (t.isStringLiteral(parent.key)) key = parent.key.value;
    if (key && SDK_CONVENTION_KEYS.has(key)) return null;
    return key;
  }
  if (t.isVariableDeclarator(parent) && parent.init === path.node) {
    if (t.isIdentifier(parent.id)) return parent.id.name;
  }
  return null;
}

/**
 * MemberExpression-as-value context: prefer parent property key, fall back to
 * the member's own `.symbol` (which the address-book lookup also surfaces as
 * `label`, but this handles e.g. an `ADDRESSES.x.y` not present in the book).
 */
function inferMemberContext(path: NodePath<t.MemberExpression>): string | null {
  const parent = path.parent;
  if (t.isObjectProperty(parent) && parent.value === path.node) {
    if (t.isIdentifier(parent.key)) return parent.key.name;
    if (t.isStringLiteral(parent.key)) return parent.key.value;
  }
  if (t.isVariableDeclarator(parent) && parent.init === path.node) {
    if (t.isIdentifier(parent.id)) return parent.id.name;
  }
  if (t.isIdentifier(path.node.property)) return path.node.property.name;
  return null;
}
