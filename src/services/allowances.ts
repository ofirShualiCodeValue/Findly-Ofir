/**
 * Israeli labor allowances applied per shift.
 *
 * Defaults are intentionally hard-coded constants — each is a business rule
 * the spec specified by exact value. If we ever need per-employee overrides,
 * the right place is to add nullable columns on `employee_profiles` and prefer
 * those over these defaults at compute time.
 */
export const FOOD_ALLOWANCE_PER_SHIFT_NIS = 70;
export const TRAVEL_RATE_PER_KM_NIS = 0.7;
// One-way distance under this threshold gets no travel allowance.
// Spec phrases it as "round-trip > 90km", which is one-way > 45km.
export const TRAVEL_FREE_THRESHOLD_ONE_WAY_KM = 45;

export interface ShiftAllowances {
  food_nis: number;
  travel_nis: number;
  travel_distance_km: number;
  total_nis: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle ("Air distance") between two points using the Haversine formula.
 * Inputs in decimal degrees; output in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Travel allowance in NIS for a one-way distance.
 * Round-trip kilometers above 90 (i.e. one-way above 45) are paid at TRAVEL_RATE_PER_KM_NIS each.
 */
export function travelAllowanceNis(oneWayKm: number): number {
  if (!Number.isFinite(oneWayKm) || oneWayKm <= TRAVEL_FREE_THRESHOLD_ONE_WAY_KM) {
    return 0;
  }
  const billableOneWayKm = oneWayKm - TRAVEL_FREE_THRESHOLD_ONE_WAY_KM;
  const billableRoundTripKm = billableOneWayKm * 2;
  return Math.round(billableRoundTripKm * TRAVEL_RATE_PER_KM_NIS * 100) / 100;
}

/**
 * Combined per-shift allowances given the employee's home and the event location.
 * Returns zero travel when any coordinate is missing — caller decides whether to surface that.
 */
export function shiftAllowances(input: {
  homeLat: number | null;
  homeLng: number | null;
  eventLat: number | null;
  eventLng: number | null;
}): ShiftAllowances {
  const { homeLat, homeLng, eventLat, eventLng } = input;
  const hasCoords =
    homeLat !== null && homeLng !== null && eventLat !== null && eventLng !== null;

  const distance = hasCoords
    ? haversineDistanceKm(homeLat as number, homeLng as number, eventLat as number, eventLng as number)
    : 0;
  const travel = hasCoords ? travelAllowanceNis(distance) : 0;

  return {
    food_nis: FOOD_ALLOWANCE_PER_SHIFT_NIS,
    travel_nis: travel,
    travel_distance_km: Math.round(distance * 100) / 100,
    total_nis: Math.round((FOOD_ALLOWANCE_PER_SHIFT_NIS + travel) * 100) / 100,
  };
}
