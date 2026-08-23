// ------------------------------------------------------------------
// Avatar: composes figure + garment layers into one SVG character.
// Consumes wardrobe items (objects or their data) — it never talks
// to the matching engine. Memoized so option/item changes only
// repaint what actually changed.
//
//   Recommendation engine → item ids → <Avatar items> → rendered fit
// ------------------------------------------------------------------

import { memo, useMemo } from "react";
import type { WardrobeItem } from "@/lib/types";
import { figureGeometry, VIEW_H, VIEW_W } from "./geometry";
import {
  BackdropLayer,
  BaseLayer,
  BeardLayer,
  FaceLayer,
  GlassesLayer,
  HairLayer,
  SkinLayer,
} from "./figure";
import { GarmentSet } from "./garments";
import { garmentSpecFromItem } from "./spec";
import { skinToneHex, type CharacterParams } from "./params";

export interface AvatarProps {
  character: CharacterParams;
  /** pieces the character is wearing (anchor + slot items); any subset works */
  items?: WardrobeItem[];
  className?: string;
  title?: string;
}

const GroundShadow = memo(function GroundShadow({ y }: { y: number }) {
  return <ellipse cx={160} cy={y} rx={92} ry={11} fill="rgb(23 20 14 / 0.1)" />;
});

export const Avatar = memo(function Avatar({
  character,
  items = [],
  className,
  title,
}: AvatarProps) {
  const charKey = JSON.stringify(character);
  const itemsKey = items.map((i) => `${i.id}:${i.colorHex}`).join("|");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fig = useMemo(() => figureGeometry(character), [charKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const specs = useMemo(() => items.map(garmentSpecFromItem), [itemsKey]);

  const skin = skinToneHex(character.skinTone);
  const showBeard = character.gender === "male" && character.beardStyle !== "none";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={title ?? "Your character"}
      className={className}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <BackdropLayer />
      <GroundShadow y={fig.groundY} />
      <SkinLayer g={fig} skin={skin} />
      <BaseLayer g={fig} />
      <GarmentSet g={fig} specs={specs} zone="body" />
      <FaceLayer g={fig} />
      {showBeard && (
        <BeardLayer g={fig} style={character.beardStyle} color={character.hairColor} />
      )}
      <HairLayer g={fig} style={character.hairstyle} color={character.hairColor} />
      {character.glasses && <GlassesLayer g={fig} />}
      <GarmentSet g={fig} specs={specs} zone="head" />
    </svg>
  );
});
