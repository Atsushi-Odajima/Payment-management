import { PaymentMethodControlsView } from "@/components/views/payment-method-controls-view";
import { prisma } from "@/lib/db";
import { loadGlobalControls } from "@/lib/payments/method-controls";

export const dynamic = "force-dynamic";

export default async function PaymentMethodControlsPage() {
  const controls = await loadGlobalControls(prisma);
  return <PaymentMethodControlsView controls={controls} />;
}
