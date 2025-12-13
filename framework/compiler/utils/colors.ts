// ============================================================================
// Console Colors - ANSI escape codes for terminal output
// ============================================================================

export const consoleColors = {
  green: '\x1b[32m%s\x1b[0m',
  yellow: '\x1b[33m%s\x1b[0m',
  blue: '\x1b[94m%s\x1b[0m',
  cyan: '\x1b[36m%s\x1b[0m',
  red: '\x1b[31m%s\x1b[0m',
  orange: '\x1b[38;5;208m%s\x1b[0m',
  reset: '\x1b[0m',
} as const;

export type ConsoleColor = keyof typeof consoleColors;
