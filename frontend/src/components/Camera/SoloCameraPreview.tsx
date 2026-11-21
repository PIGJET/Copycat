import { useEffect, useRef, useState } from 'react';

/** Local camera preview only. Releases its stream before the recorder mounts. */
export function SoloCameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('Starting camera…');

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    const video = videoRef.current;
    async function open() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (disposed || !video) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream = media;
        video.srcObject = media;
        await video.play();
        if (!disposed) setMessage('');
      } catch {
        if (!disposed) setMessage('Camera unavailable. Check your camera permission.');
      }
    }
    void open();
    return () => {
      disposed = true;
      stream?.getTracks().forEach(track => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  return <div>
    <span>Your camera</span>
    <div className="challenge-recorder__camera">
      <video ref={videoRef} muted autoPlay playsInline />
    </div>
    {message && <p role="status">{message}</p>}
  </div>;
}
