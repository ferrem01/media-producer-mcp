/**
 * STOCK LOCATIONS: nine ready-made places every workspace starts with (Marc,
 * Oct 7: "maybe we generated like 9 stock backgrounds or let them generate
 * one via prompt ... I want them to see the custom one and select it"). Each
 * is a clean plate drawn once by the same prompt a tenant's own location is
 * (core/locations.ts platePrompt) and committed in src/locations-stock;
 * choosing one in Studio copies it into the tenant's library
 * (addStockLocation), so a scene names it like any other location.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StockLocation { id: string; name: string; prompt: string }

export const STOCK_LOCATIONS: StockLocation[] = [
  { id: "bright-office", name: "Bright office", prompt: "A bright modern open-plan office with light wooden desks, green plants and big windows with a city view" },
  { id: "home-office", name: "Home office", prompt: "A cosy home office: a wooden desk by a window, bookshelves, a plant and warm afternoon light" },
  { id: "living-room", name: "Living room", prompt: "A bright, lived-in living room with a grey linen couch, cushions, plants and tall windows" },
  { id: "kitchen", name: "Kitchen", prompt: "A modern home kitchen with a white marble island, pendant lights and soft morning light" },
  { id: "podcast-studio", name: "Podcast studio", prompt: "A small podcast studio: a desk with a broadcast microphone on an arm, acoustic wall panels and warm lamps" },
  { id: "cafe", name: "Café", prompt: "A quiet café corner with a small wooden table, exposed brick and soft daylight from a window" },
  { id: "meeting-room", name: "Meeting room", prompt: "A glass-walled meeting room with a long light table, chairs and a screen on the wall" },
  { id: "park", name: "Park", prompt: "A wooden park bench under trees in soft daylight, a path and greenery behind it" },
  { id: "studio", name: "Plain studio", prompt: "A clean photo studio with a seamless warm grey backdrop and a soft key light" },
];

export function getStockLocation(id: unknown): StockLocation | undefined {
  return STOCK_LOCATIONS.find((s) => s.id === id);
}

/** The committed plate: src/locations-stock next to src/core (dist/locations-stock after the build). */
export function stockLocationFile(id: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "locations-stock", `${id}.jpg`);
}
