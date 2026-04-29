import { Severity } from '../enums/severity.enum';

/**
 * Returns the debounce window TTL in seconds based on signal severity.
 * P0 (critical) → 5 s  — fast escalation
 * P1 (high)     → 10 s — standard window
 * P2 (low)      → 30 s — allow more signals to batch
 */
export function getDebounceWindowSeconds(severity: Severity): number {
  switch (severity) {
    case Severity.P0:
      return 5;
    case Severity.P1:
      return 10;
    case Severity.P2:
      return 30;
    default:
      return 10;
  }
}
