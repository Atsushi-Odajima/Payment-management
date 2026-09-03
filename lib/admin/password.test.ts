import { describe, expect, it } from "vitest";
import { generateInitialPassword, hashPassword, verifyPassword } from "./password";

describe("scrypt passwords", () => {
  it("hashes with a random salt and verifies", () => {
    const a = hashPassword("atusi0130");
    const b = hashPassword("atusi0130");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(verifyPassword("atusi0130", a)).toBe(true);
    expect(verifyPassword("atusi0131", a)).toBe(false);
    expect(verifyPassword("", a)).toBe(false);
  });

  it("rejects malformed stored values", () => {
    expect(verifyPassword("x", "plain")).toBe(false);
    expect(verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
  });

  it("generates unambiguous initial passwords", () => {
    for (let i = 0; i < 20; i++) {
      const p = generateInitialPassword();
      expect(p).toHaveLength(12);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});
