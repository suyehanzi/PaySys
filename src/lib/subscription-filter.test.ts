import { describe, expect, it } from "vitest";
import { filterSubscriptionContent } from "@/lib/subscription-filter";

describe("subscription content filter", () => {
  it("removes blocked proxy nodes and proxy group references from clash yaml", () => {
    const content = [
      "mixed-port: 7890",
      "proxies:",
      "  - name: 自动选择",
      "    type: url-test",
      "    server: auto.example.com",
      "  - name: 'TG群: lilisi_network'",
      "    type: ss",
      "    server: tg.example.com",
      "  - {name: \"官址：home.lilisi.cc\", type: ss, server: home.example.com}",
      "  - { name: TG群：lilisi_network, type: ss, server: tg-inline.example.com }",
      "  - name: 高级 | 香港 01",
      "    type: ss",
      "    server: hk.example.com",
      "proxy-groups:",
      "  - name: Selector",
      "    type: select",
      "    proxies:",
      "      - 自动选择",
      "      - 'TG群: lilisi_network'",
      "      - \"官址：home.lilisi.cc\"",
      "      - 高级 | 香港 01",
      "  - name: Fallback",
      "    type: fallback",
      "    proxies: [自动选择, 'TG群: lilisi_network', \"官址：home.lilisi.cc\", 高级 | 香港 01]",
      "  - { name: LILISI, type: select, proxies: [自动选择, 故障转移, 官址：home.lilisi.cc, TG群：lilisi_network, 高级 | 香港 01] }",
      "rules:",
      "  - MATCH,Selector",
      "",
    ].join("\n");

    const filtered = filterSubscriptionContent(content);

    expect(filtered).not.toContain("TG群: lilisi_network");
    expect(filtered).not.toContain("TG群：lilisi_network");
    expect(filtered).not.toContain("官址: home.lilisi.cc");
    expect(filtered).not.toContain("官址：home.lilisi.cc");
    expect(filtered).toContain("name: 自动选择");
    expect(filtered).toContain("name: 高级 | 香港 01");
    expect(filtered).toContain("      - 高级 | 香港 01");
    expect(filtered).toContain("proxies: [自动选择, 高级 | 香港 01]");
    expect(filtered).toContain("proxies: [自动选择, 故障转移, 高级 | 香港 01]");
  });

  it("keeps unrelated subscription content unchanged", () => {
    const content = "ss://example#高级 | 美国 01\n";

    expect(filterSubscriptionContent(content)).toBe(content);
  });
});
