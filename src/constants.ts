/**
 * Application constants.
 */

export const ANIM_START_SEC = 18000; // 05:00 — timeline start
export const ANIM_END_SEC = 104400; // 05:00 next day (= 29 h from midnight) — timeline end
export const DEFAULT_START = 25200; // 07:00 — animation begins here

// Transit type display order
export const TYPE_ORDER = ["S-Bahn", "U-Bahn", "Bus", "Regional"];

export const BUS_TYPE_ORDER = [
  "MetroBus",
  "ExpressBus",
  "NightBus",
  "StandardBus",
];

export const BUS_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string; description: string }
> = {
  MetroBus: {
    label: "Metrobus",
    color: "38BDF8",
    icon: "F",
    description:
      "Frequent high-capacity HVV bus lines, shown as MetroBus in the feed.",
  },
  ExpressBus: {
    label: "Express",
    color: "C084FC",
    icon: "X",
    description:
      "Fast bus services with fewer stops, including XpressBus and SchnellBus routes.",
  },
  NightBus: {
    label: "Night",
    color: "F0ABFC",
    icon: "N",
    description: "Night bus routes, mainly 600-series HVV lines.",
  },
  StandardBus: {
    label: "Regular",
    color: "E2E8F0",
    icon: "R",
    description:
      "Regular bus routes that are not classified as frequent, express, or night services.",
  },
};

export const VEHICLE_TYPE_COLORS: Record<string, string> = {
  Regional: "FFD166",
  MetroBus: "38BDF8",
  ExpressBus: "C084FC",
  NightBus: "F0ABFC",
  StandardBus: "E2E8F0",
};

export const TRANSIT_CONFIG: Record<
  string,
  {
    color: string;
    opacity: number;
    radius: number;
    hex: string;
    stroke: string;
    rgb: [number, number, number];
  }
> = {
  "S-Bahn": {
    color: "#50c878",
    opacity: 0.35,
    radius: 0.7,
    hex: "#50c878",
    stroke: "rgba(80,200,120,",
    rgb: [0, 180, 80],
  },
  "U-Bahn": {
    color: "#E2001A",
    opacity: 0.45,
    radius: 0.9,
    hex: "#E2001A",
    stroke: "rgba(226,0,26,",
    rgb: [226, 0, 26],
  },
  Regional: {
    color: "#F39100",
    opacity: 0.3,
    radius: 0.5,
    hex: "#F39100",
    stroke: "rgba(243,145,0,",
    rgb: [243, 145, 0],
  },
  Bus: {
    color: "#5b9bd5",
    opacity: 0.15,
    radius: 0.4,
    hex: "#5b9bd5",
    stroke: "rgba(91,155,213,",
    rgb: [91, 155, 213],
  },
};
