import { useEffect, useRef, useState } from "react";
import { fetchPlayback, streamHlsSrc } from "../../lib/playback";
import { attachStreamHls } from "../../lib/streamHls";
import { Icon } from "../ui/Icon";
import styles from "./MediaDetailView.module.css";

interface MediaDetailVideoProps {
  src?: string | null;
  mediaId: number;
  playbackUrl?: string | null;
  poster?: string | null;
  title?: string | null;
}

export function MediaDetailVideo({
  src,
  mediaId,
  playbackUrl,
  poster,
  title,
}: MediaDetailVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manifest, setManifest] = useState<string | null>(null);
  const [streamPoster, setStreamPoster] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useStream = Boolean(playbackUrl);

  useEffect(() => {
    setManifest(null);
    setStreamPoster(null);
    setError(null);
    if (!useStream) return;

    let cancelled = false;
    fetchPlayback(mediaId)
      .then((playback) => {
        if (cancelled) return;
        setManifest(streamHlsSrc(playback.customerCode, playback.token));
        setStreamPoster(playback.posterUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Playback authorization failed. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaId, useStream]);

  useEffect(() => {
    if (!useStream || !manifest) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let detach: (() => void) | undefined;
    attachStreamHls(video, manifest)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else detach = cleanup;
      })
      .catch(() => {
        if (!cancelled) setError("This video could not be played.");
      });

    return () => {
      cancelled = true;
      detach?.();
      video.pause();
    };
  }, [manifest, useStream]);

  if (error) {
    return (
      <div className={styles.mediaError} role="alert">
        <Icon name="video" size={32} label="Video" />
        <p>{error}</p>
      </div>
    );
  }

  if (useStream && !manifest) {
    return <p className={styles.mediaLoading}>Loading video…</p>;
  }

  return (
    <video
      ref={videoRef}
      key={mediaId}
      className={styles.primaryVideo}
      src={useStream ? undefined : (src ?? undefined)}
      poster={(useStream ? streamPoster : poster) ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={title ?? "Archived video"}
      onError={() => setError("This video could not be played.")}
    />
  );
}
