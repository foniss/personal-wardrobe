// Public surface of the avatar module. Future extensions (poses,
// more hairstyles, weather layers…) should plug in here.
export { Avatar, type AvatarProps } from "./avatar";
export {
  DEFAULT_CHARACTER,
  GENDERS,
  BUILDS,
  SKIN_TONES,
  HAIRSTYLES,
  HAIR_COLORS,
  BEARD_STYLES,
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  skinToneHex,
  validateCharacter,
  type CharacterParams,
  type Gender,
  type Build,
} from "./params";
export { garmentSpecFromItem, type GarmentSpec } from "./spec";
export { figureGeometry, type FigureGeometry } from "./geometry";
