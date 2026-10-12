import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

import { Protocol } from "pmtiles";

import {
  layers,
  namedFlavor,
} from "@protomaps/basemaps";

/* =========================================================
   CONSTANTS
   ========================================================= */

const KT_TO_JOULES = 4.184e12;

const EARTH_RADIUS_KM = 6371.0088;

const EARTH_MAX_SURFACE_RADIUS_KM =
  Math.PI * EARTH_RADIUS_KM;

const VIEW_SIZE = 620;

const BASE_PX_PER_KM = 18;

const MAX_VISIBLE_KM = 10_000_000;

const MIN_CITY_ZOOM =
  VIEW_SIZE /
  (BASE_PX_PER_KM * MAX_VISIBLE_KM);

const MAX_CITY_ZOOM = 12;

const MAX_BOMB_YIELD_KT =
  999_990_000;

/*
  This corresponds to:

  C:\Users\Hassonsa\impactsim\public\maps\earth.pmtiles

  Vite exposes files in /public at the website root.
*/
const LOCAL_EARTH_PMTILES =
  "/maps/earth.pmtiles";

/* =========================================================
   PMTILES PROTOCOL
   ========================================================= */

let pmtilesProtocolRegistered = false;

function ensurePmtilesProtocol() {
  if (pmtilesProtocolRegistered) {
    return;
  }

  const protocol = new Protocol();

  maplibregl.addProtocol(
    "pmtiles",
    protocol.tile
  );

  pmtilesProtocolRegistered = true;
}

/* =========================================================
   TYPES
   ========================================================= */

type MapType =
  | "infinite-city"
  | "earth";

type EventType =
  | "viewer"
  | "zoom"
  | "bomb"
  | "meteor"
  | "earthquake";

type PlaceableEventType =
  | "bomb"
  | "meteor"
  | "earthquake";

type BombType =
  | "atomic"
  | "thermonuclear"
  | "antimatter";

type MeteorType =
  | "rocky"
  | "iron"
  | "icy";

type ModelClass =
  | "empirical"
  | "modeled"
  | "theoretical";

type Ring = {
  name: string;
  radiusKm: number;
  border: string;
  fill: string;
  dashed?: boolean;
  modelClass: ModelClass;
};

type Stat = {
  label: string;
  value: string;
};

type Simulation = {
  title: string;
  subtitle: string;
  rings: Ring[];
  stats: Stat[];
  maxRadius: number;
  modelStatus: string;
};

type BombPreset = {
  id: string;
  name: string;
  yieldKt: number;
  type: BombType;

  burstMode:
    | "airburst"
    | "surface";

  burstHeightM?: number;

  historical: boolean;

  historicalNote: string;
};

type PlacedEvent =
  Simulation & {
    id: number;

    eventType:
      PlaceableEventType;

    payload: string;

    mapType:
      MapType;

    /*
      Infinite City coordinates
    */
    xKm?: number;
    yKm?: number;

    /*
      Earth coordinates
    */
    longitude?: number;
    latitude?: number;
  };

/* =========================================================
   BOMB PRESETS
   ========================================================= */

const BOMB_PRESETS: BombPreset[] = [
  {
    id: "little-boy",
    name: "Little Boy",
    yieldKt: 15,
    type: "atomic",
    burstMode: "airburst",
    burstHeightM: 600,
    historical: true,
    historicalNote:
      "Hiroshima, 1945. Approximately 15 kt and detonated about 600 m above the city.",
  },

  {
    id: "fat-man",
    name: "Fat Man",
    yieldKt: 21,
    type: "atomic",
    burstMode: "airburst",
    burstHeightM: 503,
    historical: true,
    historicalNote:
      "Nagasaki, 1945. Approximately 21 kt and detonated about 500 m above the city.",
  },

  {
    id: "trinity",
    name: "Trinity",
    yieldKt: 21,
    type: "atomic",
    burstMode: "surface",
    historical: true,
    historicalNote:
      "Trinity test, 1945. Approximately 21 kt.",
  },

  {
    id: "fission-100",
    name: "100 kt Fission",
    yieldKt: 100,
    type: "atomic",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical high-yield fission comparison.",
  },

  {
    id: "fission-500",
    name: "500 kt Fission",
    yieldKt: 500,
    type: "atomic",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical very-high-yield fission comparison.",
  },

  {
    id: "ivy-mike",
    name: "Ivy Mike",
    yieldKt: 10_400,
    type: "thermonuclear",
    burstMode: "surface",
    historical: true,
    historicalNote:
      "Ivy Mike test, 1952. Approximately 10.4 Mt.",
  },

  {
    id: "castle-bravo",
    name: "Castle Bravo",
    yieldKt: 15_000,
    type: "thermonuclear",
    burstMode: "surface",
    historical: true,
    historicalNote:
      "Castle Bravo test, 1954. Approximately 15 Mt.",
  },

  {
    id: "tsar-bomba",
    name: "Tsar Bomba",
    yieldKt: 50_000,
    type: "thermonuclear",
    burstMode: "airburst",
    burstHeightM: 4000,
    historical: true,
    historicalNote:
      "Tsar Bomba test, 1961. Approximately 50 Mt and detonated roughly 4 km above the surface.",
  },

  {
    id: "thermo-100mt",
    name: "100 Mt Thermonuclear",
    yieldKt: 100_000,
    type: "thermonuclear",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical 100 Mt thermonuclear comparison.",
  },

  {
    id: "thermo-1gt",
    name: "1 Gt Thermonuclear",
    yieldKt: 1_000_000,
    type: "thermonuclear",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical 1 Gt thermonuclear comparison.",
  },

  {
    id: "antimatter-1mt",
    name: "1 Mt Antimatter",
    yieldKt: 1_000,
    type: "antimatter",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical antimatter annihilation event.",
  },

  {
    id: "antimatter-100mt",
    name: "100 Mt Antimatter",
    yieldKt: 100_000,
    type: "antimatter",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical antimatter annihilation event.",
  },

  {
    id: "antimatter-1gt",
    name: "1 Gt Antimatter",
    yieldKt: 1_000_000,
    type: "antimatter",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical antimatter annihilation event.",
  },

  {
    id: "antimatter-100gt",
    name: "100 Gt Antimatter",
    yieldKt: 100_000_000,
    type: "antimatter",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Theoretical antimatter annihilation event.",
  },

  {
    id: "antimatter-max",
    name: "999.99 Gt Antimatter",
    yieldKt: 999_990_000,
    type: "antimatter",
    burstMode: "airburst",
    historical: false,
    historicalNote:
      "Maximum theoretical antimatter preset currently supported by ImpactSim.",
  },
];

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function formatNumber(
  value: number,
  digits = 0
) {
  return value.toLocaleString(
    undefined,
    {
      maximumFractionDigits:
        digits,
    }
  );
}

function kilotonsToJoules(
  kt: number
) {
  return (
    kt *
    KT_TO_JOULES
  );
}

function joulesToKilotons(
  joules: number
) {
  return (
    joules /
    KT_TO_JOULES
  );
}

function formatEnergy(
  joules: number
) {
  if (joules >= 1e24) {
    return (
      (joules / 1e24).toFixed(2) +
      " YJ"
    );
  }

  if (joules >= 1e21) {
    return (
      (joules / 1e21).toFixed(2) +
      " ZJ"
    );
  }

  if (joules >= 1e18) {
    return (
      (joules / 1e18).toFixed(2) +
      " EJ"
    );
  }

  if (joules >= 1e15) {
    return (
      (joules / 1e15).toFixed(2) +
      " PJ"
    );
  }

  return (
    joules.toExponential(2) +
    " J"
  );
}

function formatTnt(
  kt: number
) {
  if (
    kt >=
    1_000_000_000
  ) {
    return (
      formatNumber(
        kt /
          1_000_000_000,
        2
      ) +
      " Tt TNT"
    );
  }

  if (
    kt >=
    1_000_000
  ) {
    return (
      formatNumber(
        kt /
          1_000_000,
        2
      ) +
      " Gt TNT"
    );
  }

  if (kt >= 1000) {
    return (
      formatNumber(
        kt / 1000,
        2
      ) +
      " Mt TNT"
    );
  }

  return (
    formatNumber(
      kt,
      2
    ) +
    " kt TNT"
  );
}

function makeRing(
  name: string,
  radiusKm: number,
  border: string,
  fill: string,
  dashed = false,
  modelClass:
    ModelClass =
      "modeled"
): Ring {
  return {
    name,
    radiusKm,
    border,
    fill,
    dashed,
    modelClass,
  };
}

/* =========================================================
   BOMB MODEL
   ========================================================= */

function buildReferenceBlastRings(
  yieldKt: number,
  includeThermal = true
): Ring[] {
  const scale =
    Math.cbrt(
      Math.max(
        yieldKt,
        0.001
      )
    );

  const rings: Ring[] = [
    makeRing(
      "Window shatter / light blast",
      1.16 * scale,
      "#38bdf8",
      "rgba(56,189,248,0.10)",
      false,
      "empirical"
    ),

    makeRing(
      "Wood-frame near-collapse",
      0.502 * scale,
      "#facc15",
      "rgba(250,204,21,0.14)",
      false,
      "empirical"
    ),

    makeRing(
      "Wall-bearing building collapse",
      0.389 * scale,
      "#fb923c",
      "rgba(251,146,60,0.17)",
      false,
      "empirical"
    ),

    makeRing(
      "Extreme structural damage",
      0.155 * scale,
      "#ef4444",
      "rgba(239,68,68,0.24)",
      false,
      "empirical"
    ),
  ];

  if (includeThermal) {
    rings.push(
      makeRing(
        "Thermal effects",

        3.5 *
          Math.pow(
            Math.max(
              yieldKt,
              0.001
            ) /
              15,
            0.41
          ),

        "#f8fafc",

        "rgba(248,250,252,0.08)",

        true,

        "modeled"
      )
    );
  }

  return rings.sort(
    (a, b) =>
      b.radiusKm -
      a.radiusKm
  );
}

