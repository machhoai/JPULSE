"use client";
import type {
  PosCashDrawerSettings,
  PosCashDrawerSettingsValue,
} from "@bduck/shared-types";
import { gooeyToast } from "goey-toast";
import { useRef, useState } from "react";

import { posManagementApi, type SafePosDevice } from "@/api/posManagementApi";
import { usePosCashDrawerSettings } from "@/hooks/usePosCashDrawerSettings";

import { usePosCashDrawerCopy } from "./usePosCashDrawerCopy";

const DEFAULT: PosCashDrawerSettingsValue = {
  auto_open_enabled: false,
  protocol: "ESCPOS",
  pin: 2,
};

function DeviceCashDrawerEditor({
  device,
  settings,
  canManage,
}: {
  device: SafePosDevice;
  settings: PosCashDrawerSettings | null;
  canManage: boolean;
}) {
  const copy = usePosCashDrawerCopy();
  const [draft, setDraft] = useState<{
    value: PosCashDrawerSettingsValue;
    version: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const form = draft?.value ?? settings ?? DEFAULT;
  const version = settings?.version ?? 0;
  const conflict = draft !== null && draft.version !== version;
  const update = (patch: Partial<PosCashDrawerSettingsValue>) =>
    setDraft((current) => ({
      value: { ...(current?.value ?? form), ...patch },
      version: current?.version ?? version,
    }));
  const save = async () => {
    if (!canManage || conflict || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const task = posManagementApi.saveCashDrawerSettings(device.id, {
      auto_open_enabled: form.auto_open_enabled,
      protocol: form.protocol,
      pin: form.pin,
      expected_version: draft?.version ?? version,
      action_time: new Date().toISOString(),
    }, copy.lang);
    gooeyToast.promise(task, {
      loading: copy.saving,
      success: copy.saved,
      error: copy.failed,
      description: {
        success: copy.success,
        error: (e: unknown) => (e instanceof Error ? e.message : copy.error),
      },
      action: {
        error: {
          label: copy.retry,
          onClick: () => {
            void save();
          },
        },
      },
    });
    try {
      await task;
      setDraft(null);
    } catch (error) {
      console.error("[cashDrawerSettings] save failed", error);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">
        {device.name} · v{version}
      </h3>
      {!settings && <p className="text-xs text-amber-700">{copy.unmanaged}</p>}
      <fieldset
        disabled={!canManage || saving}
        className="space-y-4 disabled:opacity-60"
      >
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.auto_open_enabled}
            onChange={(e) => update({ auto_open_enabled: e.target.checked })}
            className="size-4 accent-amber-600"
          />
          {copy.enabled}
        </label>
        <label className="block text-xs font-semibold">
          {copy.protocol}
          <select
            value={form.protocol}
            onChange={(e) =>
              update({
                protocol: e.target.value === "TSPL" ? "TSPL" : "ESCPOS",
                ...(e.target.value === "TSPL" ? { pin: 2 as const } : {}),
              })
            }
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:h-8"
          >
            <option value="ESCPOS">{copy.escpos}</option>
            <option value="TSPL">{copy.tspl}</option>
          </select>
        </label>
        <label className="block text-xs font-semibold">
          {copy.pin}
          <select
            value={form.pin}
            onChange={(e) => update({ pin: e.target.value === "5" ? 5 : 2 })}
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:h-8"
          >
            <option value="2">2</option>
            <option value="5" disabled={form.protocol === "TSPL"}>
              5 · ESC/POS
            </option>
          </select>
        </label>
      </fieldset>
      <p className="text-xs leading-5 text-slate-500">{copy.note}</p>
      {conflict && (
        <div
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
        >
          {copy.conflict}
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraft(null)}
            className="ml-2 font-bold underline"
          >
            {copy.useLatest}
          </button>
        </div>
      )}
      {canManage ? (
        <button
          type="button"
          disabled={saving || conflict || device.status !== "ACTIVE"}
          onClick={() => {
            void save();
          }}
          className="min-h-11 w-full rounded-lg bg-amber-500 px-4 text-sm font-bold text-white disabled:opacity-50 sm:min-h-8 sm:w-fit"
        >
          {saving ? copy.saving : copy.save}
        </button>
      ) : (
        <p className="text-xs text-slate-500">{copy.readOnly}</p>
      )}
    </div>
  );
}

export function PosCashDrawerSettingsPanel({
  warehouseId,
  devices,
  canManage,
}: {
  warehouseId: string;
  devices: SafePosDevice[];
  canManage: boolean;
}) {
  const copy = usePosCashDrawerCopy();
  const remote = usePosCashDrawerSettings(warehouseId);
  const [selected, setSelected] = useState("");
  const active = devices.filter(
    (d) =>
      d.warehouse_id === warehouseId && d.status === "ACTIVE" && !d.is_deleted,
  );
  const device = active.find((d) => d.id === selected) ?? active[0];
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{copy.title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{copy.hint}</p>
      </div>
      {remote.loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : remote.error ? (
        <p role="alert" className="text-sm text-red-700">
          {copy.loadError}
        </p>
      ) : device ? (
        <>
          <label className="block text-xs font-semibold">
            {copy.device}
            <select
              value={device.id}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:h-8"
            >
              {active.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <DeviceCashDrawerEditor
            key={device.id}
            device={device}
            canManage={canManage}
            settings={
              remote.settings.find((s) => s.device_id === device.id) ?? null
            }
          />
        </>
      ) : (
        <p className="text-sm text-slate-500">{copy.none}</p>
      )}
    </section>
  );
}
