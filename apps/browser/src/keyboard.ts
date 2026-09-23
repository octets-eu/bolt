import { Bolt } from '@bolt/core';
import { Bolts } from './bolts';

/**
 * Keyboard control for every connected Bolt. Replaces the Mousetrap bindings
 * the driver used to own. Keys are ignored while typing into a field.
 */
const bindings: { [key: string]: (bolt: Bolt) => Promise<unknown> | void } = {
  ' ':          (bolt) => {
    bolt.log('event', 'key:space');
    return bolt.lifecycle.fullstop();
  },
  'Escape':     (bolt) => { bolt.log('event', 'key:esc'); },
  'ArrowUp':    (bolt) => {
    bolt.log('event', 'key:up');
    return bolt.actuators.motor.roll(25, bolt.heading);
  },
  'ArrowDown':  (bolt) => {
    bolt.log('event', 'key:down');
    return bolt.actuators.motor.roll(25, bolt.heading - 180);
  },
  'ArrowLeft':  (bolt) => {
    bolt.log('event', 'key:left');
    return bolt.navigation.rotate(-30);
  },
  'ArrowRight': (bolt) => {
    bolt.log('event', 'key:right');
    return bolt.navigation.rotate(+30);
  },
};

export function installKeyboard () {

  window.addEventListener('keydown', (event: KeyboardEvent) => {

    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    const binding = bindings[event.key];
    if (!binding) return;

    event.preventDefault();
    Bolts.forEach((bolt: Bolt) => {
      if (bolt.connected) Promise.resolve(binding(bolt)).catch((e) => bolt.log('warn', `key ${event.key}: ${String(e)}`));
    });

  });

}
