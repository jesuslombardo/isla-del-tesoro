// Controles táctiles para celular: joystick flotante (mitad izquierda) para
// moverse y deslizar (mitad derecha) para mirar. Multitouch por identificador.

export class TouchControls {
  constructor(player) {
    this.player = player;
    this.layer = document.getElementById('touch-layer');
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    this.R = 55; // radio máximo del joystick (px)
    this.moveId = null;
    this.lookId = null;
    this.anchor = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };
  }

  enable() {
    this.layer.classList.remove('hidden');
    this.layer.addEventListener('touchstart', this._onStart, { passive: false });
    this.layer.addEventListener('touchmove', this._onMove, { passive: false });
    this.layer.addEventListener('touchend', this._onEnd);
    this.layer.addEventListener('touchcancel', this._onEnd);
  }

  _onStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const leftHalf = t.clientX < window.innerWidth * 0.5;
      if (leftHalf && this.moveId === null) {
        this.moveId = t.identifier;
        this.anchor = { x: t.clientX, y: t.clientY };
        this.joy.style.left = t.clientX - 55 + 'px';
        this.joy.style.top = t.clientY - 55 + 'px';
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.joy.classList.remove('hidden');
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  };

  _onMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        let dx = t.clientX - this.anchor.x;
        let dy = t.clientY - this.anchor.y;
        const d = Math.hypot(dx, dy);
        if (d > this.R) { dx *= this.R / d; dy *= this.R / d; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.player.moveVec.x = dx / this.R; // lateral (der +)
        this.player.moveVec.y = -dy / this.R; // adelante (arriba +)
      } else if (t.identifier === this.lookId) {
        this.player.applyLook(t.clientX - this.last.x, t.clientY - this.last.y);
        this.last = { x: t.clientX, y: t.clientY };
      }
    }
  };

  _onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null;
        this.player.moveVec.x = 0;
        this.player.moveVec.y = 0;
        this.joy.classList.add('hidden');
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  };
}
