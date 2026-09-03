import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /docs/api → the first chapter. */
export default function ApiDocsIndex() {
  redirect("/docs/api/intro");
}
