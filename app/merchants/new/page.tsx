import { prisma } from "@/lib/db";
import { MerchantNewView } from "@/components/views/merchant-new-view";
import { nextMerchantCode } from "@/lib/merchants/ids";

export const dynamic = "force-dynamic";

export default async function NewMerchantPage() {
  // Provisional: the definitive code is assigned inside the create transaction.
  const nextCode = await nextMerchantCode(prisma);
  return <MerchantNewView nextCode={nextCode} />;
}
