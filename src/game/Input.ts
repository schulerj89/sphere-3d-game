import { Vector2 } from 'three';

export interface GameInput {
  readonly movement: Vector2;
  consumeLookDelta(): Vector2;
  consumeZoomDelta(): number;
  consumeJumpPressed(): boolean;
  consumeActionPressed(): boolean;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

/** Desktop fallback while the same GameInput contract is used by touch controls. */
export class DesktopInput implements GameInput {
  readonly movement = new Vector2();

  private readonly keys = new Set<string>();
  private readonly lookDelta = new Vector2();
  private zoomDelta = 0;
  private jumpPressed = false;
  private actionPressed = false;
  private enabled = true;
  private dragging = false;
  private lastPointer = new Vector2();

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
    target.addEventListener('wheel', this.onWheel, { passive: false });
  }

  consumeLookDelta(): Vector2 {
    const value = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return value;
  }

  consumeZoomDelta(): number {
    const value = this.zoomDelta;
    this.zoomDelta = 0;
    return value;
  }

  consumeJumpPressed(): boolean {
    const value = this.jumpPressed;
    this.jumpPressed = false;
    return value;
  }

  consumeActionPressed(): boolean {
    const value = this.actionPressed;
    this.actionPressed = false;
    return value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.movement.set(0, 0);
      this.lookDelta.set(0, 0);
      this.dragging = false;
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.target.removeEventListener('wheel', this.onWheel);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    this.keys.add(event.code);
    this.updateMovement();
    if (!event.repeat && (event.code === 'Space' || event.code === 'KeyW')) {
      this.jumpPressed = true;
    }
    if (!event.repeat && (event.code === 'KeyE' || event.code === 'Enter')) {
      this.actionPressed = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    this.updateMovement();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerType === 'touch') return;
    this.dragging = true;
    this.lastPointer.set(event.clientX, event.clientY);
    this.target.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.dragging || event.pointerType === 'touch') return;
    this.lookDelta.x += event.clientX - this.lastPointer.x;
    this.lookDelta.y += event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.target.hasPointerCapture(event.pointerId)) {
      this.target.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    event.preventDefault();
    this.zoomDelta += event.deltaY * 0.012;
  };

  private updateMovement(): void {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const y = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    this.movement.set(x, y).normalize();
  }
}
