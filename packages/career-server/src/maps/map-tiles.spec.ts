import { UnconfiguredMapTiles } from './map-tiles';

describe('UnconfiguredMapTiles', () => {
  it('keeps tiles, coordinates, and attribution unset', () => {
    expect(new UnconfiguredMapTiles().sessionView()).toEqual({
      minutes: 15,
      approximate: true,
      tiles: null,
      coordinates: null,
      attribution: null,
      provider: null,
    });
  });
});
