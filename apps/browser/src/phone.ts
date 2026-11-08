// The phone over the floor, as the dev server's /__cam endpoint hands it on
// from the forwarder on the rig (vite-plugin-cam.ts): on, off, status, and
// the latest JPEG polled twice a second while watching. The frame is a
// decoded image for the view's canvas, which crops, zooms and filters it.

import m from 'mithril';

const POLL_MS = 500;

class Phone {

  public status = '';
  public error = '';
  public image: HTMLImageElement | null = null;
  public age = 0;
  public frames = 0;
  public watching = false;
  public width = 0;
  public height = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async ask (cmd: 'ping' | 'status' | 'off' | 'on', id?: number): Promise<string> {
    const res = await fetch(`/__cam/${cmd}${cmd === 'on' ? `?id=${id ?? 2}` : ''}`);
    const text = await res.text();
    if (!res.ok) { this.error = text; m.redraw(); throw new Error(text); }
    this.error = '';
    this.status = text;
    m.redraw();
    return text;
  }

  /** Start the stream from camera `id` (2 ultrawide, 0 main) and watch it. */
  async on (id = 2): Promise<void> { await this.ask('on', id); this.watch(); }

  async off (): Promise<void> { this.unwatch(); await this.ask('off'); }

  watch (): void {
    if (this.watching) return;
    this.watching = true;
    const tick = async () => {
      if (!this.watching) return;
      try {
        const res = await fetch('/__cam/frame');
        if (res.ok) {
          const blob = await res.blob();
          const img = new Image();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('frame not decodable')); img.src = url; });
          URL.revokeObjectURL(url);
          this.image = img;
          this.width = img.naturalWidth; this.height = img.naturalHeight;
          this.age = Number(res.headers.get('x-cam-age') ?? 0);
          this.frames++;
          this.error = '';
        } else this.error = await res.text();
      } catch (e) { this.error = String(e); }
      m.redraw();
      this.timer = setTimeout(tick, POLL_MS);
    };
    void tick();
  }

  unwatch (): void {
    this.watching = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

}

export const phone = new Phone();
