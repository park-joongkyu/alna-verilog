const MODULE_DECL_RE = /\bmodule\s+([A-Za-z_]\w*)/g;
const ENDMODULE_RE = /\bendmodule\b/g;

// Not a real parser - identifiers that legitimately precede "(" in Verilog
// but are never module instantiations, so a match against these as the
// "instance name" slot is a false positive to discard.
const RESERVED_WORDS = new Set([
  "if", "else", "for", "while", "case", "casex", "casez", "begin", "end",
  "always", "always_ff", "always_comb", "always_latch", "initial", "assign",
  "function", "task", "module", "endmodule", "generate", "endgenerate",
  "genvar", "input", "output", "inout", "wire", "reg", "logic", "integer",
  "parameter", "localparam", "posedge", "negedge",
]);

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
}

export function extractModules(code) {
  const clean = stripComments(code);
  const names = [];
  let m;
  MODULE_DECL_RE.lastIndex = 0;
  while ((m = MODULE_DECL_RE.exec(clean))) {
    names.push(m[1]);
  }
  return names;
}

/**
 * Splits a file's content into one segment per declared module, each
 * spanning from its own `module X` to the next `endmodule`. Needed because
 * a single file can bundle several modules (e.g. a hand-consolidated RTL
 * file) - without this, instantiations found anywhere in the file would all
 * get credited to whichever module happens to be declared first, instead of
 * whichever module's body they actually appear in.
 */
export function splitModules(code) {
  const clean = stripComments(code);
  const starts = [];
  let m;
  MODULE_DECL_RE.lastIndex = 0;
  while ((m = MODULE_DECL_RE.exec(clean))) {
    starts.push({ name: m[1], index: m.index });
  }
  const ends = [];
  ENDMODULE_RE.lastIndex = 0;
  while ((m = ENDMODULE_RE.exec(clean))) {
    ends.push(m.index + m[0].length);
  }
  const segments = [];
  let cursor = 0;
  for (const { name, index } of starts) {
    const end = ends.find((e) => e > index && e >= cursor) ?? clean.length;
    cursor = end;
    segments.push({ name, body: clean.slice(index, end) });
  }
  return segments;
}

/**
 * Finds instantiations of `knownModuleNames` within `code`: occurrences of
 * `<type> [#(...)] <instanceName> (`. Heuristic, not a real parser - works
 * for typical Verilog instantiation style, not exhaustive.
 */
export function extractInstances(code, knownModuleNames) {
  const clean = stripComments(code);
  const instances = [];
  for (const type of knownModuleNames) {
    const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b\\s*(#\\s*\\([^;]*?\\))?\\s*([A-Za-z_]\\w*)\\s*\\(`, "g");
    let m;
    while ((m = re.exec(clean))) {
      const instanceName = m[2];
      if (RESERVED_WORDS.has(instanceName)) continue;
      instances.push({ type, instanceName });
    }
  }
  return instances;
}

/**
 * Builds a module instantiation forest from a set of { name, content } RTL
 * files. Returns an array of root nodes (modules never instantiated by any
 * other known module in the set), each shaped as
 * { module, file, instanceName, cyclic?, children: [...] }.
 */
export function buildHierarchy(files) {
  const moduleToFile = new Map();
  const fileSegments = new Map();
  for (const f of files) {
    const segments = splitModules(f.content);
    fileSegments.set(f.name, segments);
    for (const { name } of segments) {
      if (!moduleToFile.has(name)) moduleToFile.set(name, f.name);
    }
  }
  const knownNames = [...moduleToFile.keys()];

  const childrenOf = new Map();
  const instantiatedTypes = new Set();
  for (const f of files) {
    const segments = fileSegments.get(f.name) ?? [];
    for (const { name: owner, body } of segments) {
      const instances = extractInstances(body, knownNames);
      const list = childrenOf.get(owner) ?? [];
      for (const inst of instances) {
        if (inst.type === owner) continue;
        list.push(inst);
        instantiatedTypes.add(inst.type);
      }
      childrenOf.set(owner, list);
    }
  }

  const roots = knownNames.filter((m) => !instantiatedTypes.has(m));

  function buildNode(moduleName, instanceName, ancestry) {
    const node = {
      module: moduleName,
      file: moduleToFile.get(moduleName) ?? null,
      instanceName: instanceName ?? null,
      children: [],
    };
    if (ancestry.has(moduleName)) {
      node.cyclic = true;
      return node;
    }
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(moduleName);
    const kids = childrenOf.get(moduleName) ?? [];
    node.children = kids.map((k) => buildNode(k.type, k.instanceName, nextAncestry));
    return node;
  }

  return roots.map((r) => buildNode(r, null, new Set()));
}
