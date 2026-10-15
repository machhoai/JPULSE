"use client";
import { payrollFieldLabel, payrollOrderedFields, type PayrollBlock, type PayrollComposer } from "@bduck/shared-types";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import type { PayrollText } from "@/lib/i18n/payrollEmailTranslations";

function Field({ id, label, checked, disabled, toggle, text }: {
  id: string; label: string; checked: boolean; disabled: boolean; toggle: (checked: boolean) => void; text: PayrollText;
}) {
  const sortable = useSortable({ id, disabled });
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
    className={`flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-1.5 ${sortable.isDragging ? "relative z-10 shadow-lg" : ""}`}>
    <button type="button" disabled={disabled} {...sortable.attributes} {...sortable.listeners} aria-label={text.reorderField + ": " + label}
      className="flex size-8 shrink-0 touch-none items-center justify-center rounded-md text-text-muted hover:bg-surface-base focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50"><GripVertical size={14} aria-hidden="true" /></button>
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-text-secondary">
      <input disabled={disabled} className="size-4 shrink-0 accent-brand-primary" type="checkbox" checked={checked} onChange={event => toggle(event.target.checked)} />
      <span className="break-words">{label}</span>
    </label>
  </div>;
}

export default function PayrollSortableFields({ composer, block, change, lang, text, disabled }: {
  composer: PayrollComposer; block: PayrollBlock; change: (next: PayrollComposer) => void;
  lang: "vi" | "zh"; text: PayrollText; disabled: boolean;
}) {
  const fields = payrollOrderedFields(composer, block);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const label = (id: string | number) => payrollFieldLabel(composer, String(id), lang);
  return <DndContext sensors={sensors} collisionDetection={closestCenter}
    accessibility={{ screenReaderInstructions: { draggable: text.reorderHint }, announcements: {
      onDragStart: ({ active }) => text.fieldDragStart + ": " + label(active.id),
      onDragOver: ({ over }) => over ? text.reorderField + ": " + label(over.id) : undefined,
      onDragEnd: ({ active }) => text.fieldDragEnd + ": " + label(active.id),
      onDragCancel: () => text.fieldDragCancel,
    } }} onDragEnd={({ active, over }) => {
      if (disabled || !over || active.id === over.id) return;
      const from = fields.indexOf(String(active.id)), to = fields.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      const order = arrayMove(fields, from, to);
      change({ ...composer, field_order: { ...composer.field_order, [block]: order },
        fields: { ...composer.fields, [block]: order.filter(id => composer.fields[block].includes(id)) } });
    }}>
    <SortableContext items={fields} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">{fields.map(id => <Field key={id} id={id} label={label(id)} text={text} disabled={disabled} checked={composer.fields[block].includes(id)} toggle={checked => {
        change({ ...composer, fields: { ...composer.fields, [block]: checked ? fields.filter(field => field === id || composer.fields[block].includes(field)) : composer.fields[block].filter(field => field !== id) } });
      }} />)}</div>
    </SortableContext>
  </DndContext>;
}
