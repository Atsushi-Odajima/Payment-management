import { describe, expect, it, vi } from "vitest";
import {
  buildCredentialStore,
  mergeCredentialStore,
  readCredentialsForDisplay,
  readCredentialsForUse,
} from "./credentials";

const OTHER_KEY = "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=";

describe("credential store", () => {
  it("encrypts only secret fields and skips empty values", () => {
    const store = buildCredentialStore("stripe", {
      publishable_key: "pk_test_1",
      secret_key: "sk_test_1",
      webhook_secret: "",
    });
    expect(store.publishable_key).toBe("pk_test_1");
    expect(store.secret_key).not.toBe("sk_test_1");
    expect(store.secret_key.split(":")).toHaveLength(3);
    expect(store).not.toHaveProperty("webhook_secret");
  });

  it("never exposes plaintext secrets in the display view", () => {
    const json = JSON.stringify(
      buildCredentialStore("stripe", { publishable_key: "pk_test_1", secret_key: "sk_test_abcd1234" }),
    );
    const view = readCredentialsForDisplay("stripe", json);
    expect(JSON.stringify(view)).not.toContain("sk_test_abcd1234");
    expect(view.fields.secret_key).toEqual({ value: "••••••••1234", masked: true });
    expect(view.fields.publishable_key).toEqual({ value: "pk_test_1", masked: false });
    expect(view.fields.webhook_secret).toEqual({ value: "", masked: false });
  });

  it("decrypts for use", () => {
    const json = JSON.stringify(buildCredentialStore("stripe", { publishable_key: "pk", secret_key: "sk" }));
    expect(readCredentialsForUse("stripe", json)).toEqual({ publishable_key: "pk", secret_key: "sk" });
  });

  it("merge keeps a secret on empty input and removes a non-secret on empty input", () => {
    const existing = buildCredentialStore("stripe", {
      publishable_key: "pk_old",
      secret_key: "sk_old",
      statement_descriptor: "OLD",
    });
    const merged = mergeCredentialStore("stripe", JSON.stringify(existing), {
      secret_key: "",
      statement_descriptor: "",
      publishable_key: "pk_new",
    });
    expect(merged.secret_key).toBe(existing.secret_key); // unchanged ciphertext
    expect(merged).not.toHaveProperty("statement_descriptor");
    expect(merged.publishable_key).toBe("pk_new");
  });

  it("merge re-encrypts a secret when a new value is given", () => {
    const existing = buildCredentialStore("stripe", { publishable_key: "pk", secret_key: "sk_old" });
    const merged = mergeCredentialStore("stripe", JSON.stringify(existing), { secret_key: "sk_new" });
    expect(merged.secret_key).not.toBe(existing.secret_key);
    expect(readCredentialsForUse("stripe", JSON.stringify(merged)).secret_key).toBe("sk_new");
  });

  it("flags undecryptable secrets instead of throwing on display", () => {
    const json = JSON.stringify(buildCredentialStore("stripe", { publishable_key: "pk", secret_key: "sk" }));
    vi.stubEnv("ENCRYPTION_KEY", OTHER_KEY);
    const view = readCredentialsForDisplay("stripe", json);
    expect(view.fields.secret_key).toEqual({ value: "", masked: true, undecryptable: true });
    expect(() => readCredentialsForUse("stripe", json)).toThrow();
  });
});
