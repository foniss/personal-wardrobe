"use client";

// Reusable character customization controls. Pure UI — the parent owns
// state and persistence, this component just reflects and edits values.

import { useState } from "react";
import clsx from "clsx";
import {
  BEARD_STYLES,
  BUILDS,
  GENDERS,
  HAIRSTYLES,
  HAIR_COLORS,
  HEIGHT_RANGE,
  SKIN_TONES,
  WEIGHT_RANGE,
  type CharacterParams,
} from "@/avatar/params";

function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {children}
      </span>
      {hint && (
        <span className="font-mono text-[10px] text-ink/40">{hint}</span>
      )}
    </div>
  );
}

function Pills({
  options,
  value,
  onSelect,
}: {
  options: ReadonlyArray<{ id: string; label: string }>;
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          className={clsx(
            "rounded-full border px-4 py-1.5 text-xs transition-colors",
            value === o.id
              ? "border-ink bg-ink text-bone"
              : "border-line bg-paper hover:border-ink/50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({
  options,
  value,
  onSelect,
}: {
  options: ReadonlyArray<{ hex: string; label: string }>;
  value: string;
  onSelect: (hex: string) => void;
}) {
  const active = options.find(
    (o) => o.hex.toLowerCase() === value.toLowerCase(),
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button
            key={o.hex}
            type="button"
            title={o.label}
            aria-label={o.label}
            onClick={() => onSelect(o.hex)}
            className={clsx(
              "h-9 w-9 rounded-full border border-line transition-transform duration-200 hover:scale-110",
              active?.hex === o.hex &&
                "ring-2 ring-flame ring-offset-2 ring-offset-bone",
            )}
            style={{ background: o.hex }}
          />
        ))}
      </div>
      {active && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          {active.label}
        </p>
      )}
    </div>
  );
}

export function CharacterControls({
  value,
  onChange,
}: {
  value: CharacterParams;
  onChange: (next: CharacterParams) => void;
}) {
  const set = <K extends keyof CharacterParams>(key: K, v: CharacterParams[K]) =>
    onChange({ ...value, [key]: v });

  const [weightDraft, setWeightDraft] = useState<string | null>(null);

  const feet = Math.floor(value.heightCm / 30.48);
  const inches = Math.round(value.heightCm / 2.54 - feet * 12);
  const activeSkin = SKIN_TONES.find((t) => t.id === value.skinTone);

  return (
    <div className="space-y-8">
      {/* frame */}
      <section>
        <SectionLabel>Gender</SectionLabel>
        <Pills
          options={GENDERS}
          value={value.gender}
          onSelect={(g) =>
            onChange({
              ...value,
              gender: g as CharacterParams["gender"],
              beardStyle: g === "female" ? "none" : value.beardStyle,
            })
          }
        />
      </section>

      <section>
        <SectionLabel hint="proportions only — no judgment">Build</SectionLabel>
        <Pills
          options={BUILDS}
          value={value.build}
          onSelect={(b) => set("build", b as CharacterParams["build"])}
        />
      </section>

      <section>
        <SectionLabel hint={`${feet}′${inches}″`}>Height</SectionLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={HEIGHT_RANGE.min}
            max={HEIGHT_RANGE.max}
            value={value.heightCm}
            onChange={(e) => set("heightCm", Number(e.target.value))}
            className="w-full accent-flame"
            aria-label="Height in centimetres"
          />
          <span className="w-16 shrink-0 text-right font-mono text-sm">
            {value.heightCm} cm
          </span>
        </div>
      </section>

      <section>
        <SectionLabel hint="optional — gently nudges proportions">
          Weight
        </SectionLabel>
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={WEIGHT_RANGE.min}
            max={WEIGHT_RANGE.max}
            placeholder="—"
            value={weightDraft ?? (value.weightKg?.toString() ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              setWeightDraft(raw);
              if (raw === "") {
                set("weightKg", null);
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n) && n >= WEIGHT_RANGE.min && n <= WEIGHT_RANGE.max) {
                set("weightKg", Math.round(n));
              }
            }}
            onBlur={() => setWeightDraft(null)}
            className="w-28 border border-line bg-paper px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/35 focus:border-flame"
          />
          <span className="font-mono text-[11px] text-ink-soft">kg</span>
        </div>
      </section>

      {/* surface */}
      <section>
        <SectionLabel hint={activeSkin?.label}>Skin tone</SectionLabel>
        <div className="flex flex-wrap gap-2.5">
          {SKIN_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={t.label}
              onClick={() => set("skinTone", t.id)}
              className={clsx(
                "h-9 w-9 rounded-full border border-line transition-transform duration-200 hover:scale-110",
                value.skinTone === t.id &&
                  "ring-2 ring-flame ring-offset-2 ring-offset-bone",
              )}
              style={{ background: t.hex }}
            />
          ))}
        </div>
      </section>

      {/* hair */}
      <section>
        <SectionLabel>Hairstyle</SectionLabel>
        <Pills
          options={HAIRSTYLES}
          value={value.hairstyle}
          onSelect={(s) => set("hairstyle", s)}
        />
      </section>

      <section>
        <SectionLabel>Hair colour</SectionLabel>
        <Swatches
          options={HAIR_COLORS}
          value={value.hairColor}
          onSelect={(hex) => set("hairColor", hex)}
        />
      </section>

      {/* face */}
      {value.gender === "male" && (
        <section>
          <SectionLabel>Facial hair</SectionLabel>
          <Pills
            options={BEARD_STYLES}
            value={value.beardStyle}
            onSelect={(b) => set("beardStyle", b)}
          />
        </section>
      )}

      <section>
        <SectionLabel>Glasses</SectionLabel>
        <button
          type="button"
          role="switch"
          aria-checked={value.glasses}
          onClick={() => set("glasses", !value.glasses)}
          className={clsx(
            "relative h-7 w-13 rounded-full border transition-colors",
            value.glasses ? "border-flame bg-flame" : "border-line bg-paper",
          )}
          style={{ width: 52 }}
        >
          <span
            className={clsx(
              "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all",
              value.glasses ? "left-[26px] bg-bone" : "left-1 bg-ink/25",
            )}
          />
        </button>
      </section>
    </div>
  );
}
