export type Screen = 'title' | 'playing' | 'paused' | 'map' | 'registry' | 'cityComplete';

/** Leaving the tab mid-game should greet the player with the pause menu when they come back. */
export function screenOnHide(screen: Screen): Screen {
  return screen === 'playing' ? 'paused' : screen;
}
