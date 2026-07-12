# MobileInput API

`MobileInput` is a framework-free, mobile-first input layer. It creates its own
Shadow DOM overlay, so its joystick/button styles never leak into the game UI.
It has no Three.js dependency.

## Use it

```ts
import { MobileInput } from './input/MobileInput';

const input = new MobileInput(); // Appends its overlay to document.body.

function updatePlayer(): void {
  const move = input.movement;
  player.move(move.x, move.y); // x: left/right; y: backward/forward

  const look = input.consumeLookDelta();
  cameraYaw -= look.x * 0.004;
  cameraPitch -= look.y * 0.004;

  // Positive = fingers moving apart. Map it to camera distance to taste.
  cameraDistance -= input.consumeZoomDelta() * 0.015;

  if (input.consumeJumpPressed()) {
    player.jump();
  }
}

// Call during scene teardown/HMR cleanup.
input.destroy();
```

Pass `{ mount: someElement, joystickRadius: 64 }` to choose an overlay host or
change the stick size. The overlay uses a fixed viewport position, so mounting
to `document.body` is recommended.

## Controls

- Left stick: movement. Screen-up is positive `movement.y` (forward).
- Right half of the screen: one-finger drag accumulates look deltas.
- Two fingers within the right camera area: pinch accumulates zoom delta.
- Orange `JUMP` button: queues an action press; `jumpHeld` is available for
  variable-height jumps.
- Keyboard fallback: WASD / arrow keys move and Space jumps. These keys avoid
  browser scrolling while the player is not typing in a form field.

`consumeLookDelta()`, `consumeZoomDelta()`, and `consumeJumpPressed()` clear
their values when read, so call them once per game update. `destroy()` removes
all controls and listeners and can safely be called more than once.
