import type { Rectangle } from './Rectangle';

export const ProximityTriggerCause = {
  MOVEMENT: 'movement',
  LIST_UPDATE: 'list_update',
  INITIAL_POSITION: 'initial_position',
};

export const ProximityState = {
  INSIDE: 'inside',
  OUTSIDE: 'outside',
};

export const isNearTop =
  (threshold: number) => (listRect: Rectangle, viewportRect: Rectangle) =>
    viewportRect.getTop() - listRect.getTop() <= threshold;
export const isNearBottom =
  (threshold: number) => (listRect: Rectangle, viewportRect: Rectangle) =>
    listRect.getBottom() - viewportRect.getBottom() <= threshold;
export const isNearTopRatio =
  (ratio: number) => (listRect: Rectangle, viewportRect: Rectangle) => {
    const threshold = viewportRect.getHeight() * ratio;
    return viewportRect.getTop() - listRect.getTop() <= threshold;
  };
export const isNearBottomRatio =
  (ratio: number) => (listRect: Rectangle, viewportRect: Rectangle) => {
    const threshold = viewportRect.getHeight() * ratio;
    return listRect.getBottom() - viewportRect.getBottom() <= threshold;
  };

export const calculateProximityTrigger = (
  prevProximity,
  prevListLength,
  currentProximity,
  currentListLength,
) => {
  const wasOutside_nowInside =
    !prevProximity && currentProximity === ProximityState.INSIDE;
  const wasOutside_becameInside =
    prevProximity === ProximityState.OUTSIDE &&
    currentProximity === ProximityState.INSIDE;
  const stayedInside_listChanged =
    prevProximity === ProximityState.INSIDE &&
    currentProximity === ProximityState.INSIDE &&
    currentListLength !== prevListLength;

  if (wasOutside_nowInside) return ProximityTriggerCause.INITIAL_POSITION;
  if (wasOutside_becameInside) return ProximityTriggerCause.MOVEMENT;
  if (stayedInside_listChanged) return ProximityTriggerCause.LIST_UPDATE;
  return null;
};

export class ProximityZoneManager {
  constructor(zoneDefinitions) {
    this._zones = zoneDefinitions.map((zone) => ({
      zone,
      state: {}, // Stores { proximity, listLength } for each zone
    }));
  }

  handlePositioningUpdate(positioningData) {
    this._zones.forEach(({ state, zone }) => {
      const { callback, condition } = zone;
      const { listLength: prevListLength, proximity: prevProximity } = state;

      const currentProximity = condition(
        positioningData.getForList(),
        positioningData.getForViewport(),
      )
        ? ProximityState.INSIDE
        : ProximityState.OUTSIDE;
      const currentListLength = positioningData.getListLength();

      const triggerCause = calculateProximityTrigger(
        prevProximity,
        prevListLength,
        currentProximity,
        currentListLength,
      );

      // Update state
      state.proximity = currentProximity;
      state.listLength = currentListLength;

      // Trigger callback if needed
      if (triggerCause) {
        callback({ triggerCause });
      }
    });
  }
}
