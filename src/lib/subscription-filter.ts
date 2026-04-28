const blockedProxyNames = new Set(["TG群:lilisi_network", "官址:home.lilisi.cc"]);

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeReference(value: string): string {
  return unquoteYamlScalar(value.trim().replace(/,$/, ""))
    .replace(/：/g, ":")
    .replace(/\s*:\s*/g, ":");
}

function isBlockedProxyName(value: string): boolean {
  return blockedProxyNames.has(normalizeReference(value));
}

function proxyNameFromBlock(block: string[]): string {
  const firstLineName = block[0]?.match(/^\s*-\s*name\s*:\s*(.+)$/);
  if (firstLineName) {
    return unquoteYamlScalar(firstLineName[1]);
  }

  const inlineName = block[0]?.match(/^\s*-\s*\{.*?\bname\s*:\s*([^,}]+).*}$/);
  if (inlineName) {
    return unquoteYamlScalar(inlineName[1]);
  }

  for (const line of block.slice(1)) {
    const match = line.match(/^\s+name\s*:\s*(.+)$/);
    if (match) {
      return unquoteYamlScalar(match[1]);
    }
  }

  return "";
}

function topLevelSection(line: string): string | null {
  const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(?:#.*)?)?$/);
  return match?.[1] || null;
}

function removeBlockedProxyBlocks(lines: string[]): string[] {
  const nextLines: string[] = [];
  let section = "";

  for (let index = 0; index < lines.length;) {
    const nextSection = topLevelSection(lines[index]);
    if (nextSection) {
      section = nextSection;
    }

    if (section === "proxies" && /^\s*-\s+/.test(lines[index])) {
      const itemIndent = lines[index].match(/^(\s*)-/)?.[1].length ?? 0;
      const block: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const sectionAtCursor = cursor === index ? null : topLevelSection(lines[cursor]);
        const itemAtCursor = lines[cursor].match(/^(\s*)-\s+/);
        if (sectionAtCursor || (cursor > index && itemAtCursor && itemAtCursor[1].length <= itemIndent)) {
          break;
        }
        block.push(lines[cursor]);
        cursor += 1;
      }

      if (!isBlockedProxyName(proxyNameFromBlock(block))) {
        nextLines.push(...block);
      }
      index = cursor;
      continue;
    }

    nextLines.push(lines[index]);
    index += 1;
  }

  return nextLines;
}

function splitInlineArray(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote = "";

  for (const char of value) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (char === quote) {
      quote = "";
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function removeBlockedInlineReferences(line: string): string {
  return line.replace(/(proxies\s*:\s*)\[([^\]]*)]/g, (_match, prefix: string, value: string) => {
    const items = splitInlineArray(value).filter((item) => !isBlockedProxyName(item));
    return `${prefix}[${items.join(", ")}]`;
  });
}

function removeBlockedGroupReferences(lines: string[]): string[] {
  const nextLines: string[] = [];
  let section = "";

  for (const line of lines) {
    const nextSection = topLevelSection(line);
    if (nextSection) {
      section = nextSection;
    }

    if (section === "proxy-groups") {
      const reference = line.match(/^(\s*)-\s+(.+)$/);
      if (reference && isBlockedProxyName(reference[2])) {
        continue;
      }
      nextLines.push(removeBlockedInlineReferences(line));
      continue;
    }

    nextLines.push(line);
  }

  return nextLines;
}

export function filterSubscriptionContent(content: string): string {
  if (!content.includes("lilisi_network") && !content.includes("home.lilisi.cc")) {
    return content;
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = content.endsWith("\n");
  const lines = content.split(/\r?\n/);
  const withoutBlockedProxies = removeBlockedProxyBlocks(lines);
  const withoutBlockedReferences = removeBlockedGroupReferences(withoutBlockedProxies);
  const filtered = withoutBlockedReferences.join(newline);
  return hadTrailingNewline && !filtered.endsWith(newline) ? `${filtered}${newline}` : filtered;
}
