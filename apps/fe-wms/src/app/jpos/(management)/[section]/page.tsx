import { notFound } from "next/navigation";

import { JposManagementSection } from "@/components/pos-management/JposManagementSection";
import { jposSections } from "@/components/pos-management/jposSections";

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const entry = jposSections.find((item) => item.id === section);
  if (!entry) notFound();
  return <JposManagementSection section={entry.id} />;
}