function buildBombEffectRings(
  yieldKt: number,
  bombType: BombType,
  burstMode:
    | "airburst"
    | "surface"
): Ring[] {
  const scale =
    Math.cbrt(
      Math.max(
        yieldKt,
        0.001
      )
    );

  const thermalFactor =
    bombType === "atomic"
      ? 1
      : bombType === "thermonuclear"
      ? 1.15
      : 1.3;

  const thermalRadius =
    3.5 *
    Math.pow(
      Math.max(
        yieldKt,
        0.001
      ) /
        15,
      0.41
    ) *
    thermalFactor;

  let radiationRadius = 0;

  if (bombType === "atomic") {
    radiationRadius =
      1.4 *
      Math.pow(
        Math.max(
          yieldKt,
          0.001
        ) /
          15,
        0.28
      );
  }

  if (
    bombType ===
    "thermonuclear"
  ) {
    radiationRadius =
      1.05 *
      Math.pow(
        Math.max(
          yieldKt,
          0.001
        ) /
          15,
        0.25
      );
  }

  if (
    bombType ===
    "antimatter"
  ) {
    radiationRadius =
      1.6 *
      Math.pow(
        Math.max(
          yieldKt,
          0.001
        ) /
          15,
        0.28
      );
  }

  let falloutRadius = 0;

  if (
    bombType ===
    "atomic"
  ) {
    falloutRadius =
      (
        burstMode ===
        "surface"
          ? 7.5
          : 2
      ) *
      scale;
  }

  if (
    bombType ===
    "thermonuclear"
  ) {
    falloutRadius =
      (
        burstMode ===
        "surface"
          ? 5.5
          : 1.25
      ) *
      scale;
  }

  const rings: Ring[] = [
    makeRing(
      "Window shatter / light blast",
      1.16 * scale,
      "#38bdf8",
      "rgba(56,189,248,0.10)",
      false,
      "empirical"
    ),

    makeRing(
      "Wood-frame near-collapse",
      0.502 * scale,
      "#facc15",
      "rgba(250,204,21,0.14)",
      false,
      "empirical"
    ),

    makeRing(
      "Wall-bearing building collapse",
      0.389 * scale,
      "#fb923c",
      "rgba(251,146,60,0.17)",
      false,
      "empirical"
    ),

    makeRing(
      "Extreme structural damage",
      0.155 * scale,
      "#ef4444",
      "rgba(239,68,68,0.24)",
      false,
      "empirical"
    ),

    makeRing(
      bombType ===
      "antimatter"
        ? "Thermal radiation - theoretical"
        : "Thermal radiation - modeled",

      thermalRadius,

      "#f8fafc",

      "rgba(248,250,252,0.08)",

      true,

      bombType ===
      "antimatter"
        ? "theoretical"
        : "modeled"
    ),

    makeRing(
      bombType ===
      "antimatter"
        ? "Prompt radiation - theoretical"
        : "Prompt ionizing radiation - modeled",

      radiationRadius,

      "#c084fc",

      "rgba(192,132,252,0.13)",

      true,

      bombType ===
      "antimatter"
        ? "theoretical"
        : "modeled"
    ),
  ];

  if (falloutRadius > 0) {
    rings.push(
      makeRing(
        "Fallout risk envelope - modeled",

        falloutRadius,

        "#a3e635",

        "rgba(163,230,53,0.09)",

        true,

        "modeled"
      )
    );
  }

  return rings.sort(
    (a, b) =>
      b.radiusKm -
      a.radiusKm
  );
}

function getBombTypeLabel(
  type: BombType
) {
  if (type === "atomic") {
    return "Atomic / Fission";
  }

  if (
    type ===
    "thermonuclear"
  ) {
    return "Thermonuclear";
  }

  return "Antimatter - theoretical";
}

function buildBombSimulation(
  yieldKt: number,
  bombType: BombType,
  preset:
    BombPreset | null
): Simulation {
  const burstMode =
    preset?.burstMode ??
    "airburst";

  const rings =
    buildBombEffectRings(
      yieldKt,
      bombType,
      burstMode
    );

  const name =
    preset?.name ??
    (
      "Custom " +
      getBombTypeLabel(
        bombType
      )
    );

  const stats: Stat[] = [
    {
      label: "Event",
      value: name,
    },

    {
      label: "Bomb type",
      value:
        getBombTypeLabel(
          bombType
        ),
    },

    {
      label: "Yield",
      value:
        formatTnt(
          yieldKt
        ),
    },

    {
      label: "Energy",
      value:
        formatEnergy(
          kilotonsToJoules(
            yieldKt
          )
        ),
    },

    {
      label: "Burst",

      value:
        burstMode ===
        "surface"
          ? "Surface burst"
          : preset?.burstHeightM
          ? (
              "Airburst at about " +
              formatNumber(
                preset.burstHeightM
              ) +
              " m"
            )
          : "Airburst",
    },
  ];

  for (
    const ring of
    rings
  ) {
    stats.push({
      label:
        ring.name,

      value:
        formatNumber(
          ring.radiusKm,
          2
        ) +
        " km",
    });
  }

  return {
    title: name,

    subtitle:
      formatTnt(
        yieldKt
      ) +
      " • " +
      getBombTypeLabel(
        bombType
      ),

    rings,

    stats,

    maxRadius:
      Math.max(
        ...rings.map(
          ring =>
            ring.radiusKm
        ),
        1
      ),

    modelStatus:
      preset?.historical
        ? "Historical parameters with modeled effects"
        : bombType ===
          "antimatter"
        ? "Theoretical antimatter model"
        : "Modeled/custom nuclear event",
  };
}

/* =========================================================
   EARTHQUAKE MODEL
   ========================================================= */

function earthquakeMMI(
  magnitude: number,
  hypocentralDistanceKm: number
) {
  const R =
    Math.max(
      hypocentralDistanceKm,
      1
    );

  return (
    1.64 +
    1.41 * magnitude -
    0.00526 * R -
    2.63 *
      Math.log10(R)
  );
}

