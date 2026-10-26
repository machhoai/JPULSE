"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useEffect, useState } from "react";

export type ProductImageItem = { id: string } & (
  | { url: string; file?: never }
  | { file: File; url?: never }
);

function SortableImage({
  item,
  index,
  disabled,
  onRemove,
}: {
  item: ProductImageItem;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!item.file) return;
    const url = URL.createObjectURL(item.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] ${isDragging ? "opacity-60" : ""}`}
    >
      <img
        src={item.url ?? (preview || undefined)}
        alt={`Ảnh sản phẩm ${index + 1}`}
        draggable={false}
        className="h-full w-full object-cover"
      />
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Di chuyển ảnh ${index + 1}`}
        className="absolute left-0 top-0 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-br-lg bg-black/60 text-white active:cursor-grabbing disabled:opacity-50"
      >
        <GripVertical size={18} />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Xóa ảnh ${index + 1}`}
        className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-bl-lg bg-[var(--color-accent-error)] text-white disabled:opacity-50"
      >
        <X size={14} />
      </button>
      {index === 0 && (
        <span className="absolute bottom-0 inset-x-0 bg-[var(--color-brand-primary)] py-1 text-center text-xs text-white">
          Ảnh chính
        </span>
      )}
    </div>
  );
}

export function ProductImageSorter({
  items,
  onChange,
  disabled = false,
}: {
  items: ProductImageItem[];
  onChange: (items: ProductImageItem[]) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (disabled || !over || active.id === over.id) return;
        const from = items.findIndex((item) => item.id === active.id);
        const to = items.findIndex((item) => item.id === over.id);
        if (from >= 0 && to >= 0) onChange(arrayMove(items, from, to));
      }}
    >
      <SortableContext items={items} strategy={rectSortingStrategy}>
        {items.map((item, index) => (
          <SortableImage
            key={item.id}
            item={item}
            index={index}
            disabled={disabled}
            onRemove={() =>
              onChange(items.filter((image) => image.id !== item.id))
            }
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
