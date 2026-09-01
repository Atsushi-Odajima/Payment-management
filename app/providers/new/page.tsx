import { ProviderCatalogView } from "@/components/views/provider-catalog-view";

export default function NewProviderPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  return <ProviderCatalogView selectedCategory={searchParams?.category} />;
}
