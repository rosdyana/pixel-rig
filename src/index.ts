// pixel-rig: procedural, animated pixel-art characters from a pose rig.
export * from "./color";
export * from "./raster";
export * from "./look";
export { M, BODY_SLOTS, bodyMaterials, skinRamp, flat } from "./palette";
export * from "./pose";
export {
  DEFAULT_FRAME,
  PART,
  add,
  dir,
  renderAnim,
  renderAnims,
  renderPose,
  type Frame,
  type FrameSpec,
  type RenderOptions,
} from "./character";
export * from "./items";
export * from "./props";
export * from "./canvas";
