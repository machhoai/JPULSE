import type { Metadata } from "next";
import type { ReactNode } from "react";

import { JposManagementLayout } from "@/components/pos-management/JposManagementLayout";

export const metadata: Metadata = {
  title: "JPOS",
  icons: { icon: "/logo/jpos.png" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <JposManagementLayout>{children}</JposManagementLayout>;
}
