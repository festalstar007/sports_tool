import type { Activity, ConfirmedActivityInput, RecognitionResult, SportType } from '../shared/activity-schema';
import { formatDuration, formatPace, toDateTimeLocal } from '../shared/units';

export type ActivityFormValues = {
  sportType: SportType | '';
  startedAtLocal: string;
  distanceKm: string;
  duration: string;
  caloriesKcal: string;
  avgPace: string;
  avgSpeedKmh: string;
  avgCadenceSpm: string;
  avgStrideCm: string;
  steps: string;
  avgHeartRateBpm: string;
  elevationGainMeters: string;
  elevationLossMeters: string;
};

const stringValue = (value: number | null | undefined) => (value == null ? '' : String(value));

export function emptyActivityForm(sportType: SportType | '' = ''): ActivityFormValues {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 16);
  return {
    sportType,
    startedAtLocal: shanghai,
    distanceKm: '',
    duration: '',
    caloriesKcal: '',
    avgPace: '',
    avgSpeedKmh: '',
    avgCadenceSpm: '',
    avgStrideCm: '',
    steps: '',
    avgHeartRateBpm: '',
    elevationGainMeters: '',
    elevationLossMeters: '',
  };
}

export function recognitionToForm(extraction: RecognitionResult | null): ActivityFormValues {
  if (!extraction) return emptyActivityForm();
  return {
    sportType: extraction.sportType ?? '',
    startedAtLocal: extraction.startedAtLocal?.slice(0, 16) ?? emptyActivityForm().startedAtLocal,
    distanceKm: extraction.distanceMeters == null ? '' : String(extraction.distanceMeters / 1000),
    duration: extraction.durationSeconds == null ? '' : formatDuration(extraction.durationSeconds),
    caloriesKcal: stringValue(extraction.caloriesKcal),
    avgPace: extraction.avgPaceSecondsPerKm == null ? '' : formatPace(extraction.avgPaceSecondsPerKm),
    avgSpeedKmh: stringValue(extraction.avgSpeedKmh),
    avgCadenceSpm: stringValue(extraction.avgCadenceSpm),
    avgStrideCm: stringValue(extraction.avgStrideCm),
    steps: stringValue(extraction.steps),
    avgHeartRateBpm: stringValue(extraction.avgHeartRateBpm),
    elevationGainMeters: stringValue(extraction.elevationGainMeters),
    elevationLossMeters: stringValue(extraction.elevationLossMeters),
  };
}

export function activityToForm(activity: Activity): ActivityFormValues {
  return {
    sportType: activity.sportType,
    startedAtLocal: toDateTimeLocal(activity.startedAt),
    distanceKm: String(activity.distanceMeters / 1000),
    duration: formatDuration(activity.durationSeconds),
    caloriesKcal: stringValue(activity.caloriesKcal),
    avgPace: activity.avgPaceSecondsPerKm == null ? '' : formatPace(activity.avgPaceSecondsPerKm),
    avgSpeedKmh: stringValue(activity.avgSpeedKmh),
    avgCadenceSpm: stringValue(activity.avgCadenceSpm),
    avgStrideCm: stringValue(activity.avgStrideCm),
    steps: stringValue(activity.steps),
    avgHeartRateBpm: stringValue(activity.avgHeartRateBpm),
    elevationGainMeters: stringValue(activity.elevationGainMeters),
    elevationLossMeters: stringValue(activity.elevationLossMeters),
  };
}

export type FormParseResult =
  | { ok: true; data: ConfirmedActivityInput }
  | { ok: false; message: string };
