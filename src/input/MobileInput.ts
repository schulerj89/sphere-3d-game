/**
 * Touch and keyboard controls for a mobile-first 3D game.
 *
 * `movement.y` is forward when positive (up on the virtual stick), while
 * `movement.x` is right when positive. Look and zoom values are accumulated
 * between reads so a fixed-step game loop does not lose input.
 */
export interface MovementVector {
  readonly x: number;
  readonly y: number;
}

export interface LookDelta {
  readonly x: number;
  readonly y: number;
}

export interface MobileInputOptions {
  /** Element that receives the self-contained control overlay. Defaults to `document.body`. */
  readonly mount?: HTMLElement;
  /** Radius of the visible virtual joystick in CSS pixels. Defaults to 58. */
  readonly joystickRadius?: number;
}

type PointerPoint = {
  x: number;
  y: number;
};

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);

// Keep attack separate from the jump action so keyboard and touch users can
// chain a weapon strike without accidentally launching Nova into the air.
const ATTACK_KEYS = new Set(['KeyF', 'KeyX']);

const INPUT_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false };

/**
 * Builds a fixed, shadow-DOM-contained control overlay and records input for a
 * game loop to consume. It does not depend on Three.js and is safe to use in
 * any browser-rendered game.
 */
export class MobileInput {
  private readonly abortController = new AbortController();
  private readonly host: HTMLDivElement;
  private readonly joystick: HTMLDivElement;
  private readonly joystickKnob: HTMLDivElement;
  private readonly lookSurface: HTMLDivElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly attackButton: HTMLButtonElement;
  private readonly joystickRadius: number;
  private readonly keyboardKeys = new Set<string>();
  private readonly lookPointers = new Map<number, PointerPoint>();

  private destroyed = false;
  private joystickPointerId: number | null = null;
  private actionPointerId: number | null = null;
  private attackPointerId: number | null = null;
  private joystickX = 0;
  private joystickY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private zoomDelta = 0;
  private pinchDistance: number | null = null;
  private jumpPressed = false;
  private attackPressed = false;
  private lastTouchEndAt = Number.NEGATIVE_INFINITY;

  constructor(options: MobileInputOptions = {}) {
    if (typeof document === 'undefined') {
      throw new Error('MobileInput requires a browser document.');
    }

    this.joystickRadius = clamp(options.joystickRadius ?? 58, 36, 96);

    const mount = options.mount ?? document.body;
    this.host = document.createElement('div');
    this.host.setAttribute('data-mobile-input', '');
    const shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = createControlStyles(this.joystickRadius);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    this.lookSurface = document.createElement('div');
    this.lookSurface.className = 'look-surface control';
    this.lookSurface.setAttribute('aria-label', 'Camera look area');

    this.joystick = document.createElement('div');
    this.joystick.className = 'joystick control';
    this.joystick.setAttribute('role', 'application');
    this.joystick.setAttribute('aria-label', 'Movement joystick');

    this.joystickKnob = document.createElement('div');
    this.joystickKnob.className = 'joystick-knob';
    this.joystick.append(this.joystickKnob);

    this.actionButton = document.createElement('button');
    this.actionButton.type = 'button';
    this.actionButton.className = 'action control';
    this.actionButton.setAttribute('aria-label', 'Jump');
    this.actionButton.textContent = 'JUMP';

    this.attackButton = document.createElement('button');
    this.attackButton.type = 'button';
    this.attackButton.className = 'attack control';
    this.attackButton.setAttribute('aria-label', 'Attack');
    this.attackButton.textContent = 'ATTACK';

    overlay.append(this.lookSurface, this.joystick, this.actionButton, this.attackButton);
    shadow.append(style, overlay);
    mount.append(this.host);

    this.bindEvents();
  }

  /**
   * Current combined joystick and keyboard movement, normalized to a maximum
   * length of 1. `x` is left/right and `y` is backward/forward.
   */
  get movement(): MovementVector {
    if (this.destroyed) {
      return { x: 0, y: 0 };
    }

    const keyboardX = Number(this.isKeyHeld('KeyD') || this.isKeyHeld('ArrowRight'))
      - Number(this.isKeyHeld('KeyA') || this.isKeyHeld('ArrowLeft'));
    const keyboardY = Number(this.isKeyHeld('KeyW') || this.isKeyHeld('ArrowUp'))
      - Number(this.isKeyHeld('KeyS') || this.isKeyHeld('ArrowDown'));

    return normalize(this.joystickX + keyboardX, this.joystickY + keyboardY);
  }