function solveEarthquakeMMIRadius(
  magnitude: number,
  targetMMI: number,
  depthKm: number
) {
  let low =
    Math.max(
      depthKm,
      1
    );

  let high = 5000;

  if (
    earthquakeMMI(
      magnitude,
      low
    ) <
    targetMMI
  ) {
    return 0;
  }

  for (
    let i = 0;
    i < 80;
    i++
  ) {
    const mid =
      (low + high) /
      2;

    if (
      earthquakeMMI(
        magnitude,
        mid
      ) >=
      targetMMI
    ) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const hypocentral =
    (low + high) /
    2;

  const squared =
    hypocentral *
      hypocentral -
    depthKm *
      depthKm;

  if (squared <= 0) {
    return 0;
  }

  return Math.sqrt(
    squared
  );
}

function buildEarthquakeSimulation(
  magnitude: number,
  depthKm: number
): Simulation {
  const energyJ =
    Math.pow(
      10,
      1.5 *
        magnitude +
        4.8
    );

  const severe =
    solveEarthquakeMMIRadius(
      magnitude,
      8,
      depthKm
    );

  const strong =
    solveEarthquakeMMIRadius(
      magnitude,
      6,
      depthKm
    );

  const moderate =
    solveEarthquakeMMIRadius(
      magnitude,
      5,
      depthKm
    );

  const light =
    solveEarthquakeMMIRadius(
      magnitude,
      4,
      depthKm
    );

  const felt =
    solveEarthquakeMMIRadius(
      magnitude,
      3,
      depthKm
    );

  const rings = [
    makeRing(
      "MMI III - Weak / felt",
      felt,
      "#bae6fd",
      "rgba(186,230,253,0.05)",
      true,
      "empirical"
    ),

    makeRing(
      "MMI IV - Light shaking",
      light,
      "#38bdf8",
      "rgba(56,189,248,0.08)",
      true,
      "empirical"
    ),

    makeRing(
      "MMI V - Moderate shaking",
      moderate,
      "#facc15",
      "rgba(250,204,21,0.10)",
      true,
      "empirical"
    ),

    makeRing(
      "MMI VI - Strong shaking",
      strong,
      "#fb923c",
      "rgba(251,146,60,0.15)",
      true,
      "empirical"
    ),

    makeRing(
      "MMI VIII - Severe shaking",
      severe,
      "#ef4444",
      "rgba(239,68,68,0.23)",
      true,
      "empirical"
    ),
  ]
    .filter(
      ring =>
        ring.radiusKm >
        0
    )
    .sort(
      (a, b) =>
        b.radiusKm -
        a.radiusKm
    );

  return {
    title:
      "Magnitude " +
      magnitude.toFixed(1) +
      " Earthquake",

    subtitle:
      formatNumber(
        depthKm
      ) +
      " km focal depth",

    rings,

    maxRadius:
      Math.max(
        ...rings.map(
          ring =>
            ring.radiusKm
        ),
        1
      ),

    modelStatus:
      magnitude > 7.1
        ? "Empirical MMI attenuation extrapolation"
        : "Empirical MMI attenuation model",

    stats: [
      {
        label: "Magnitude",
        value:
          magnitude.toFixed(1),
      },

      {
        label: "Depth",

        value:
          formatNumber(
            depthKm
          ) +
          " km",
      },

      {
        label:
          "Estimated seismic energy",

        value:
          formatEnergy(
            energyJ
          ),
      },

      {
        label:
          "TNT-energy equivalent",

        value:
          formatTnt(
            joulesToKilotons(
              energyJ
            )
          ),
      },

      {
        label:
          "MMI VIII severe",

        value:
          formatNumber(
            severe
          ) +
          " km",
      },

      {
        label:
          "MMI VI strong",

        value:
          formatNumber(
            strong
          ) +
          " km",
      },

      {
        label:
          "MMI V moderate",

        value:
          formatNumber(
            moderate
          ) +
          " km",
      },

      {
        label:
          "MMI IV light",

        value:
          formatNumber(
            light
          ) +
          " km",
      },

      {
        label:
          "MMI III felt",

        value:
          formatNumber(
            felt
          ) +
          " km",
      },

      {
        label:
          "Large-earthquake warning",

        value:
          magnitude >= 8
            ? "Large earthquakes are extended fault ruptures. Circular point-source zones remain an approximation."
            : "Actual shaking also depends on geology, rupture geometry and site conditions.",
      },
    ],
  };
}

/* =========================================================
   METEOR MODEL
   ========================================================= */

function getMeteorDensity(
  type: MeteorType
) {
  if (type === "iron") {
    return 7800;
  }

  if (type === "icy") {
    return 1000;
  }

  return 3000;
}

function getMeteorLabel(
  type: MeteorType
) {
  if (type === "iron") {
    return "Iron asteroid";
  }

  if (type === "icy") {
    return "Icy comet";
  }

  return "Rocky asteroid";
}

function buildMeteorSimulation(
  diameterM: number,
  speedKmS: number,
  meteorType: MeteorType,
  angleDeg: number
): Simulation {
  const density =
    getMeteorDensity(
      meteorType
    );

  const radiusM =
    diameterM / 2;

  const volume =
    (4 / 3) *
    Math.PI *
    Math.pow(
      radiusM,
      3
    );

  const mass =
    volume *
    density;

  const velocity =
    speedKmS *
    1000;

  const energyJ =
    0.5 *
    mass *
    velocity *
    velocity;

  const equivalentKt =
    joulesToKilotons(
      energyJ
    );

  const angle =
    clamp(
      angleDeg,
      5,
      90
    ) *
    Math.PI /
    180;

  const craterDiameterKm =
    (
      18 *
      Math.pow(
        diameterM,
        0.78
      ) *
      Math.pow(
        density / 3000,
        0.26
      ) *
      Math.pow(
        speedKmS / 17,
        0.44
      ) *
      Math.pow(
        Math.sin(angle),
        1 / 3
      )
    ) /
    1000;

  const blast =
    buildReferenceBlastRings(
      Math.max(
        equivalentKt *
          0.3,
        0.001
      ),
      false
    );

  const lightBlast =
    blast.find(
      ring =>
        ring.name.includes(
          "Window"
        )
    )?.radiusKm ??
    0;

  const severeBlast =
    blast.find(
      ring =>
        ring.name.includes(
          "Wall-bearing"
        )
    )?.radiusKm ??
    0;

  const thermal =
    2.4 *
    Math.pow(
      Math.max(
        equivalentKt,
        0.001
      ) /
        15,
      0.4
    );

  const seismicEnergy =
    energyJ *
    1e-4;

  const seismicMagnitude =
    (
      Math.log10(
        Math.max(
          seismicEnergy,
          1
        )
      ) -
      4.8
    ) /
    1.5;

  const seismicRadius =
    solveEarthquakeMMIRadius(
      seismicMagnitude,
      6,
      10
    );

  const rings = [
    makeRing(
      "Atmospheric blast - light damage",

      lightBlast,

      "#38bdf8",

      "rgba(56,189,248,0.10)",

      true,

      "modeled"
    ),

    makeRing(
      "Atmospheric blast - severe damage",

      severeBlast,

      "#fb923c",

      "rgba(251,146,60,0.17)",

      true,

      "modeled"
    ),

    makeRing(
      "Thermal effects",

      thermal,

      "#f8fafc",

      "rgba(248,250,252,0.08)",

      true,

      "modeled"
    ),

    makeRing(
      "Estimated final crater",

      craterDiameterKm / 2,

      "#ef4444",

      "rgba(127,29,29,0.45)",

      false,

      "modeled"
    ),

    makeRing(
      "Impact seismic shaking - MMI VI",

      seismicRadius,

      "#c084fc",

      "rgba(192,132,252,0.10)",

      true,

      "modeled"
    ),
  ]
    .filter(
      ring =>
        ring.radiusKm >
        0
    )
    .sort(
      (a, b) =>
        b.radiusKm -
        a.radiusKm
    );

  return {
    title:
      "Meteor Impact",

    subtitle:
      getMeteorLabel(
        meteorType
      ) +
      " • " +
      formatNumber(
        diameterM
      ) +
      " m",

    rings,

    maxRadius:
      Math.max(
        ...rings.map(
          ring =>
            ring.radiusKm
        ),
        1
      ),

    modelStatus:
      "Separated kinetic-energy, crater, blast, thermal and seismic model",

    stats: [
      {
        label: "Object",

        value:
          getMeteorLabel(
            meteorType
          ),
      },

      {
        label: "Diameter",

        value:
          formatNumber(
            diameterM
          ) +
          " m",
      },

      {
        label: "Density",

        value:
          formatNumber(
            density
          ) +
          " kg/m³",
      },

      {
        label: "Velocity",

        value:
          formatNumber(
            speedKmS
          ) +
          " km/s",
      },

      {
        label:
          "Impact angle",

        value:
          formatNumber(
            angleDeg
          ) +
          "°",
      },

      {
        label: "Mass",

        value:
          mass.toExponential(3) +
          " kg",
      },

      {
        label:
          "Kinetic energy",

        value:
          formatEnergy(
            energyJ
          ),
      },

      {
        label:
          "TNT equivalent",

        value:
          formatTnt(
            equivalentKt
          ),
      },

      {
        label:
          "Estimated crater diameter",

        value:
          formatNumber(
            craterDiameterKm,
            2
          ) +
          " km",
      },

      {
        label:
          "Impact seismic equivalent",

        value:
          "M " +
          formatNumber(
            seismicMagnitude,
            2
          ),
      },
    ],
  };
}

/* =========================================================
   SIMULATION ROUTER
   ========================================================= */

function buildSimulation(
  args: {
    eventType: EventType;

    bombType: BombType;

    yieldKt: number;

    bombPreset:
      BombPreset | null;

    meteorDiameter: number;

    meteorSpeed: number;

    meteorType:
      MeteorType;

    meteorAngle: number;

    quakeMagnitude: number;

    quakeDepth: number;
  }
): Simulation {
  if (
    args.eventType ===
    "bomb"
  ) {
    return buildBombSimulation(
      args.yieldKt,
      args.bombType,
      args.bombPreset
    );
  }

  if (
    args.eventType ===
    "meteor"
  ) {
    return buildMeteorSimulation(
      args.meteorDiameter,
      args.meteorSpeed,
      args.meteorType,
      args.meteorAngle
    );
  }

  if (
    args.eventType ===
    "earthquake"
  ) {
    return buildEarthquakeSimulation(
      args.quakeMagnitude,
      args.quakeDepth
    );
  }

  return {
    title:
      args.eventType ===
      "viewer"
        ? "Viewer"
        : "Zoom / Pan",

    subtitle:
      args.eventType ===
      "viewer"
        ? "Select a placed event."
        : "Move around the map.",

    rings: [],

    stats: [],

    maxRadius: 1,

    modelStatus:
      args.eventType,
  };
}

/* =========================================================
   EARTH GEODESIC GEOMETRY
   ========================================================= */

function createGeodesicCircle(
  longitude: number,
  latitude: number,
  radiusKm: number,
  steps = 128
) {
  const radius =
    Math.min(
      Math.max(
        radiusKm,
        0
      ),
      EARTH_MAX_SURFACE_RADIUS_KM *
        0.995
    );

  const angularDistance =
    radius /
    EARTH_RADIUS_KM;

  const lat1 =
    latitude *
    Math.PI /
    180;

  const lon1 =
    longitude *
    Math.PI /
    180;

  const coordinates:
    [number, number][] = [];

  for (
    let i = 0;
    i <= steps;
    i++
  ) {
    const bearing =
      (i / steps) *
      Math.PI *
      2;

    const lat2 =
      Math.asin(
        Math.sin(lat1) *
          Math.cos(
            angularDistance
          ) +
        Math.cos(lat1) *
          Math.sin(
            angularDistance
          ) *
          Math.cos(
            bearing
          )
      );

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(
          bearing
        ) *
          Math.sin(
            angularDistance
          ) *
          Math.cos(lat1),

        Math.cos(
          angularDistance
        ) -
          Math.sin(lat1) *
          Math.sin(lat2)
      );

    let lonDegrees =
      lon2 *
      180 /
      Math.PI;

    const latDegrees =
      lat2 *
      180 /
      Math.PI;

    while (
      lonDegrees -
      longitude >
      180
    ) {
      lonDegrees -= 360;
    }

    while (
      lonDegrees -
      longitude <
      -180
    ) {
      lonDegrees += 360;
    }

    coordinates.push([
      lonDegrees,
      latDegrees,
    ]);
  }

  return {
    type:
      "Feature" as const,

    properties: {},

    geometry: {
      type:
        "Polygon" as const,

      coordinates: [
        coordinates,
      ],
    },
  };
}

function haversineDistanceKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
) {
  const rad =
    Math.PI /
    180;

  const phi1 =
    lat1 * rad;

  const phi2 =
    lat2 * rad;

  const deltaPhi =
    (lat2 - lat1) *
    rad;

  const deltaLambda =
    (lon2 - lon1) *
    rad;

  const a =
    Math.sin(
      deltaPhi / 2
    ) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(
        deltaLambda / 2
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return (
    EARTH_RADIUS_KM *
    c
  );
}

/* =========================================================
   STYLES
   ========================================================= */

const pageStyle:
  React.CSSProperties = {
    minHeight: "100vh",

    width:
      "100%",

    maxWidth:
      "100%",

    background:
      "#020617",

    color:
      "#e2e8f0",

    padding: 0,

    margin: 0,

    fontFamily:
      "system-ui, sans-serif",

    overflowX:
      "hidden",

    boxSizing:
      "border-box",
  };

const cardStyle:
  React.CSSProperties = {
    border:
      "1px solid rgba(255,255,255,0.12)",

    background:
      "rgba(255,255,255,0.04)",

    borderRadius: 18,

    padding: 16,

    marginBottom: 16,
  };

const inputStyle:
  React.CSSProperties = {
    width: "100%",

    borderRadius: 12,

    border:
      "1px solid rgba(255,255,255,0.14)",

    background:
      "#020617",

    color:
      "#e2e8f0",

    padding: 12,

    boxSizing:
      "border-box",
  };

const buttonStyle:
  React.CSSProperties = {
    borderRadius: 14,

    border:
      "1px solid rgba(255,255,255,0.12)",

    background:
      "#1e293b",

    color:
      "#e2e8f0",

    padding:
      "10px 12px",

    cursor:
      "pointer",

    fontWeight: 700,
  };

function emptySimulation():
  Simulation {
  return {
    title: "ImpactSim",

    subtitle:
      "Choose an event and place it on the map.",

    rings: [],

    stats: [
      {
        label: "Status",

        value:
          "No event selected",
      },
    ],

    maxRadius: 1,

    modelStatus:
      "No active simulation",
  };
}

/* =========================================================
   MAIN APP
   ========================================================= */

export default function App() {
  const [
    mapType,
    setMapType,
  ] =
    useState<MapType>(
      "infinite-city"
    );

  const [
    eventType,
    setEventType,
  ] =
    useState<EventType>(
      "bomb"
    );

  const [
    bombType,
    setBombType,
  ] =
    useState<BombType>(
      "atomic"
    );

  const [
    yieldKt,
    setYieldKt,
  ] =
    useState(15);

  const [
    selectedBombPresetId,
    setSelectedBombPresetId,
  ] =
    useState<string | null>(
      "little-boy"
    );

  const [
    customYield,
    setCustomYield,
  ] =
    useState("");

  const [
    meteorDiameter,
    setMeteorDiameter,
  ] =
    useState(100);

  const [
    meteorSpeed,
    setMeteorSpeed,
  ] =
    useState(20);

  const [
    meteorType,
    setMeteorType,
  ] =
    useState<MeteorType>(
      "rocky"
    );

  const [
    meteorAngle,
    setMeteorAngle,
  ] =
    useState(45);

  const [
    quakeMagnitude,
    setQuakeMagnitude,
  ] =
    useState(8);

  const [
    quakeDepth,
    setQuakeDepth,
  ] =
    useState(15);

  const [
    cityZoom,
    setCityZoom,
  ] =
    useState(1);

  const [
    cityCameraX,
    setCityCameraX,
  ] =
    useState(0);

  const [
    cityCameraY,
    setCityCameraY,
  ] =
    useState(0);

  const [
    placed,
    setPlaced,
  ] =
    useState<
      PlacedEvent[]
    >([]);

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<
      number | null
    >(null);

  const [
    nextId,
    setNextId,
  ] =
    useState(1);

  const [
    preview,
    setPreview,
  ] =
    useState(false);

  const earthMapRef =
    useRef<
      maplibregl.Map | null
    >(null);

  const selectedBombPreset =
    useMemo(
      () =>
        BOMB_PRESETS.find(
          preset =>
            preset.id ===
            selectedBombPresetId
        ) ??
        null,

      [
        selectedBombPresetId,
      ]
    );

  const current =
    useMemo(
      () =>
        buildSimulation({
          eventType,

          bombType,

          yieldKt,

          bombPreset:
            selectedBombPreset,

          meteorDiameter,

          meteorSpeed,

          meteorType,

          meteorAngle,

          quakeMagnitude,

          quakeDepth,
        }),

      [
        eventType,
        bombType,
        yieldKt,
        selectedBombPreset,
        meteorDiameter,
        meteorSpeed,
        meteorType,
        meteorAngle,
        quakeMagnitude,
        quakeDepth,
      ]
    );

  const selected =
    placed.find(
      item =>
        item.id ===
        selectedId
    ) ??
    null;

  const display =
    selected ??
    (
      preview
        ? current
        : emptySimulation()
    );

  const visibleBombPresets =
    BOMB_PRESETS.filter(
      preset =>
        preset.type ===
        bombType
    );

  const currentMapEvents =
    placed.filter(
      item =>
        item.mapType ===
        mapType
    );

  function changeMapType(
    value: MapType
  ) {
    setMapType(value);

    setSelectedId(null);

    setPreview(false);
  }

  function changeBombType(
    value: BombType
  ) {
    setBombType(value);

    const first =
      BOMB_PRESETS.find(
        preset =>
          preset.type ===
          value
      ) ??
      null;

    setSelectedBombPresetId(
      first?.id ??
      null
    );

    if (first) {
      setYieldKt(
        first.yieldKt
      );
    }

    setCustomYield("");

    setSelectedId(null);

    /*
      Selecting another bomb type
      must NOT automatically show
      a preview or place an event.
    */
    setPreview(false);
  }

  function selectBombPreset(
    preset: BombPreset
  ) {
    setBombType(
      preset.type
    );

    setYieldKt(
      preset.yieldKt
    );

    setSelectedBombPresetId(
      preset.id
    );

    setCustomYield("");

    setSelectedId(null);

    setPreview(false);
  }

  function applyCustomYield() {
    const value =
      Number(
        customYield
      );

    if (
      !Number.isFinite(
        value
      ) ||
      value <= 0
    ) {
      return;
    }

    setSelectedBombPresetId(
      null
    );

    setYieldKt(
      clamp(
        value,
        0.01,
        MAX_BOMB_YIELD_KT
      )
    );

    setSelectedId(null);

    setPreview(false);
  }

  function eventPayload() {
    if (
      eventType ===
      "bomb"
    ) {
      return (
        (
          selectedBombPreset
            ?.name ??
          (
            "Custom " +
            getBombTypeLabel(
              bombType
            )
          )
        ) +
        " • " +
        formatTnt(
          yieldKt
        )
      );
    }

    if (
      eventType ===
      "meteor"
    ) {
      return (
        getMeteorLabel(
          meteorType
        ) +
        " • " +
        formatNumber(
          meteorDiameter
        ) +
        " m"
      );
    }

    return (
      "M " +
      quakeMagnitude.toFixed(
        1
      ) +
      " earthquake"
    );
  }

  function createPlacedEvent(
    extra:
      Partial<PlacedEvent>
  ) {
    if (
      eventType ===
        "viewer" ||
      eventType ===
        "zoom"
    ) {
      return;
    }

    const payload =
      eventPayload();

    const item:
      PlacedEvent = {
        ...current,

        id: nextId,

        eventType,

        payload,

        mapType,

        ...extra,

        title:
          "#" +
          nextId +
          " " +
          payload,
      };

    setPlaced(
      old => [
        ...old,
        item,
      ]
    );

    setSelectedId(
      nextId
    );

    setNextId(
      value =>
        value + 1
    );

    setPreview(false);
  }

  function placeEarthEvent(
    longitude: number,
    latitude: number
  ) {
    createPlacedEvent({
      longitude,
      latitude,

      subtitle:
        current.subtitle +
        " • " +
        Math.abs(
          latitude
        ).toFixed(3) +
        "°" +
        (
          latitude >= 0
            ? "N"
            : "S"
        ) +
        ", " +
        Math.abs(
          longitude
        ).toFixed(3) +
        "°" +
        (
          longitude >= 0
            ? "E"
            : "W"
        ),
    });
  }

  function placeCityEvent(
    xKm: number,
    yKm: number
  ) {
    createPlacedEvent({
      xKm,
      yKm,
    });
  }

  /*
    Reset events only.

    Zoom and camera position are
    intentionally preserved.
  */
  function resetEvents() {
    setPlaced([]);

    setSelectedId(null);

    setNextId(1);

    setPreview(false);
  }

  function zoomOut() {
    if (
      mapType ===
      "earth"
    ) {
      earthMapRef.current
        ?.zoomOut();

      return;
    }

    setCityZoom(
      value =>
        clamp(
          value / 2,
          MIN_CITY_ZOOM,
          MAX_CITY_ZOOM
        )
    );
  }

  function zoomIn() {
    if (
      mapType ===
      "earth"
    ) {
      earthMapRef.current
        ?.zoomIn();

      return;
    }

    setCityZoom(
      value =>
        clamp(
          value * 2,
          MIN_CITY_ZOOM,
          MAX_CITY_ZOOM
        )
    );
  }

  function zoomOut10x() {
    if (
      mapType ===
      "earth"
    ) {
      const map =
        earthMapRef.current;

      if (map) {
        map.easeTo({
          zoom:
            Math.max(
              0,
              map.getZoom() -
                3.3
            ),
        });
      }

      return;
    }

    setCityZoom(
      value =>
        clamp(
          value / 10,
          MIN_CITY_ZOOM,
          MAX_CITY_ZOOM
        )
    );
  }

  function zoomIn10x() {
    if (
      mapType ===
      "earth"
    ) {
      const map =
        earthMapRef.current;

      if (map) {
        map.easeTo({
          zoom:
            Math.min(
              6,
              map.getZoom() +
                3.3
            ),
        });
      }

      return;
    }

    setCityZoom(
      value =>
        clamp(
          value * 10,
          MIN_CITY_ZOOM,
          MAX_CITY_ZOOM
        )
    );
  }

  function centerMap() {
    if (
      mapType ===
      "earth"
    ) {
      earthMapRef.current
        ?.flyTo({
          center: [
            0,
            20,
          ],
        });

      return;
    }

    setCityCameraX(0);

    setCityCameraY(0);
  }

  function resetZoom() {
    if (
      mapType ===
      "earth"
    ) {
      earthMapRef.current
        ?.flyTo({
          center: [
            0,
            20,
          ],

          zoom: 1.1,
        });

      return;
    }

    setCityZoom(1);
  }

  return (
    <div
      style={
        pageStyle
      }
    >
      <style>{`
        html,
        body,
        #root {
          margin: 0;
          padding: 0;
          width: 100%;
          max-width: 100%;
          min-height: 100%;
          overflow-x: hidden;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
      `}</style>
      <div
        style={{
          width:
            "100%",

          maxWidth:
            "100%",

          minHeight:
            "100vh",

          margin: 0,

          background:
            "#0f172a",

          overflow:
            "hidden",

          boxSizing:
            "border-box",
        }}
      >
        <header
          style={{
            padding: 24,

            borderBottom:
              "1px solid rgba(255,255,255,0.12)",

            background:
              "linear-gradient(135deg,#0f172a,#1e293b)",
          }}
        >
          <h1
            style={{
              margin: 0,

              fontSize: 34,
            }}
          >
            ImpactSim
          </h1>

          <p
            style={{
              margin:
                "6px 0 0",

              color:
                "#94a3b8",
            }}
          >
            Interactive disaster and extreme-energy simulator
          </p>
        </header>

        <main
          style={{
            display:
              "grid",

            width:
              "100%",

            maxWidth:
              "100%",

            minWidth: 0,

            overflowX:
              "hidden",

            gridTemplateColumns:
              "340px minmax(0,1fr) 360px",

            alignItems:
              "start",

            boxSizing:
              "border-box",
          }}
        >
          <aside
            style={{
              padding: 20,

              background:
                "#020617",

              maxHeight:
                "calc(100vh - 40px)",

              overflowY:
                "auto",
            }}
          >
            <div
              style={
                cardStyle
              }
            >
              <label>
                Map
              </label>

              <select
                value={
                  mapType
                }

                onChange={
                  event =>
                    changeMapType(
                      event.target.value as MapType
                    )
                }

                style={
                  inputStyle
                }
              >
                <option value="infinite-city">
                  Infinite City
                </option>

                <option value="earth">
                  Earth
                </option>
              </select>

              <p
                style={{
                  color:
                    "#94a3b8",

                  fontSize: 12,

                  marginBottom: 0,
                }}
              >
                {mapType ===
                "earth"
                  ? "Real Earth map using your local PMTiles archive."
                  : "Unlimited procedural city for theoretical simulations."}
              </p>
            </div>

            <div
              style={
                cardStyle
              }
            >
              <label>
                Event Type
              </label>

              <select
                value={
                  eventType
                }

                onChange={
                  event => {
                    setEventType(
                      event.target.value as EventType
                    );

                    setSelectedId(null);

                    setPreview(false);
                  }
                }

                style={
                  inputStyle
                }
              >
                <option value="viewer">
                  Viewer
                </option>

                <option value="zoom">
                  Zoom / Pan
                </option>

                <option value="bomb">
                  Bomb
                </option>

                <option value="meteor">
                  Meteor Impact
                </option>

                <option value="earthquake">
                  Earthquake
                </option>
              </select>

              <p
                style={{
                  color:
                    "#67e8f9",

                  fontSize: 12,
                }}
              >
                {eventType ===
                "zoom"
                  ? "Drag and scroll to navigate."
                  : eventType ===
                    "viewer"
                  ? "Click an existing pin to inspect it."
                  : "Click the map to place the selected event."}
              </p>
            </div>

            {eventType ===
              "bomb" && (
              <div
                style={
                  cardStyle
                }
              >
                <label>
                  Bomb Type
                </label>

                <select
                  value={
                    bombType
                  }

                  onChange={
                    event =>
                      changeBombType(
                        event.target.value as BombType
                      )
                  }

                  style={
                    inputStyle
                  }
                >
                  <option value="atomic">
                    Atomic / Fission
                  </option>

                  <option value="thermonuclear">
                    Thermonuclear
                  </option>

                  <option value="antimatter">
                    Antimatter - Theoretical
                  </option>
                </select>

                <p>
                  <b>
                    Current yield:
                  </b>
                  {" "}
                  {formatTnt(
                    yieldKt
                  )}
                </p>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap: 8,
                  }}
                >
                  {visibleBombPresets.map(
                    preset => (
                      <button
                        key={
                          preset.id
                        }

                        onClick={() =>
                          selectBombPreset(
                            preset
                          )
                        }

                        style={{
                          ...buttonStyle,

                          background:
                            selectedBombPresetId ===
                            preset.id
                              ? "#164e63"
                              : "#1e293b",

                          border:
                            selectedBombPresetId ===
                            preset.id
                              ? "1px solid #67e8f9"
                              : buttonStyle.border,
                        }}
                      >
                        {
                          preset.name
                        }

                        <br />

                        <small>
                          {formatTnt(
                            preset.yieldKt
                          )}
                        </small>
                      </button>
                    )
                  )}
                </div>

                <div
                  style={{
                    marginTop: 14,

                    paddingTop: 14,

                    borderTop:
                      "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <b>
                    Custom Payload
                  </b>

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "1fr auto",

                      gap: 8,

                      marginTop: 8,
                    }}
                  >
                    <input
                      type="number"

                      value={
                        customYield
                      }

                      placeholder="Yield in kt"

                      onChange={
                        event =>
                          setCustomYield(
                            event.target.value
                          )
                      }

                      style={
                        inputStyle
                      }
                    />

                    <button
                      onClick={
                        applyCustomYield
                      }

                      style={
                        buttonStyle
                      }
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {eventType ===
              "meteor" && (
              <div
                style={
                  cardStyle
                }
              >
                <p>
                  Diameter:
                  {" "}
                  <b>
                    {
                      meteorDiameter
                    } m
                  </b>
                </p>

                <input
                  type="range"
                  min={10}
                  max={20000}
                  step={10}

                  value={
                    meteorDiameter
                  }

                  onChange={
                    event =>
                      setMeteorDiameter(
                        Number(
                          event.target.value
                        )
                      )
                  }

                  style={{
                    width:
                      "100%",
                  }}
                />

                <p>
                  Velocity:
                  {" "}
                  <b>
                    {
                      meteorSpeed
                    } km/s
                  </b>
                </p>

                <input
                  type="range"
                  min={11}
                  max={72}
                  step={1}

                  value={
                    meteorSpeed
                  }

                  onChange={
                    event =>
                      setMeteorSpeed(
                        Number(
                          event.target.value
                        )
                      )
                  }

                  style={{
                    width:
                      "100%",
                  }}
                />

                <p>
                  Impact angle:
                  {" "}
                  <b>
                    {
                      meteorAngle
                    }°
                  </b>
                </p>

                <input
                  type="range"
                  min={5}
                  max={90}
                  step={1}

                  value={
                    meteorAngle
                  }

                  onChange={
                    event =>
                      setMeteorAngle(
                        Number(
                          event.target.value
                        )
                      )
                  }

                  style={{
                    width:
                      "100%",
                  }}
                />

                <select
                  value={
                    meteorType
                  }

                  onChange={
                    event =>
                      setMeteorType(
                        event.target.value as MeteorType
                      )
                  }

                  style={
                    inputStyle
                  }
                >
                  <option value="rocky">
                    Rocky Asteroid
                  </option>

                  <option value="iron">
                    Iron Asteroid
                  </option>

                  <option value="icy">
                    Icy Comet
                  </option>
                </select>
              </div>
            )}

            {eventType ===
              "earthquake" && (
              <div
                style={
                  cardStyle
                }
              >
                <p>
                  Magnitude:
                  {" "}
                  <b>
                    M
                    {
                      quakeMagnitude.toFixed(
                        1
                      )
                    }
                  </b>
                </p>

                <input
                  type="range"
                  min={5}
                  max={9.5}
                  step={0.1}

                  value={
                    quakeMagnitude
                  }

                  onChange={
                    event =>
                      setQuakeMagnitude(
                        Number(
                          event.target.value
                        )
                      )
                  }

                  style={{
                    width:
                      "100%",
                  }}
                />

                <p>
                  Focal depth:
                  {" "}
                  <b>
                    {
                      quakeDepth
                    } km
                  </b>
                </p>

                <input
                  type="range"
                  min={1}
                  max={700}
                  step={1}

                  value={
                    quakeDepth
                  }

                  onChange={
                    event =>
                      setQuakeDepth(
                        Number(
                          event.target.value
                        )
                      )
                  }

                  style={{
                    width:
                      "100%",
                  }}
                />
              </div>
            )}

            <div
              style={
                cardStyle
              }
            >
              <b>
                Zoom
              </b>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "1fr 1fr",

                  gap: 8,

                  marginTop: 10,
                }}
              >
                <button
                  onClick={
                    zoomOut
                  }

                  style={
                    buttonStyle
                  }
                >
                  Zoom Out
                </button>

                <button
                  onClick={
                    zoomIn
                  }

                  style={
                    buttonStyle
                  }
                >
                  Zoom In
                </button>

                <button
                  onClick={
                    zoomOut10x
                  }

                  style={
                    buttonStyle
                  }
                >
                  Out 10x
                </button>

                <button
                  onClick={
                    zoomIn10x
                  }

                  style={
                    buttonStyle
                  }
                >
                  In 10x
                </button>

                <button
                  onClick={
                    centerMap
                  }

                  style={
                    buttonStyle
                  }
                >
                  Center
                </button>

                <button
                  onClick={
                    resetZoom
                  }

                  style={
                    buttonStyle
                  }
                >
                  Reset Zoom
                </button>
              </div>
            </div>

            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap: 8,

                marginBottom: 16,
              }}
            >
              <button
                disabled={
                  eventType ===
                    "viewer" ||
                  eventType ===
                    "zoom"
                }

                onClick={() => {
                  setSelectedId(null);

                  setPreview(true);
                }}

                style={{
                  ...buttonStyle,

                  background:
                    "#f59e0b",

                  color:
                    "#020617",
                }}
              >
                Preview
              </button>

              <button
                onClick={
                  resetEvents
                }

                style={
                  buttonStyle
                }
              >
                Reset Events
              </button>
            </div>

          </aside>

          <section
            style={{
              padding: 20,

              minWidth: 0,
            }}
          >
            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                gap: 20,

                marginBottom: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  {
                    display.title
                  }
                </h2>

                <div
                  style={{
                    color:
                      "#94a3b8",

                    marginTop: 5,
                  }}
                >
                  {
                    display.subtitle
                  }
                </div>
              </div>

              <div
                style={{
                  color:
                    "#94a3b8",

                  fontSize: 12,

                  maxWidth: 280,
                }}
              >
                {
                  display.modelStatus
                }
              </div>
            </div>

            <div
              style={{
                position:
                  "relative",

                width:
                  "100%",

                height:
                  VIEW_SIZE,

                minHeight:
                  VIEW_SIZE,

                overflow:
                  "hidden",

                borderRadius: 20,

                border:
                  "1px solid rgba(255,255,255,0.12)",

                background:
                  "#111827",
              }}
            >
              {mapType ===
              "earth" ? (
                <EarthMap
                  mapRef={
                    earthMapRef
                  }

                  eventType={
                    eventType
                  }

                  events={
                    currentMapEvents
                  }

                  selectedId={
                    selectedId
                  }

                  onSelect={
                    setSelectedId
                  }

                  onPlace={
                    placeEarthEvent
                  }

                  preview={
                    preview
                      ? current
                      : null
                  }
                />
              ) : (
                <InfiniteCityMap
                  eventType={
                    eventType
                  }

                  zoom={
                    cityZoom
                  }

                  setZoom={
                    setCityZoom
                  }

                  cameraX={
                    cityCameraX
                  }

                  cameraY={
                    cityCameraY
                  }

                  setCameraX={
                    setCityCameraX
                  }

                  setCameraY={
                    setCityCameraY
                  }

                  events={
                    currentMapEvents
                  }

                  selectedId={
                    selectedId
                  }

                  onSelect={
                    setSelectedId
                  }

                  onPlace={
                    placeCityEvent
                  }

                  preview={
                    preview
                      ? current
                      : null
                  }
                />
              )}
            </div>
          </section>

          <aside
            style={{
              padding: 20,

              background:
                "#020617",

              maxHeight:
                "calc(100vh - 40px)",

              overflowY:
                "auto",

              borderLeft:
                "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <ResultsPanel
              simulation={
                display
              }

              count={
                currentMapEvents.length
              }
            />

            <ModelKey />
          </aside>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   RESULTS
   ========================================================= */

function ResultsPanel(
  props: {
    simulation:
      Simulation;

    count: number;
  }
) {
  return (
    <div
      style={
        cardStyle
      }
    >
      <h2
        style={{
          marginTop: 0,
        }}
      >
        Results
      </h2>

      {props.simulation.stats.map(
        stat => {
          const matchingRing =
            props.simulation.rings.find(
              ring =>
                ring.name ===
                stat.label
            );

          return (
            <div
              key={
                stat.label
              }

              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap: 12,

                padding:
                  "7px 0",

                borderBottom:
                  "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 8,

                  color:
                    "#94a3b8",

                  minWidth: 0,
                }}
              >
                {matchingRing && (
                  <span
                    aria-hidden="true"

                    style={{
                      width: 14,

                      height: 14,

                      minWidth: 14,

                      borderRadius:
                        "50%",

                      border:
                        "2px " +
                        (
                          matchingRing.dashed
                            ? "dashed "
                            : "solid "
                        ) +
                        matchingRing.border,

                      background:
                        matchingRing.fill,

                      boxSizing:
                        "border-box",
                    }}
                  />
                )}

                <span>
                  {
                    stat.label
                  }
                </span>
              </span>

              <b
                style={{
                  color:
                    matchingRing
                      ? matchingRing.border
                      : "#fcd34d",

                  maxWidth: 230,

                  textAlign:
                    "right",

                  flexShrink: 0,
                }}
              >
                {
                  stat.value
                }
              </b>
            </div>
          );
        }
      )}

      <p
        style={{
          color:
            "#67e8f9",

          fontWeight: 700,
        }}
      >
        Placed events:
        {" "}
        {
          props.count
        }
      </p>
    </div>
  );
}

