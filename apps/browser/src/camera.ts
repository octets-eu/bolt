import m from 'mithril';

/** The camera Mac's WHEP endpoint, from VITE_WHEP_URL in apps/browser/.env.local (not in git), see .env.example. */
const DEFAULT_WHEP: string = import.meta.env.VITE_WHEP_URL ?? '';
const KEY = 'bolt.camera.whep';

/**
 * The overhead camera as a WebRTC stream pulled over WHEP from mediamtx on the
 * camera Mac (see the Bolt-Cam README there). One connection for the page,
 * kept alive across routes so the tracker can run while another view is shown.
 * State changes are announced to `onChange` listeners; the tracker follows them.
 */
class Camera {

  public url: string = (() => {
    try {
      return localStorage.getItem(KEY) || DEFAULT_WHEP;
    } catch {
      return DEFAULT_WHEP;
    }
  })();
  public state: 'idle' | 'connecting' | 'connected' | 'failed' = 'idle';
  public error = '';
  public stream: MediaStream | null = null;
  public width = 0;
  public height = 0;

  /** Always attached to the stream and playing, off-screen, so frames can be grabbed on any route. */
  public readonly video: HTMLVideoElement;

  private pc: RTCPeerConnection | null = null;
  private listeners = new Set<(camera: Camera) => void>();

  constructor () {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.cssText = 'position:fixed;left:-10000px;top:0;width:16px;height:9px;opacity:0.01;pointer-events:none';
    document.body.appendChild(this.video);
  }

  /** Called after every state change. */
  onChange (listener: (camera: Camera) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState (state: Camera['state'], error = '') {
    this.state = state;
    this.error = error;
    for (const listener of [...this.listeners]) listener(this);
    m.redraw();
  }

  setUrl (url: string) {
    this.url = url.trim();
    try { localStorage.setItem(KEY, this.url); } catch { /* private window */ }
  }

  async connect (): Promise<void> {
    this.disconnect();
    this.setState('connecting');
    try {
      const pc = new RTCPeerConnection();
      this.pc = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.ontrack = (e) => {
        this.stream = e.streams[0] ?? null;
        this.video.srcObject = this.stream;
        this.video.play().catch((): void => undefined);
        m.redraw();
      };
      pc.oniceconnectionstatechange = () => {
        if (pc !== this.pc) return;
        if (pc.iceConnectionState === 'connected') this.setState('connected');
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') this.setState('failed', `ice ${pc.iceConnectionState}`);
      };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>(res => {
        if (pc.iceGatheringState === 'complete') res();
        else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') res();
          };
          setTimeout(res, 1500);
        }
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription!.sdp, signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`WHEP ${resp.status} ${await resp.text()}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
    } catch (error) {
      this.disconnect(false);
      this.setState('failed', String(error));
    }
  }

  disconnect (resetState = true) {
    if (this.pc) { try { this.pc.close(); } catch { /* already closed */ } }
    this.pc = null;
    this.stream = null;
    this.width = 0;
    this.height = 0;
    this.video.srcObject = null;
    if (resetState) this.setState('idle');
  }

  /** Attach the stream to a video element; called from the view's lifecycle. */
  attach (video: HTMLVideoElement) {
    if (video.srcObject !== this.stream) video.srcObject = this.stream;
    video.onloadedmetadata = () => {
      this.width = video.videoWidth;
      this.height = video.videoHeight;
      m.redraw();
    };
  }

}

export const camera = new Camera();
