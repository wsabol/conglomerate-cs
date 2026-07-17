const HLS_MIME = "application/vnd.apple.mpegurl";

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType(HLS_MIME) !== "";
}

/** Attach a signed Stream HLS manifest to a video element; returns a cleanup fn. */
export async function attachStreamHls(
  video: HTMLVideoElement,
  manifestUrl: string,
): Promise<() => void> {
  if (canPlayNativeHls(video)) {
    video.src = manifestUrl;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  const { default: Hls } = await import("hls.js");
  if (!Hls.isSupported()) {
    throw new Error("HLS is not supported in this browser.");
  }

  const hls = new Hls();
  hls.loadSource(manifestUrl);
  hls.attachMedia(video);

  return () => {
    hls.destroy();
  };
}
