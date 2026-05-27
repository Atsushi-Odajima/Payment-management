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
  label: string;
  type: FieldType;
  required?: boolean;
  // When true, the value is encrypted at rest and never returned in plaintext.
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
}

export interface ProviderDefinition {
  key: string;
  name: string;
  category: CategoryKey;
  logoColor: string;
  description: string;
  docsUrl?: string;
  // When true the provider supports both live and test (sandbox) modes
  // and the toggle is exposed in the connection form.
  supportsTestMode: boolean;
  fields: ProviderField[];
}

export interface Category {
  key: CategoryKey;
  label: string;
  icon: string;
  description: string;
}
