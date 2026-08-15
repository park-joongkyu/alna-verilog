const KEYWORDS = [
  "module", "endmodule", "input", "output", "inout", "wire", "reg", "logic",
  "parameter", "localparam", "always", "always_ff", "always_comb", "always_latch",
  "assign", "initial", "begin", "end", "if", "else", "case", "casex", "casez",
  "endcase", "default", "for", "while", "repeat", "forever", "function",
  "endfunction", "task", "endtask", "posedge", "negedge", "or", "and", "not",
  "xor", "nand", "nor", "xnor", "buf", "generate", "endgenerate", "genvar",
  "integer", "real", "time", "signed", "unsigned", "typedef", "struct", "enum",
  "interface", "endinterface", "package", "endpackage", "import", "export",
  "timescale", "define", "ifdef", "ifndef", "endif", "include",
];

export const VERILOG_LANGUAGE_ID = "verilog";
export const EDITOR_THEME_ID = "verilog-slate";

function defineEditorTheme(monaco) {
  monaco.editor.defineTheme(EDITOR_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.lineHighlightBackground": "#F2F4F7",
      "editorGutter.background": "#FFFFFF",
      "editorLineNumber.foreground": "#B7BEC9",
      "editorLineNumber.activeForeground": "#6B7280",
      "editor.selectionBackground": "#DEEBFB",
      "editorCursor.foreground": "#2D313B",
      "editorWidget.background": "#FFFFFF",
      "editorWidget.border": "#DFE3E9",
    },
  });
}

export function registerVerilogLanguage(monaco) {
  defineEditorTheme(monaco);
  if (monaco.languages.getEncodedLanguageId?.(VERILOG_LANGUAGE_ID)) return;
  const already = monaco.languages.getLanguages().some((l) => l.id === VERILOG_LANGUAGE_ID);
  if (already) return;

  monaco.languages.register({ id: VERILOG_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(VERILOG_LANGUAGE_ID, {
    keywords: KEYWORDS,
    tokenizer: {
      root: [
        [/`\w+/, "keyword.directive"],
        [/\$\w+/, "predefined"],
        [/[A-Za-z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/\d+'[bBoOdDhH][0-9a-fA-Fxz_XZ]+/, "number"],
        [/\d+/, "number"],
        [/".*?"/, "string"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/[{}()\[\]]/, "@brackets"],
        [/[<>=!+\-*/%&|^~]+/, "operator"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(VERILOG_LANGUAGE_ID, {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
}