/* =========================================================
   MODEL KEY
   ========================================================= */

function ModelKey() {
  return (
    <div
      style={
        cardStyle
      }
    >
      <h2>
        Model Key
      </h2>

      <p>
        <b
          style={{
            color:
              "#38bdf8",
          }}
        >
          Empirical
        </b>
        {" "}
        = observed or fitted relationships.
      </p>

      <p>
        <b
          style={{
            color:
              "#facc15",
          }}
        >
          Modeled
        </b>
        {" "}
        = physically motivated approximation.
      </p>

      <p>
        <b
          style={{
            color:
              "#c084fc",
          }}
        >
          Theoretical
        </b>
        {" "}
        = hypothetical or extrapolated physics.
      </p>
    </div>
  );
}

/* =========================================================
   EARTH MAP
   ========================================================= */

function EarthMap(
  props: {
    mapRef:
      React.MutableRefObject<
        maplibregl.Map | null
      >;

    eventType:
      EventType;

    events:
      PlacedEvent[];

    selectedId:
      number | null;

    onSelect:
      (id: number) => void;

    onPlace:
      (
        longitude: number,
        latitude: number
      ) => void;

    preview:
      Simulation | null;
  }
) {
  const containerRef =
    useRef<
      HTMLDivElement | null
    >(null);

  const markersRef =
    useRef<
      maplibregl.Marker[]
    >([]);

  const eventTypeRef =
    useRef(
      props.eventType
    );

  const onPlaceRef =
    useRef(
      props.onPlace
    );

  const eventsRef =
    useRef(
      props.events
    );

  const previewRef =
    useRef(
      props.preview
    );

  const mapLoadedRef =
    useRef(false);

  const [
    earthInfo,
    setEarthInfo,
  ] =
    useState(
      "Earth"
    );

  useEffect(
    () => {
      eventTypeRef.current =
        props.eventType;
    },
    [
      props.eventType,
    ]
  );

  useEffect(
    () => {
      onPlaceRef.current =
        props.onPlace;
    },
    [
      props.onPlace,
    ]
  );

  useEffect(
    () => {
      eventsRef.current =
        props.events;
    },
    [
      props.events,
    ]
  );

  useEffect(
    () => {
      previewRef.current =
        props.preview;
    },
    [
      props.preview,
    ]
  );

  useEffect(
    () => {
      const container =
        containerRef.current;

      if (!container) {
        return;
      }

      ensurePmtilesProtocol();

      let cancelled = false;

      let map:
        maplibregl.Map | null =
          null;

      let frame = 0;

      const initialize =
        () => {
          if (cancelled) {
            return;
          }

          const target =
            containerRef.current;

          if (!target) {
            return;
          }

          if (
            target.clientWidth <
              100 ||
            target.clientHeight <
              100
          ) {
            frame =
              requestAnimationFrame(
                initialize
              );

            return;
          }

          const archiveUrl =
            new URL(
              LOCAL_EARTH_PMTILES,
              window.location.href
            ).href;

          const style:
            maplibregl.StyleSpecification =
          {
            version: 8,

            glyphs:
              "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",

            sprite:
              "https://protomaps.github.io/basemaps-assets/sprites/v4/light",

            sources: {
              protomaps: {
                type:
                  "vector",

                url:
                  "pmtiles://" +
                  archiveUrl,

                attribution:
                  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
              },
            },

            layers:
              layers(
                "protomaps",

                namedFlavor(
                  "light"
                ),

                {
                  lang: "en",
                }
              ) as any,
          };

          map =
            new maplibregl.Map({
              container:
                target,

              style,

              center: [
                0,
                20,
              ],

              zoom: 1.1,

              minZoom: 0,

              maxZoom: 6,

              renderWorldCopies:
                false,

              attributionControl:
                true,

              cooperativeGestures:
                false,
            });

          props.mapRef.current =
            map;

          /*
            ALWAYS ALLOW NORMAL MAP NAVIGATION.

            This means Earth can be dragged
            and zoomed regardless of whether
            Bomb, Meteor, Earthquake, Viewer
            or Zoom is selected.
          */
          map.dragPan.enable();

          map.scrollZoom.enable();

          map.doubleClickZoom.enable();

          map.touchZoomRotate.enable();

          map.keyboard.enable();

          /*
            Disable rotation.

            ImpactSim is intended to behave
            like a normal north-up map.
          */
          map.dragRotate.disable();

          map.touchZoomRotate.disableRotation();

          const scaleControl =
            new maplibregl.ScaleControl({
              maxWidth: 130,

              unit:
                "metric",
            });

          map.addControl(
            scaleControl,
            "bottom-left"
          );

          function updateEarthInfo() {
            if (!map) {
              return;
            }

            const canvas =
              map.getCanvas();

            const width =
              canvas.clientWidth;

            const height =
              canvas.clientHeight;

            if (
              width <= 0 ||
              height <= 0
            ) {
              return;
            }

            /*
              Measure 80% of the visible
              horizontal map area.
            */
            const left =
              map.unproject([
                width * 0.1,
                height / 2,
              ]);

            const right =
              map.unproject([
                width * 0.9,
                height / 2,
              ]);

            const measuredKm =
              haversineDistanceKm(
                left.lng,
                left.lat,
                right.lng,
                right.lat
              );

            const approximateViewKm =
              measuredKm /
              0.8;

            const center =
              map.getCenter();

            const latitudeText =
              Math.abs(
                center.lat
              ).toFixed(1) +
              "°" +
              (
                center.lat >= 0
                  ? "N"
                  : "S"
              );

            const longitudeText =
              Math.abs(
                center.lng
              ).toFixed(1) +
              "°" +
              (
                center.lng >= 0
                  ? "E"
                  : "W"
              );

            setEarthInfo(
              "Earth • approx. " +
              formatNumber(
                approximateViewKm,
                0
              ) +
              " km view • center " +
              latitudeText +
              ", " +
              longitudeText +
              " • zoom " +
              map
                .getZoom()
                .toFixed(2) +
              "x"
            );
          }

          /*
            style.load is important here.

            It fires when the actual map
            style is usable.
          */
          map.on(
            "style.load",
            () => {
              if (
                cancelled ||
                !map
              ) {
                return;
              }

              mapLoadedRef.current =
                true;

              if (
                !map.getSource(
                  "impact-rings"
                )
              ) {
                addImpactLayers(
                  map
                );
              }

              updateEarthImpactSource(
                map,
                eventsRef.current,
                previewRef.current
              );

              updateEarthInfo();
            }
          );

          /*
            idle fires once the map has
            finished rendering the current
            visible tiles.

            This fixes the indicator staying
            stuck on "Earth map loading..."
          */
          map.on(
            "idle",
            () => {
              if (
                cancelled ||
                !map
              ) {
                return;
              }

              mapLoadedRef.current =
                true;

              if (
                !map.getSource(
                  "impact-rings"
                )
              ) {
                addImpactLayers(
                  map
                );
              }

              updateEarthImpactSource(
                map,
                eventsRef.current,
                previewRef.current
              );

              updateEarthInfo();
            }
          );

          map.on(
            "move",
            updateEarthInfo
          );

          map.on(
            "zoom",
            updateEarthInfo
          );

          map.on(
            "resize",
            updateEarthInfo
          );

          /*
            Event placement still depends
            on the selected event type.

            Panning and zooming do not.
          */
          map.on(
            "click",
            event => {
              if (
                eventTypeRef.current ===
                  "viewer" ||
                eventTypeRef.current ===
                  "zoom"
              ) {
                return;
              }

              onPlaceRef.current(
                event.lngLat.lng,
                event.lngLat.lat
              );
            }
          );

          map.on(
            "error",
            event => {
              console.error(
                "ImpactSim Earth map error:",
                event.error
              );
            }
          );

          requestAnimationFrame(
            () => {
              if (
                !cancelled &&
                map
              ) {
                map.resize();

                updateEarthInfo();
              }
            }
          );
        };

      frame =
        requestAnimationFrame(
          initialize
        );

      return () => {
        cancelled = true;

        cancelAnimationFrame(
          frame
        );

        mapLoadedRef.current =
          false;

        markersRef.current.forEach(
          marker =>
            marker.remove()
        );

        markersRef.current = [];

        if (map) {
          map.remove();
        }

        props.mapRef.current =
          null;
      };
    },
    []
  );

  /*
    Update overlays when events
    or Preview change.
  */
  useEffect(
    () => {
      const map =
        props.mapRef.current;

      if (!map) {
        return;
      }

      const update =
        () => {
          if (
            !map.isStyleLoaded()
          ) {
            return;
          }

          if (
            !map.getSource(
              "impact-rings"
            )
          ) {
            addImpactLayers(
              map
            );
          }

          updateEarthImpactSource(
            map,
            props.events,
            props.preview
          );
        };

      if (
        map.isStyleLoaded()
      ) {
        update();
      } else {
        map.once(
          "style.load",
          update
        );
      }

      return () => {
        map.off(
          "style.load",
          update
        );
      };
    },
    [
      props.events,
      props.preview,
    ]
  );

  /*
    Update map pin markers.
  */
  useEffect(
    () => {
      const map =
        props.mapRef.current;

      if (!map) {
        return;
      }

      markersRef.current.forEach(
        marker =>
          marker.remove()
      );

      markersRef.current = [];

      for (
        const item of
        props.events
      ) {
        if (
          item.longitude ===
            undefined ||
          item.latitude ===
            undefined
        ) {
          continue;
        }

        const element =
          document.createElement(
            "button"
          );

        element.type =
          "button";

        element.style.width =
          "24px";

        element.style.height =
          "32px";

        element.style.border =
          "0";

        element.style.padding =
          "0";

        element.style.background =
          "transparent";

        element.style.cursor =
          "pointer";

        const markerColor =
          props.selectedId ===
          item.id
            ? "#67e8f9"
            : item.eventType ===
              "bomb"
            ? "#ef4444"
            : item.eventType ===
              "meteor"
            ? "#f59e0b"
            : "#3b82f6";

        /*
          Use an SVG pin whose exact bottom-center point
          is the MapLibre marker coordinate. This keeps
          the pin locked to the same longitude/latitude
          as the effect circles while panning and zooming.
        */
        const svgNamespace =
          "http://www.w3.org/2000/svg";

        const pin =
          document.createElementNS(
            svgNamespace,
            "svg"
          );

        pin.setAttribute(
          "width",
          "24"
        );

        pin.setAttribute(
          "height",
          "32"
        );

        pin.setAttribute(
          "viewBox",
          "0 0 24 32"
        );

        pin.style.display =
          "block";

        const pinPath =
          document.createElementNS(
            svgNamespace,
            "path"
          );

        pinPath.setAttribute(
          "d",
          "M12 1C5.93 1 1 5.93 1 12c0 8.15 11 19 11 19s11-10.85 11-19C23 5.93 18.07 1 12 1Z"
        );

        pinPath.setAttribute(
          "fill",
          markerColor
        );

        pinPath.setAttribute(
          "stroke",
          "white"
        );

        pinPath.setAttribute(
          "stroke-width",
          "2"
        );

        pinPath.setAttribute(
          "stroke-linejoin",
          "round"
        );

        pinPath.style.filter =
          "drop-shadow(0 2px 3px rgba(0,0,0,0.55))";

        const center =
          document.createElementNS(
            svgNamespace,
            "circle"
          );

        center.setAttribute(
          "cx",
          "12"
        );

        center.setAttribute(
          "cy",
          "12"
        );

        center.setAttribute(
          "r",
          "3"
        );

        center.setAttribute(
          "fill",
          "#020617"
        );

        pin.appendChild(
          pinPath
        );

        pin.appendChild(
          center
        );

        element.appendChild(
          pin
        );

        element.onclick =
          event => {
            event.stopPropagation();

            props.onSelect(
              item.id
            );
          };

        const marker =
          new maplibregl.Marker({
            element,

            anchor:
              "bottom",

            offset:
              [0, 0],
          })
            .setLngLat([
              item.longitude,
              item.latitude,
            ])
            .addTo(map);

        markersRef.current.push(
          marker
        );
      }
    },
    [
      props.events,
      props.selectedId,
    ]
  );

  /*
    Keep MapLibre sized correctly.
  */
  useEffect(
    () => {
      const target =
        containerRef.current;

      if (!target) {
        return;
      }

      const observer =
        new ResizeObserver(
          () => {
            const map =
              props.mapRef.current;

            if (map) {
              requestAnimationFrame(
                () => {
                  map.resize();
                }
              );
            }
          }
        );

      observer.observe(
        target
      );

      return () => {
        observer.disconnect();
      };
    },
    []
  );

  return (
    <>
      <div
        ref={
          containerRef
        }

        style={{
          position:
            "absolute",

          inset: 0,

          width:
            "100%",

          height:
            "100%",

          background:
            "#dbeafe",
        }}
      />

      <div
        style={{
          position:
            "absolute",

          left: 14,

          top: 14,

          zIndex: 200,

          padding:
            "8px 12px",

          borderRadius: 12,

          background:
            "rgba(0,0,0,0.72)",

          color:
            "white",

          fontSize: 12,

          pointerEvents:
            "none",

          boxShadow:
            "0 2px 8px rgba(0,0,0,0.35)",
        }}
      >
        {
          earthInfo
        }
      </div>
    </>
  );
}

