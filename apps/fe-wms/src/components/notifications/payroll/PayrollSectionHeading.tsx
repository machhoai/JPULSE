import type { LucideIcon } from "lucide-react";

interface PayrollSectionHeadingProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function PayrollSectionHeading({ icon: Icon, title, description }: PayrollSectionHeadingProps) {
  return <div className="flex items-center gap-3">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary-muted text-brand-primary"><Icon size={16} aria-hidden="true" /></span>
    <div className="min-w-0">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
    </div>
  </div>;
}
