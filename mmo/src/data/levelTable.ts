// EXP required to reach each level (cumulative)
const LEVEL_TABLE: number[] = [
  0,     // Lv 1 (start)
  20,    // Lv 2
  70,    // Lv 3
  170,   // Lv 4
  350,   // Lv 5
  650,   // Lv 6
  1100,  // Lv 7
  1750,  // Lv 8
  2650,  // Lv 9
  3850,  // Lv 10
];

const MAX_LEVEL = LEVEL_TABLE.length;

/** Get cumulative EXP needed for a given level */
export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return Infinity;
  return LEVEL_TABLE[level - 1];
}

/** Calculate how many levels gained from current state */
export function calculateLevelUps(currentLevel: number, totalExp: number): number {
  let gained = 0;
  let lv = currentLevel;
  while (lv < MAX_LEVEL && totalExp >= expForLevel(lv + 1)) {
    lv++;
    gained++;
  }
  return gained;
}

export { MAX_LEVEL };
