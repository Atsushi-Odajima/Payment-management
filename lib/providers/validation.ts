import { z } from "zod";
import type { ProviderDefinition, ProviderField } from "./types";

const URL_RE = /^https?:\/\//i;
const MAX_LEN = 512;

/** Required fields that have no value in `store` (presence check only). */
export function missingRequiredFields(
  def: ProviderDefinition,
  store: Record<string, string | undefined>,
): ProviderField[] {
  return def.fields.filter((f) => f.required && !store[f.key]);
}

/**
 * Build a Zod schema for a provider's credential payload from its registry
 * definition, so the API validates exactly the fields the form renders.
 *
 * mode "create": required fields must be non-empty; formats are checked.
 * mode "patch":  every field optional; "" means "clear" (or "keep" for
 *                secrets — see mergeCredentialStore); formats are checked
 *                only on non-empty values.
 */
export function credentialSchemaFor(def: ProviderDefinition, mode: "create" | "patch") {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of def.fields) {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case "url":
        base = z
          .string()
          .max(MAX_LEN)
          .refine((v) => v === "" || URL_RE.test(v), { message: "url" });
        break;
      case "email":
        base = z
          .string()
          .max(MAX_LEN)
          .refine((v) => v === "" || z.string().email().safeParse(v).success, {
            message: "email",
          });
        break;
      case "select": {
        const values = (field.options ?? []).map((o) => o.value);
        base = z.string().refine((v) => v === "" || values.includes(v), {
          message: "option",
        });
        break;
      }
      case "textarea":
        base = z.string().max(4000);
        break;
      default:
        base = z.string().max(MAX_LEN);
    }
    if (mode === "create" && field.required) {
      base = base.and(z.string().min(1));
    }
    shape[field.key] = base.optional();
  }
  return z.object(shape).strict();
}
