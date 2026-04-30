import { describe, expect, it } from "vitest";
import { parseFormLeadHtml } from "@/lib/leads/parseFormBody";

describe("parseFormLeadHtml", () => {
  it("parses labeled plain-style HTML", () => {
    const html = `<html><body>
      Name: Jane Doe<br/>
      Email: jane@example.com<br/>
      Phone: +1 555-0100<br/>
      Message: Need pricing for two cells.
    </body></html>`;
    const r = parseFormLeadHtml(html);
    expect(r).not.toBeNull();
    expect(r!.name).toContain("Jane");
    expect(r!.email).toBe("jane@example.com");
    expect(r!.phone).toContain("555");
    expect(r!.message).toMatch(/pricing/i);
  });

  it("parses table cells", () => {
    const html = `<table>
      <tr><td>Name</td><td>Acme Corp</td></tr>
      <tr><td>Email</td><td>buyer@acme.com</td></tr>
      <tr><td>Message</td><td>Factory expansion question</td></tr>
    </table>`;
    const r = parseFormLeadHtml(html);
    expect(r?.email).toBe("buyer@acme.com");
    expect(r?.name).toContain("Acme");
  });

  it("returns null without email", () => {
    expect(parseFormLeadHtml("<p>Name only</p>")).toBeNull();
  });
});
