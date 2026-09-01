import type { LocalizedText } from "@/lib/i18n";

export type CategoryKey = "credit" | "qr" | "convenience" | "bank" | "other";

export type FieldType =
  | "text"
  | "password"
  | "secret"
  | "url"
  | "email"
  | "select"
  | "textarea";

export interface ProviderField {
  key: string;
  label: LocalizedText;
  type: FieldType;
  required?: boolean;
  // When true, the value is encrypted at rest and never returned in plaintext.
  secret?: boolean;
  // Placeholders are mostly technical samples (API key shapes) shared by both
  // languages, so they stay plain strings.
  placeholder?: string;
  helpText?: LocalizedText;
  options?: { value: string; label: LocalizedText }[];
}

export interface ProviderDefinition {
  key: string;
  name: LocalizedText;
  category: CategoryKey;
  logoColor: string;
  description: LocalizedText;
  docsUrl?: string;
  // When true the provider supports both live and test (sandbox) modes
  // and the toggle is exposed in the connection form.
  supportsTestMode: boolean;
  fields: ProviderField[];
}

export interface Category {
  key: CategoryKey;
  label: LocalizedText;
  icon: string;
  description: LocalizedText;
}