  /** Returns and clears accumulated right-side drag movement in CSS pixels. */
  consumeLookDelta(): LookDelta {
    const delta = { x: this.lookDeltaX, y: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return delta;
  }

  /**
   * Returns and clears accumulated pinch distance in CSS pixels. A positive
   * value means the two fingers moved apart; a negative value means they moved
   * together.
   */
  consumeZoomDelta(): number {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
  }

  /** Returns true once for each new jump/action press, then clears the press. */
  consumeJumpPressed(): boolean {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }

  /** Returns true once for each new weapon attack press, then clears it. */
  consumeAttackPressed(): boolean {
    const pressed = this.attackPressed;
    this.attackPressed = false;
    return pressed;
  }

  /** True while Space or the on-screen jump button remains held. */
  get jumpHeld(): boolean {
    return !this.destroyed && (this.actionPointerId !== null || this.isKeyHeld('Space'));
  }

  /** Fades the touch controls out of cinematic shots without destroying input state. */
  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.host.style.opacity = visible ? '1' : '0';
    this.host.style.pointerEvents = visible ? 'auto' : 'none';
  }

  /** Removes the overlay and every event listener. Safe to call more than once. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.releasePointerCapture(this.joystick, this.joystickPointerId);
    this.releasePointerCapture(this.actionButton, this.actionPointerId);
    this.releasePointerCapture(this.attackButton, this.attackPointerId);
    for (const pointerId of this.lookPointers.keys()) {
      this.releasePointerCapture(this.lookSurface, pointerId);
    }

    this.abortController.abort();
    this.keyboardKeys.clear();
    this.lookPointers.clear();
    this.joystickPointerId = null;
    this.actionPointerId = null;
    this.attackPointerId = null;
    this.host.remove();
  }

  private bindEvents(): void {
    const signal = this.abortController.signal;

    this.joystick.addEventListener('pointerdown', this.handleJoystickDown, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.joystick.addEventListener('pointermove', this.handleJoystickMove, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.joystick.addEventListener('pointerup', this.handleJoystickEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.joystick.addEventListener('pointercancel', this.handleJoystickEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.joystick.addEventListener('lostpointercapture', this.handleJoystickLostCapture, { signal });

    this.lookSurface.addEventListener('pointerdown', this.handleLookDown, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.lookSurface.addEventListener('pointermove', this.handleLookMove, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.lookSurface.addEventListener('pointerup', this.handleLookEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.lookSurface.addEventListener('pointercancel', this.handleLookEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.lookSurface.addEventListener('lostpointercapture', this.handleLookLostCapture, { signal });

    this.actionButton.addEventListener('pointerdown', this.handleActionDown, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.actionButton.addEventListener('pointerup', this.handleActionEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.actionButton.addEventListener('pointercancel', this.handleActionEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.actionButton.addEventListener('lostpointercapture', this.handleActionLostCapture, { signal });
    this.actionButton.addEventListener('click', this.handleActionClick, { signal });

    this.attackButton.addEventListener('pointerdown', this.handleAttackDown, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.attackButton.addEventListener('pointerup', this.handleAttackEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.attackButton.addEventListener('pointercancel', this.handleAttackEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    this.attackButton.addEventListener('lostpointercapture', this.handleAttackLostCapture, { signal });
    this.attackButton.addEventListener('click', this.handleAttackClick, { signal });

    for (const control of [this.joystick, this.lookSurface, this.actionButton, this.attackButton]) {
      control.addEventListener('contextmenu', this.preventDefault, { signal });
    }

    window.addEventListener('pointerup', this.handleWindowPointerEnd, { signal });
    window.addEventListener('pointercancel', this.handleWindowPointerEnd, { signal });
    // `touch-action: none` covers modern browsers, but iOS Safari can still
    // promote two quick taps into a viewport zoom when the tap lands between
    // controls. Cancel only that second tap (our pointer handlers continue to
    // receive the input), while leaving two-finger pinch available for the
    // in-game camera distance control.
    window.addEventListener('touchstart', this.handleTouchStart, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    window.addEventListener('touchend', this.handleTouchEnd, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(eventName, this.preventDefault, {
        ...INPUT_LISTENER_OPTIONS,
        signal,
      });
    }
    window.addEventListener('keydown', this.handleKeyDown, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    window.addEventListener('keyup', this.handleKeyUp, {
      ...INPUT_LISTENER_OPTIONS,
      signal,
    });
    window.addEventListener('blur', this.clearTransientInput, { signal });
    document.addEventListener('visibilitychange', this.handleVisibilityChange, { signal });
  }

  private readonly handleJoystickDown = (event: PointerEvent): void => {
    if (this.joystickPointerId !== null || !isPrimaryButton(event)) {
      return;
    }

    this.preventEventDefault(event);
    this.joystickPointerId = event.pointerId;
    this.capturePointer(this.joystick, event.pointerId);
    this.updateJoystick(event.clientX, event.clientY);
  };

  private readonly handleJoystickMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    this.preventEventDefault(event);
    this.updateJoystick(event.clientX, event.clientY);
  };

  private readonly handleJoystickEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    this.preventEventDefault(event);
    this.resetJoystick();
  };

  private readonly handleJoystickLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.joystickPointerId) {
      this.resetJoystick();
    }
  };

  private readonly handleLookDown = (event: PointerEvent): void => {
    if (this.lookPointers.size >= 2 || !isPrimaryButton(event)) {
      return;
    }

    this.preventEventDefault(event);
    this.lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.capturePointer(this.lookSurface, event.pointerId);
    this.pinchDistance = this.getPinchDistance();
  };

  private readonly handleLookMove = (event: PointerEvent): void => {
    const previous = this.lookPointers.get(event.pointerId);
    if (previous === undefined) {
      return;
    }

    this.preventEventDefault(event);
    const next = { x: event.clientX, y: event.clientY };

    if (this.lookPointers.size === 1) {
      this.lookDeltaX += next.x - previous.x;
      this.lookDeltaY += next.y - previous.y;
    }

    this.lookPointers.set(event.pointerId, next);

    if (this.lookPointers.size === 2) {
      const nextDistance = this.getPinchDistance();
      if (nextDistance !== null && this.pinchDistance !== null) {
        this.zoomDelta += nextDistance - this.pinchDistance;
      }
      this.pinchDistance = nextDistance;
    }
  };

  private readonly handleLookEnd = (event: PointerEvent): void => {
    if (!this.lookPointers.has(event.pointerId)) {
      return;
    }

    this.preventEventDefault(event);
    this.removeLookPointer(event.pointerId);
  };

  private readonly handleLookLostCapture = (event: PointerEvent): void => {
    this.removeLookPointer(event.pointerId);
  };

  private readonly handleActionDown = (event: PointerEvent): void => {
    if (this.actionPointerId !== null || !isPrimaryButton(event)) {
      return;
    }

    this.preventEventDefault(event);
    this.actionPointerId = event.pointerId;
    this.actionButton.classList.add('is-pressed');
    this.capturePointer(this.actionButton, event.pointerId);
    this.jumpPressed = true;
  };

  private readonly handleActionEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.actionPointerId) {
      return;
    }

    this.preventEventDefault(event);
    this.resetAction();
  };

  private readonly handleActionLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.actionPointerId) {
      this.resetAction();
    }
  };

  private readonly handleAttackDown = (event: PointerEvent): void => {
    if (this.attackPointerId !== null || !isPrimaryButton(event)) {
      return;
    }

    this.preventEventDefault(event);
    this.attackPointerId = event.pointerId;
    this.attackButton.classList.add('is-pressed');
    this.capturePointer(this.attackButton, event.pointerId);
    this.attackPressed = true;
  };

  private readonly handleAttackEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.attackPointerId) {
      return;
    }

    this.preventEventDefault(event);
    this.resetAttack();
  };

  private readonly handleAttackLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.attackPointerId) {
      this.resetAttack();
    }
  };

  private readonly handleAttackClick = (event: MouseEvent): void => {
    // Keyboard activation creates a detail-free click. Pointer presses are
    // already queued on pointerdown, so this avoids duplicate touch presses.
    if (event.detail === 0) {
      this.attackPressed = true;
    }
  };

  private readonly handleActionClick = (event: MouseEvent): void => {
    // Keyboard activation creates a detail-free click. Pointer presses are
    // already queued on pointerdown, so this avoids duplicate touch presses.
    if (event.detail === 0) {
      this.jumpPressed = true;
    }
  };

  private readonly handleWindowPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.joystickPointerId) {
      this.resetJoystick();
    }
    if (event.pointerId === this.actionPointerId) {
      this.resetAction();
    }
    if (event.pointerId === this.attackPointerId) {
      this.resetAttack();
    }
    this.removeLookPointer(event.pointerId);
  };

  private readonly handleTouchStart = (event: TouchEvent): void => {
    const now = performance.now();
    if (event.touches.length === 1 && now - this.lastTouchEndAt < 320) {
      this.preventEventDefault(event);
    }
  };

  private readonly handleTouchEnd = (event: TouchEvent): void => {
    const now = performance.now();
    if (now - this.lastTouchEndAt < 320) {
      this.preventEventDefault(event);
    }
    this.lastTouchEndAt = now;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || isTextEntryTarget(event.target) || !isSupportedKey(event.code)) {
      return;
    }

    this.preventEventDefault(event);
    const wasHeld = this.keyboardKeys.has(event.code);
    this.keyboardKeys.add(event.code);

    if (event.code === 'Space' && !wasHeld) {
      this.jumpPressed = true;
    } else if (ATTACK_KEYS.has(event.code) && !wasHeld) {
      this.attackPressed = true;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!isSupportedKey(event.code)) {
      return;
    }

    if (!isTextEntryTarget(event.target)) {
      this.preventEventDefault(event);
    }
    this.keyboardKeys.delete(event.code);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.clearTransientInput();
    }
  };

  private readonly clearTransientInput = (): void => {
    this.keyboardKeys.clear();
    this.resetJoystick();
    this.resetAction();
    this.resetAttack();
    for (const pointerId of this.lookPointers.keys()) {
      this.releasePointerCapture(this.lookSurface, pointerId);
    }
    this.lookPointers.clear();
    this.pinchDistance = null;
  };

  private readonly preventDefault = (event: Event): void => {
    this.preventEventDefault(event);
  };

  private preventEventDefault(event: Event): void {
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const rect = this.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maximumTravel = Math.min(rect.width, rect.height) * 0.3;
    const offsetX = clientX - centerX;
    const offsetY = clientY - centerY;
    const distance = Math.hypot(offsetX, offsetY);
    const scale = distance > maximumTravel ? maximumTravel / distance : 1;
    const clampedX = offsetX * scale;
    const clampedY = offsetY * scale;

    this.joystickX = clampedX / maximumTravel;
    this.joystickY = -clampedY / maximumTravel;
    this.joystickKnob.style.transform = `translate3d(${clampedX.toFixed(2)}px, ${clampedY.toFixed(2)}px, 0)`;
  }

  private resetJoystick(): void {
    this.releasePointerCapture(this.joystick, this.joystickPointerId);
    this.joystickPointerId = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.joystickKnob.style.transform = 'translate3d(0, 0, 0)';
  }

  private resetAction(): void {
    this.releasePointerCapture(this.actionButton, this.actionPointerId);
    this.actionPointerId = null;
    this.actionButton.classList.remove('is-pressed');
  }

  private resetAttack(): void {
    this.releasePointerCapture(this.attackButton, this.attackPointerId);
    this.attackPointerId = null;
    this.attackButton.classList.remove('is-pressed');
  }

  private removeLookPointer(pointerId: number): void {
    if (!this.lookPointers.delete(pointerId)) {
      return;
    }

    this.releasePointerCapture(this.lookSurface, pointerId);
    this.pinchDistance = this.getPinchDistance();
  }

  private getPinchDistance(): number | null {
    if (this.lookPointers.size !== 2) {
      return null;
    }

    const points = [...this.lookPointers.values()];
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private capturePointer(element: Element, pointerId: number): void {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // A browser can reject capture for a pointer that already ended. The
      // global pointer-end listener still resets the input state in that case.
    }
  }

  private releasePointerCapture(element: Element, pointerId: number | null): void {
    if (pointerId === null) {
      return;
    }

    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture may already be released after a cancel or browser blur.
    }
  }

  private isKeyHeld(code: string): boolean {
    return this.keyboardKeys.has(code);
  }
}

function normalize(x: number, y: number): MovementVector {
  const length = Math.hypot(x, y);
  if (length <= 1 || length === 0) {
    return { x, y };
  }

  return { x: x / length, y: y / length };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isPrimaryButton(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.button === 0;
}

function isSupportedKey(code: string): boolean {
  return code === 'Space' || MOVEMENT_KEYS.has(code) || ATTACK_KEYS.has(code);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest('input, textarea, select, [contenteditable]') !== null;
}

function createControlStyles(joystickRadius: number): string {
  const diameter = joystickRadius * 2;

  return `
    :host {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: block;
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
    }

    *, *::before, *::after { box-sizing: border-box; }

    .overlay {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }

    .control {
      pointer-events: auto;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-user-select: none;
      user-select: none;
    }

    .look-surface {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 50%;
      cursor: grab;
    }

    .look-surface:active { cursor: grabbing; }

    .joystick {
      position: absolute;
      z-index: 2;
      bottom: max(18px, calc(env(safe-area-inset-bottom) + 12px));
      left: max(18px, calc(env(safe-area-inset-left) + 12px));
      width: ${diameter}px;
      height: ${diameter}px;
      display: grid;
      place-items: center;
      border: 2px solid rgba(191, 231, 255, 0.5);
      border-radius: 50%;
      background: radial-gradient(circle at 35% 28%, rgba(138, 220, 255, 0.32), rgba(35, 83, 139, 0.24) 55%, rgba(4, 16, 44, 0.45));
      box-shadow: inset 0 0 18px rgba(184, 235, 255, 0.22), 0 8px 22px rgba(0, 4, 24, 0.28);
    }

    .joystick-knob {
      width: 44%;
      height: 44%;
      border: 1px solid rgba(236, 250, 255, 0.82);
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(230, 253, 255, 0.9), rgba(93, 191, 255, 0.72));
      box-shadow: 0 4px 10px rgba(0, 12, 45, 0.38);
      transform: translate3d(0, 0, 0);
      will-change: transform;
    }

    .action {
      position: absolute;
      z-index: 2;
      right: max(18px, calc(env(safe-area-inset-right) + 12px));
      bottom: max(24px, calc(env(safe-area-inset-bottom) + 18px));
      width: 82px;
      height: 82px;
      padding: 0;
      border: 2px solid rgba(255, 244, 197, 0.75);
      border-radius: 50%;
      color: #fff9df;
      background: radial-gradient(circle at 35% 24%, #ffed8a, #f19b2d 48%, #ba421b 100%);
      box-shadow: inset 0 2px 10px rgba(255, 255, 255, 0.42), 0 8px 20px rgba(43, 13, 1, 0.35);
      font: 700 13px/1 system-ui, sans-serif;
      letter-spacing: 0.08em;
      text-shadow: 0 1px 2px rgba(81, 26, 1, 0.7);
      transform: scale(1);
      transition: transform 80ms ease, filter 80ms ease;
    }

    .attack {
      position: absolute;
      z-index: 2;
      right: max(27px, calc(env(safe-area-inset-right) + 21px));
      bottom: max(119px, calc(env(safe-area-inset-bottom) + 113px));
      width: 68px;
      height: 68px;
      padding: 0;
      border: 2px solid rgba(219, 235, 255, 0.8);
      border-radius: 50%;
      color: #eff7ff;
      background: radial-gradient(circle at 35% 24%, #b9e5ff, #5377e6 48%, #272a91 100%);
      box-shadow: inset 0 2px 10px rgba(255, 255, 255, 0.38), 0 8px 20px rgba(3, 8, 54, 0.42);
      font: 800 10px/1 system-ui, sans-serif;
      letter-spacing: 0.05em;
      text-shadow: 0 1px 2px rgba(4, 12, 54, 0.85);
      transform: scale(1);
      transition: transform 80ms ease, filter 80ms ease;
    }

    .action.is-pressed,
    .action:active {
      filter: brightness(0.9);
      transform: scale(0.93);
    }

    .attack.is-pressed,
    .attack:active {
      filter: brightness(0.9);
      transform: scale(0.93);
    }

    .action:focus-visible {
      outline: 3px solid #d8f6ff;
      outline-offset: 4px;
    }

    .attack:focus-visible {
      outline: 3px solid #d8f6ff;
      outline-offset: 4px;
    }

    @media (max-width: 360px) {
      .action { width: 72px; height: 72px; font-size: 11px; }
      .attack { width: 60px; height: 60px; right: max(24px, calc(env(safe-area-inset-right) + 18px)); bottom: max(107px, calc(env(safe-area-inset-bottom) + 101px)); font-size: 9px; }
    }
  `;
}
