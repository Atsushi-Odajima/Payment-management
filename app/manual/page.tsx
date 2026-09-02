import { redirect } from "next/navigation";
import { MANUAL_CHAPTERS } from "@/lib/manual/chapters";

export default function ManualIndexPage() {
  redirect(`/manual/${MANUAL_CHAPTERS[0]}`);
}
