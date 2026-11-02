import { mapSessionView } from '@flacroncv/career-shared';
import type { MapSessionView } from '@flacroncv/career-shared';

/**
 * Visual map tiles go through this interface. This build keeps tiles,
 * coordinates, attribution, and provider null until a vendor is bound.
 */
export interface MapTiles {
  sessionView(): MapSessionView;
}

export class UnconfiguredMapTiles implements MapTiles {
  sessionView(): MapSessionView {
    return mapSessionView();
  }
}
