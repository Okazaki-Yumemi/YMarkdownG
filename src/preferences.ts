export type Preferences = {
  theme: string;
  accent: string;
  image: string;
  backgroundTransparency: number;
  opacity: number;
  blur: number;
  font: string;
  fontSize: number;
  lineHeight: number;
  width: number;
  fullWidth: boolean;
  showHeader: boolean;
  showToolbar: boolean;
  showStatus: boolean;
  syncScroll: boolean;
  smoothCursor: boolean;
  cursorTrail: boolean;
  cursorDuration: number;
  typingFeedback: number;
};
export const defaults: Preferences = {
  theme: "one-dark-pro",
  accent: "#61afef",
  image: "",
  backgroundTransparency: 35,
  opacity: 95,
  blur: 0,
  font: "sans",
  fontSize: 17,
  lineHeight: 1.75,
  width: 960,
  fullWidth: false,
  showHeader: true,
  showToolbar: true,
  showStatus: true,
  syncScroll: true,
  smoothCursor: true,
  cursorTrail: true,
  cursorDuration: 120,
  typingFeedback: 45,
};
export function loadPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem("ymg-prefs") || "{}");
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [
        key,
        typeof raw[key] === typeof fallback ? raw[key] : fallback,
      ]),
    ) as Preferences;
  } catch {
    return { ...defaults };
  }
}