/* =========================================================
   EARTH IMPACT LAYERS
   ========================================================= */

function addImpactLayers(
  map:
    maplibregl.Map
) {
  if (
    map.getSource(
      "impact-rings"
    )
  ) {
    return;
  }

  map.addSource(
    "impact-rings",
    {
      type:
        "geojson",

      data: {
        type:
          "FeatureCollection",

        features: [],
      },
    }
  );

  map.addLayer({
    id:
      "impact-ring-fill",

    type:
      "fill",

    source:
      "impact-rings",

    paint: {
      "fill-color": [
        "get",
        "fillColor",
      ],

      "fill-opacity":
        0.2,
    },
  });

  map.addLayer({
    id:
      "impact-ring-line",

    type:
      "line",

    source:
      "impact-rings",

    paint: {
      "line-color": [
        "get",
        "borderColor",
      ],

      "line-width": 2,

      "line-opacity":
        0.95,
    },
  });
}

function updateEarthImpactSource(
  map:
    maplibregl.Map,

  events:
    PlacedEvent[],

  preview:
    Simulation | null
) {
  const features:
    any[] = [];

  for (
    const item of
    events
  ) {
    if (
      item.longitude ===
        undefined ||
      item.latitude ===
        undefined
    ) {
      continue;
    }

    for (
      const ring of
      item.rings
    ) {
      const feature =
        createGeodesicCircle(
          item.longitude,
          item.latitude,
          ring.radiusKm
        );

      feature.properties = {
        eventId:
          item.id,

        ringName:
          ring.name,

        borderColor:
          ring.border,

        fillColor:
          ring.fill,
      };

      features.push(
        feature
      );
    }
  }

  /*
    Preview is centered at
    the current Earth map center.
  */
  if (preview) {
    const center =
      map.getCenter();

    for (
      const ring of
      preview.rings
    ) {
      const feature =
        createGeodesicCircle(
          center.lng,
          center.lat,
          ring.radiusKm
        );

      feature.properties = {
        eventId: -1,

        ringName:
          ring.name,

        borderColor:
          ring.border,

        fillColor:
          ring.fill,
      };

      features.push(
        feature
      );
    }
  }

  const source =
    map.getSource(
      "impact-rings"
    ) as
      maplibregl.GeoJSONSource |
      undefined;

  if (!source) {
    return;
  }

  source.setData({
    type:
      "FeatureCollection",

    features,
  });
}

