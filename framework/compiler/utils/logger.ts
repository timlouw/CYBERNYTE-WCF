// ============================================================================
// Unified Logging Utility
// ============================================================================

import { consoleColors } from './colors.js';

type LogLevel = 'info' | 'warn' | 'error' | 'success';

interface LogMessage {
  plugin: string;
  message: string;
  details?: string;
}

/**
 * Unified logger for compiler plugins.
 * Provides consistent formatting across all plugins.
 */
class CompilerLogger {
  /**
   * Log an info message
   */
  info(plugin: string, message: string, details?: string): void {
    this.print('info', { plugin, message, details });
  }

  /**
   * Log a success message (green)
   */
  success(plugin: string, message: string): void {
    this.print('success', { plugin, message });
  }

  /**
   * Log a warning message (yellow)
   */
  warn(plugin: string, message: string, details?: string): void {
    this.print('warn', { plugin, message, details });
  }

  /**
   * Log an error message (red) with optional error object
   */
  error(plugin: string, message: string, error?: unknown): void {
    const details = error instanceof Error ? error.message : error ? String(error) : undefined;
    this.print('error', { plugin, message, details });
  }

  private print(level: LogLevel, { plugin, message, details }: LogMessage): void {
    const prefix = `[${plugin}]`;
    const color = this.getColor(level);

    if (details) {
      console.log(color, `${prefix} ${message}: ${details}`);
    } else {
      console.log(color, `${prefix} ${message}`);
    }
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case 'success':
        return consoleColors.green;
      case 'warn':
        return consoleColors.yellow;
      case 'error':
        return consoleColors.red;
      default:
        return consoleColors.cyan;
    }
  }
}

// Singleton instance
export const logger = new CompilerLogger();
