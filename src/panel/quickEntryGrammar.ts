// BUILD_SPEC S4 pinned parse grammar (Pinned interfaces — implemented
// exactly, do not invent variants): a tag token matches
//   (?<=^|\s)([@#])([\p{L}\p{N}_-]+)(?=\s|$)
// — whitespace-delimited, anywhere in the string; letters (accented
// included), digits, hyphen, underscore; no multi-word tags. First `@`
// token -> client, first `#` token -> project; matched tokens are removed
// from the name; any later `@`/`#` tokens stay literal in the name.
// Remainder trimmed -> name; empty remainder -> null name.

export interface ParsedQuickEntry {
  name: string | null;
  client: string | null;
  project: string | null;
}

const TOKEN_RE = /(?<=^|\s)([@#])([\p{L}\p{N}_-]+)(?=\s|$)/gu;

export function parseQuickEntry(input: string): ParsedQuickEntry {
  let client: string | null = null;
  let project: string | null = null;
  let clientClaimed = false;
  let projectClaimed = false;

  const remainder = input.replace(TOKEN_RE, (fullMatch, marker: string, value: string) => {
    if (marker === "@") {
      if (clientClaimed) return fullMatch; // later @ tokens stay literal
      client = value;
      clientClaimed = true;
      return "";
    }
    // marker === "#"
    if (projectClaimed) return fullMatch; // later # tokens stay literal
    project = value;
    projectClaimed = true;
    return "";
  });

  const name = remainder.replace(/\s+/g, " ").trim();
  return { name: name === "" ? null : name, client, project };
}
