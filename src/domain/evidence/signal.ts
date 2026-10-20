import type { MeasurementQuality, Opportunity, Outcome, Processing } from './types.js';

export type SignalLimitReason = 'REQUIRED_SIGNAL_MISSING' | 'TECHNICAL_ERROR' | 'MISSING_DATA' | 'MEASUREMENT_QUALITY' | 'NO_OPPORTUNITY' | 'OPPORTUNITY_UNKNOWN';

export interface SignalInput {
  /** Pre-invocation tier: the mandatory signal for this judgement exists (e.g. audio for pronunciation). */
  required_signal_present: boolean;
  processing: Processing;
  measurement_quality: MeasurementQuality;
  opportunity: Opportunity;
}

/**
 * Two-tier signal check (04 §2.C, 01 §5.2, 01 Bước 9): a judgement is never stronger than its signal.
 * Protection is two-way — poor signal blocks both "met" and "not_met"; absent opportunity is not a failure.
 */
export function limitBySignal(proposed: Outcome, s: SignalInput): { outcome: Outcome; processing: Processing; reasons: SignalLimitReason[] } {
  const reasons: SignalLimitReason[] = [];
  let processing = s.processing;
  if (!s.required_signal_present) { reasons.push('REQUIRED_SIGNAL_MISSING'); if (processing === 'processed') processing = 'missing_data'; }
  if (processing === 'technical_error') reasons.push('TECHNICAL_ERROR');
  if (processing === 'missing_data' && s.required_signal_present) reasons.push('MISSING_DATA');
  if (s.measurement_quality !== 'sufficient') reasons.push('MEASUREMENT_QUALITY');
  if (s.opportunity === 'absent') reasons.push('NO_OPPORTUNITY');
  if (s.opportunity === 'unknown') reasons.push('OPPORTUNITY_UNKNOWN');
  return { outcome: reasons.length > 0 ? 'inconclusive' : proposed, processing, reasons };
}
