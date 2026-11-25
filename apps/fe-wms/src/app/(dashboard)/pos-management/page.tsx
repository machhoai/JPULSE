import PosManagementPage from "@/components/pos-management/PosManagementPage";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PosManagementRoute() {
  if (process.env.JPOS_PUBLIC_DOMAIN_READY === "true") {
    redirect("https://jpos.joyworldcityfuns.vn/");
  }
  return <PosManagementPage />;
}
