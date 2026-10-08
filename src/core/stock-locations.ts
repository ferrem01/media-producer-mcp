/**
 * STOCK LOCATIONS: ready-made places every workspace starts with (Marc,
 * Oct 7: "maybe we generated like 9 stock backgrounds ..."). Each is a REAL
 * PHOTOGRAPH of a real room (Pexels, free to use; the credit is kept below),
 * committed in src/locations-stock: a drawn room was what read as AI first
 * (Marc, Oct 8: "honestly, if anything, the background is what looks the most
 * AI created"), and his own living-room photo made the CEO sit-down hold up.
 * Choosing one in Studio copies it into the tenant's library
 * (addStockLocation), so a scene names it like any other location.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StockLocation {
  id: string; name: string;
  /** What is in the photo (the location's prompt once copied; the shot reads it). */
  prompt: string;
  /** The photographer and the photo's page. */
  credit: { by: string; url: string };
}

/** Bumped when the committed photos change: a library copy made from an
 *  older set is refreshed in place (core/locations.ts refreshStockLocations).
 *  1 = the drawn plates (Oct 7), 2 = real photos (Oct 8). */
export const STOCK_REV = 2;

export const STOCK_LOCATIONS: StockLocation[] = [
  { id: "living-room", name: "Living room", prompt: "A warm lived-in living room: a cream sofa with cushions, a soft rug, a dining table behind, framed pictures and a glass door to a balcony with a city view", credit: { by: "Vidal Balielo Jr.", url: "https://www.pexels.com/photo/photo-of-living-room-and-dining-area-11296142/" } },
  { id: "home-office", name: "Home office", prompt: "A home office: a black glass desk with a desk lamp and an office chair, built-in shelves with books and objects, a window with blinds", credit: { by: "Pixabay", url: "https://www.pexels.com/photo/black-study-lamp-on-black-table-159839/" } },
  { id: "bright-office", name: "Bright office", prompt: "A bright office lounge: two leather lounge chairs and a small side table by a floor-to-ceiling window over trees and the city", credit: { by: "Rufina Rusakova", url: "https://www.pexels.com/photo/modern-lounge-area-with-large-glass-window-view-32456658/" } },
  { id: "executive-office", name: "Executive office", prompt: "A high-floor executive meeting room: a dark table with white chairs, a plant, and floor-to-ceiling windows over the city", credit: { by: "Tima Miroshnichenko", url: "https://www.pexels.com/photo/green-potted-plant-on-the-table-5717314/" } },
  { id: "dark-studio", name: "Dark study", prompt: "A dim, moody study: a wooden desk with a laptop and two white shell chairs, warm light from one side, the corners falling to dark", credit: { by: "ready made", url: "https://www.pexels.com/photo/brown-wooden-table-with-white-chairs-3847582/" } },
  { id: "kitchen", name: "Kitchen", prompt: "A bright white kitchen with a marble island, black bar stools, pendant lights and stainless appliances", credit: { by: "Curtis Adams", url: "https://www.pexels.com/photo/modern-kitchen-design-15409513/" } },
  { id: "podcast-studio", name: "Podcast studio", prompt: "A small podcast room in blue evening light: a table with four microphones on stands, chairs, a window behind", credit: { by: "Reza Tavakoli", url: "https://www.pexels.com/photo/podcast-studio-setup-with-microphones-32007691/" } },
  { id: "cafe", name: "Café", prompt: "A cosy café corner: a small round table with two bentwood chairs, wood panelling, shelves stacked with books, patterned tiles", credit: { by: "Emre Can Acer", url: "https://www.pexels.com/photo/coffee-table-beside-shelves-of-books-2079452/" } },
  { id: "meeting-room", name: "Meeting room", prompt: "A modern meeting room: a long table with green chairs, a screen on a sage wall, pendant lights and a patterned rug", credit: { by: "Mike van Schoonderwalt", url: "https://www.pexels.com/photo/modern-conference-room-in-an-office-5511295/" } },
  { id: "studio", name: "Loft studio", prompt: "A bright, empty loft photo studio: a big arched window, warm wooden floor, a dark backdrop to one side and a light on a stand", credit: { by: "Max Vakhtbovych", url: "https://www.pexels.com/photo/large-window-in-a-bright-studio-8143699/" } },
  { id: "park", name: "Park", prompt: "A sunny park: a wooden bench on a path under big trees, a green lawn behind", credit: { by: "Ayşenaz Bilgin", url: "https://www.pexels.com/photo/bench-in-the-park-18221583/" } },
];

export function getStockLocation(id: unknown): StockLocation | undefined {
  return STOCK_LOCATIONS.find((s) => s.id === id);
}

/** The committed plate: src/locations-stock next to src/core (dist/locations-stock after the build). */
export function stockLocationFile(id: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "locations-stock", `${id}.jpg`);
}
