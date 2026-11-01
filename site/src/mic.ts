import gsap from 'gsap';

/** Optional microphone level (RMS). Only started from a click. Nothing is recorded or sent anywhere. */
export async function startMic(onLevel: (v: number) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const tick = () => {
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    onLevel(Math.sqrt(s / buf.length));
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}
