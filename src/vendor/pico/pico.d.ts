export interface PicoImage { pixels: Uint8Array; nrows: number; ncols: number; ldim: number }
export interface PicoParams { shiftfactor: number; minsize: number; maxsize: number; scalefactor: number }
export type PicoClassifier = (r: number, c: number, s: number, pixels: Uint8Array, ldim: number) => number;
export const pico: {
  unpack_cascade(bytes: Int8Array): PicoClassifier;
  run_cascade(image: PicoImage, classify: PicoClassifier, params: PicoParams): number[][];
  cluster_detections(dets: number[][], iouthreshold: number): number[][];
};