/* =========================================================
   INFINITE CITY
   ========================================================= */

function InfiniteCityMap(
  props: {
    eventType:
      EventType;

    zoom: number;

    setZoom:
      React.Dispatch<
        React.SetStateAction<number>
      >;

    cameraX: number;

    cameraY: number;

    setCameraX:
      React.Dispatch<
        React.SetStateAction<number>
      >;

    setCameraY:
      React.Dispatch<
        React.SetStateAction<number>
      >;

    events:
      PlacedEvent[];

    selectedId:
      number | null;

    onSelect:
      (id: number) => void;

    onPlace:
      (
        xKm: number,
        yKm: number
      ) => void;

    preview:
      Simulation | null;
  }
) {
  const drag =
    useRef({
      active: false,

      x: 0,

      y: 0,
    });

  const pxPerKm =
    BASE_PX_PER_KM *
    props.zoom;

  const visibleKm =
    VIEW_SIZE /
    pxPerKm;

  function onClick(
    event:
      React.MouseEvent<HTMLDivElement>
  ) {
    if (
      props.eventType ===
        "viewer" ||
      props.eventType ===
        "zoom"
    ) {
      return;
    }

    const rect =
      event.currentTarget
        .getBoundingClientRect();

    const xKm =
      props.cameraX +
      (
        event.clientX -
        rect.left -
        rect.width / 2
      ) /
        pxPerKm;

    const yKm =
      props.cameraY +
      (
        event.clientY -
        rect.top -
        rect.height / 2
      ) /
        pxPerKm;

    props.onPlace(
      xKm,
      yKm
    );
  }

  function onWheel(
    event:
      React.WheelEvent<HTMLDivElement>
  ) {
    if (
      props.eventType !==
      "zoom"
    ) {
      return;
    }

    event.preventDefault();

    const rect =
      event.currentTarget
        .getBoundingClientRect();

    const pointerX =
      event.clientX -
      rect.left -
      rect.width / 2;

    const pointerY =
      event.clientY -
      rect.top -
      rect.height / 2;

    const beforeX =
      props.cameraX +
      pointerX /
        pxPerKm;

    const beforeY =
      props.cameraY +
      pointerY /
        pxPerKm;

    const factor =
      event.deltaY > 0
        ? 0.82
        : 1.22;

    const newZoom =
      clamp(
        props.zoom *
          factor,

        MIN_CITY_ZOOM,

        MAX_CITY_ZOOM
      );

    const newPxPerKm =
      BASE_PX_PER_KM *
      newZoom;

    props.setZoom(
      newZoom
    );

    props.setCameraX(
      beforeX -
      pointerX /
        newPxPerKm
    );

    props.setCameraY(
      beforeY -
      pointerY /
        newPxPerKm
    );
  }

  function pointerDown(
    event:
      React.PointerEvent<HTMLDivElement>
  ) {
    if (
      props.eventType !==
      "zoom"
    ) {
      return;
    }

    drag.current = {
      active: true,

      x:
        event.clientX,

      y:
        event.clientY,
    };

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );
  }

  function pointerMove(
    event:
      React.PointerEvent<HTMLDivElement>
  ) {
    if (
      !drag.current.active ||
      props.eventType !==
        "zoom"
    ) {
      return;
    }

    const dx =
      event.clientX -
      drag.current.x;

    const dy =
      event.clientY -
      drag.current.y;

    drag.current = {
      active: true,

      x:
        event.clientX,

      y:
        event.clientY,
    };

    props.setCameraX(
      value =>
        value -
        dx / pxPerKm
    );

    props.setCameraY(
      value =>
        value -
        dy / pxPerKm
    );
  }

  return (
    <div
      onClick={
        onClick
      }

      onWheel={
        onWheel
      }

      onPointerDown={
        pointerDown
      }

      onPointerMove={
        pointerMove
      }

      onPointerUp={() => {
        drag.current.active =
          false;
      }}

      style={{
        position:
          "absolute",

        inset: 0,

        overflow:
          "hidden",

        cursor:
          props.eventType ===
          "zoom"
            ? "grab"
            : props.eventType ===
              "viewer"
            ? "pointer"
            : "crosshair",

        touchAction:
          "none",
      }}
    >
      <CanvasCity
        pxPerKm={
          pxPerKm
        }

        cameraX={
          props.cameraX
        }

        cameraY={
          props.cameraY
        }

        visibleKm={
          visibleKm
        }
      />

      {/* RESTORED CITY SCALE / INFO */}

      <div
        style={{
          position:
            "absolute",

          left: 14,

          top: 14,

          zIndex: 200,

          padding:
            "8px 12px",

          borderRadius: 12,

          background:
            "rgba(0,0,0,0.72)",

          color:
            "white",

          fontSize: 12,

          pointerEvents:
            "none",
        }}
      >
        Infinite City
        {" • "}
        {formatNumber(
          visibleKm,
          1
        )}
        {" km view • zoom "}
        {props.zoom.toFixed(
          5
        )}
        {"x"}
      </div>

      <CityScaleBar
        visibleKm={
          visibleKm
        }
      />

      {props.preview && (
        <FlatRingLayer
          rings={
            props.preview.rings
          }

          pxPerKm={
            pxPerKm
          }

          centerX={
            VIEW_SIZE / 2
          }

          centerY={
            VIEW_SIZE / 2
          }
        />
      )}

      {props.events.map(
        item => {
          if (
            item.xKm ===
              undefined ||
            item.yKm ===
              undefined
          ) {
            return null;
          }

          const left =
            VIEW_SIZE / 2 +
            (
              item.xKm -
              props.cameraX
            ) *
              pxPerKm;

          const top =
            VIEW_SIZE / 2 +
            (
              item.yKm -
              props.cameraY
            ) *
              pxPerKm;

          return (
            <React.Fragment
              key={
                item.id
              }
            >
              <FlatRingLayer
                rings={
                  item.rings
                }

                pxPerKm={
                  pxPerKm
                }

                centerX={
                  left
                }

                centerY={
                  top
                }
              />

              <button
                onClick={
                  event => {
                    event.stopPropagation();

                    props.onSelect(
                      item.id
                    );
                  }
                }

                style={{
                  position:
                    "absolute",

                  left,

                  top,

                  width: 24,

                  height: 32,

                  transform:
                    "translate(-50%,-100%)",

                  border: 0,

                  background:
                    "transparent",

                  cursor:
                    "pointer",

                  zIndex: 50,
                }}
              >
                <span
                  style={{
                    position:
                      "absolute",

                    left:
                      "50%",

                    bottom:
                      "4px",

                    width: 18,

                    height: 18,

                    boxSizing:
                      "border-box",

                    borderRadius:
                      "50% 50% 50% 0",

                    transform:
                      "translateX(-50%) rotate(-45deg)",

                    background:
                      props.selectedId ===
                      item.id
                        ? "#67e8f9"
                        : item.eventType ===
                          "bomb"
                        ? "#ef4444"
                        : item.eventType ===
                          "meteor"
                        ? "#f59e0b"
                        : "#3b82f6",

                    border:
                      "2px solid white",
                  }}
                />
              </button>
            </React.Fragment>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   CITY SCALE BAR
   ========================================================= */

function CityScaleBar(
  props: {
    visibleKm: number;
  }
) {
  const target =
    props.visibleKm *
    0.18;

  const powers = [
    1,
    2,
    5,
  ];

  const magnitude =
    Math.pow(
      10,
      Math.floor(
        Math.log10(
          Math.max(
            target,
            0.000001
          )
        )
      )
    );

  let scaleKm =
    magnitude;

  for (
    const multiplier of
    powers
  ) {
    const candidate =
      multiplier *
      magnitude;

    if (
      candidate <= target
    ) {
      scaleKm =
        candidate;
    }
  }

  const widthPx =
    (
      scaleKm /
      props.visibleKm
    ) *
    VIEW_SIZE;

  return (
    <div
      style={{
        position:
          "absolute",

        left: 16,

        bottom: 16,

        zIndex: 200,

        padding:
          "7px 9px",

        borderRadius: 8,

        background:
          "rgba(255,255,255,0.88)",

        color:
          "#0f172a",

        pointerEvents:
          "none",

        fontSize: 11,

        fontWeight: 700,
      }}
    >
      <div
        style={{
          width:
            Math.max(
              35,
              widthPx
            ),

          borderBottom:
            "3px solid #0f172a",

          borderLeft:
            "2px solid #0f172a",

          borderRight:
            "2px solid #0f172a",

          height: 6,

          marginBottom: 3,
        }}
      />

      {formatNumber(
        scaleKm,
        scaleKm < 1
          ? 2
          : 0
      )}
      {" km"}
    </div>
  );
}

/* =========================================================
   FLAT CITY RINGS
   ========================================================= */

function FlatRingLayer(
  props: {
    rings: Ring[];

    pxPerKm: number;

    centerX: number;

    centerY: number;
  }
) {
  return (
    <>
      {props.rings.map(
        ring => {
          const diameter =
            ring.radiusKm *
            props.pxPerKm *
            2;

          return (
            <div
              key={
                ring.name
              }

              style={{
                position:
                  "absolute",

                left:
                  props.centerX,

                top:
                  props.centerY,

                width:
                  diameter,

                height:
                  diameter,

                borderRadius:
                  "50%",

                transform:
                  "translate(-50%,-50%)",

                border:
                  "2px " +
                  (
                    ring.dashed
                      ? "dashed "
                      : "solid "
                  ) +
                  ring.border,

                background:
                  ring.fill,

                pointerEvents:
                  "none",

                zIndex: 20,
              }}
            />
          );
        }
      )}
    </>
  );
}

/* =========================================================
   CITY CANVAS
   ========================================================= */

function CanvasCity(
  props: {
    pxPerKm: number;

    cameraX: number;

    cameraY: number;

    visibleKm: number;
  }
) {
  const ref =
    useRef<
      HTMLCanvasElement | null
    >(null);

  useEffect(
    () => {
      const canvas =
        ref.current;

      if (!canvas) {
        return;
      }

      const context =
        canvas.getContext(
          "2d"
        );

      if (!context) {
        return;
      }

      const dpr =
        Math.min(
          window.devicePixelRatio ||
            1,
          2
        );

      canvas.width =
        VIEW_SIZE *
        dpr;

      canvas.height =
        VIEW_SIZE *
        dpr;

      canvas.style.width =
        "100%";

      canvas.style.height =
        "100%";

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      context.clearRect(
        0,
        0,
        VIEW_SIZE,
        VIEW_SIZE
      );

      context.fillStyle =
        "#101820";

      context.fillRect(
        0,
        0,
        VIEW_SIZE,
        VIEW_SIZE
      );

      const blockKm = 2;

      const blockPx =
        blockKm *
        props.pxPerKm;

      if (blockPx >= 6) {
        const startX =
          Math.floor(
            (
              props.cameraX -
              props.visibleKm / 2
            ) /
              blockKm
          ) -
          2;

        const endX =
          Math.ceil(
            (
              props.cameraX +
              props.visibleKm / 2
            ) /
              blockKm
          ) +
          2;

        const startY =
          Math.floor(
            (
              props.cameraY -
              props.visibleKm / 2
            ) /
              blockKm
          ) -
          2;

        const endY =
          Math.ceil(
            (
              props.cameraY +
              props.visibleKm / 2
            ) /
              blockKm
          ) +
          2;

        for (
          let x = startX;
          x <= endX;
          x++
        ) {
          for (
            let y = startY;
            y <= endY;
            y++
          ) {
            const screenX =
              VIEW_SIZE / 2 +
              (
                x * blockKm -
                props.cameraX
              ) *
                props.pxPerKm;

            const screenY =
              VIEW_SIZE / 2 +
              (
                y * blockKm -
                props.cameraY
              ) *
                props.pxPerKm;

            const seed =
              Math.abs(
                x * 73856093 +
                y * 19349663
              );

            const gap =
              Math.max(
                1,
                blockPx * 0.14
              );

            context.fillStyle =
              seed % 43 === 0
                ? "#234b32"
                : seed % 79 ===
                  0
                ? "#183f52"
                : [
                    "#56616c",
                    "#46525e",
                    "#626c76",
                    "#394651",
                    "#4d5965",
                  ][
                    seed % 5
                  ];

            context.fillRect(
              screenX +
                gap / 2,

              screenY +
                gap / 2,

              Math.max(
                1,
                blockPx -
                  gap
              ),

              Math.max(
                1,
                blockPx -
                  gap
              )
            );

            if (
              blockPx >= 20
            ) {
              const inner =
                Math.max(
                  2,
                  blockPx * 0.19
                );

              context.fillStyle =
                "rgba(15,23,42,0.45)";

              context.fillRect(
                screenX +
                  blockPx *
                    0.22,

                screenY +
                  blockPx *
                    0.22,

                inner,

                inner
              );

              context.fillRect(
                screenX +
                  blockPx *
                    0.58,

                screenY +
                  blockPx *
                    0.55,

                inner,

                inner
              );
            }
          }
        }
      } else {
        /*
          Low-detail repeating pattern.

          This prevents huge numbers of
          blocks being generated when zoomed out.
        */

        const rawCellKm =
          props.visibleKm /
          28;

        const options = [
          10,
          20,
          50,
          100,
          200,
          500,
          1000,
          2000,
          5000,
          10000,
          20000,
          50000,
          100000,
          200000,
          500000,
          1000000,
        ];

        let cellKm =
          options[
            options.length -
              1
          ];

        for (
          const option of
          options
        ) {
          if (
            option >=
            rawCellKm
          ) {
            cellKm =
              option;

            break;
          }
        }

        const cellPx =
          cellKm *
          props.pxPerKm;

        const startX =
          Math.floor(
            (
              props.cameraX -
              props.visibleKm / 2
            ) /
              cellKm
          ) -
          2;

        const endX =
          Math.ceil(
            (
              props.cameraX +
              props.visibleKm / 2
            ) /
              cellKm
          ) +
          2;

        const startY =
          Math.floor(
            (
              props.cameraY -
              props.visibleKm / 2
            ) /
              cellKm
          ) -
          2;

        const endY =
          Math.ceil(
            (
              props.cameraY +
              props.visibleKm / 2
            ) /
              cellKm
          ) +
          2;

        for (
          let x = startX;
          x <= endX;
          x++
        ) {
          for (
            let y = startY;
            y <= endY;
            y++
          ) {
            const screenX =
              VIEW_SIZE / 2 +
              (
                x * cellKm -
                props.cameraX
              ) *
                props.pxPerKm;

            const screenY =
              VIEW_SIZE / 2 +
              (
                y * cellKm -
                props.cameraY
              ) *
                props.pxPerKm;

            const seed =
              Math.abs(
                x * 92821 +
                y * 68917
              );

            context.fillStyle =
              seed % 11 === 0
                ? "#234b32"
                : seed % 17 ===
                  0
                ? "#183f52"
                : seed % 5 ===
                  0
                ? "#46525e"
                : "#303c48";

            context.fillRect(
              screenX + 1,
              screenY + 1,

              Math.max(
                1,
                cellPx - 2
              ),

              Math.max(
                1,
                cellPx - 2
              )
            );
          }
        }
      }
    },
    [
      props.pxPerKm,
      props.cameraX,
      props.cameraY,
      props.visibleKm,
    ]
  );

  return (
    <canvas
      ref={
        ref
      }

      style={{
        position:
          "absolute",

        inset: 0,

        width:
          "100%",

        height:
          "100%",

        pointerEvents:
          "none",
      }}
    />
  );
}

/* =========================================================
   TESTS
   ========================================================= */

function runSanityTests() {
  console.assert(
    Math.abs(
      joulesToKilotons(
        KT_TO_JOULES
      ) -
        1
    ) <
      1e-9,

    "1 kt conversion failed"
  );

  const littleBoy =
    BOMB_PRESETS.find(
      preset =>
        preset.id ===
        "little-boy"
    );

  console.assert(
    littleBoy?.yieldKt ===
      15,

    "Little Boy should be 15 kt"
  );

  const atomic =
    buildBombSimulation(
      15,
      "atomic",
      littleBoy ?? null
    );

  console.assert(
    atomic.rings.some(
      ring =>
        ring.name.includes(
          "Prompt"
        )
    ),

    "Atomic model should contain prompt radiation"
  );

  console.assert(
    atomic.rings.some(
      ring =>
        ring.name.includes(
          "Fallout"
        )
    ),

    "Atomic model should contain fallout"
  );

  const antimatter =
    buildBombSimulation(
      1_000_000,
      "antimatter",
      null
    );

  console.assert(
    !antimatter.rings.some(
      ring =>
        ring.name.includes(
          "Fallout"
        )
    ),

    "Antimatter should not contain conventional fallout"
  );

  const quake =
    buildEarthquakeSimulation(
      9.5,
      15
    );

  const felt =
    quake.rings.find(
      ring =>
        ring.name.includes(
          "MMI III"
        )
    );

  console.assert(
    (
      felt?.radiusKm ??
      Infinity
    ) <
      2000,

    "M9.5 earthquake should not have a 10,000 km felt radius"
  );

  const geodesic =
    createGeodesicCircle(
      0,
      0,
      100
    );

  console.assert(
    geodesic.geometry
      .coordinates[0]
      .length ===
      129,

    "Geodesic circle generation failed"
  );

  console.assert(
    Math.abs(
      haversineDistanceKm(
        0,
        0,
        0,
        1
      ) -
        111.2
    ) <
      1,

    "Earth distance calculation failed"
  );

  console.assert(
    LOCAL_EARTH_PMTILES ===
      "/maps/earth.pmtiles",

    "Local Earth PMTiles path changed unexpectedly"
  );
}

runSanityTests();