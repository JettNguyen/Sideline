import React, { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import Dashboard from "@uppy/dashboard";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "./VideoUploader.css";
import { API_BASE_URL } from "../utils/api";

export default function VideoUploader({ onUploadSuccess, matchId }) {
  const containerRef = useRef(null);
  const uppyRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const previewUrlRef = useRef(null);
  const thumbnailRequestIdRef = useRef(0);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.matchMedia("(min-width: 900px)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 900px)");

    const onChange = (event) => {
      setIsDesktop(event.matches);
    };

    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");

    const uppy = new Uppy({
      id: "video-uploader",
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: [".mp4", ".mov"],
      },
      autoProceed: false,
    });

    uppyRef.current = uppy;

    uppy.use(XHRUpload, {
      endpoint: `${API_BASE_URL}/videos`,
      fieldName: "files",
      allowedMetaFields: ["matchId"],
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (matchId) {
      uppy.setMeta({ matchId });
    }

    if (isDesktop) {
      uppy.use(Dashboard, {
        inline: true,
        target: containerRef.current,
        height: 430,
        showProgressDetails: true,
        note: "Accepted file types: mp4, mov",
        proudlyDisplayPoweredByUppy: false,
        showLinkToFileUploadResult: false,
        showRemoveButtonAfterComplete: false,
        theme: "dark",
      });
    }

    const successHandler = (file, response) => {
      setUploadStatus(`${file.name} uploaded successfully.`);
      setSelectedFileName(file.name);
      if (typeof onUploadSuccess === "function") {
        onUploadSuccess(response?.body);
      }
    };

    const errorHandler = (file, error) => {
      setUploadStatus(`Upload failed${file?.name ? ` for ${file.name}` : ""}.`);
      console.error("Error uploading file:", file.name);
      console.error("Error details:", error);
    };

    uppy.on("upload-success", successHandler);
    uppy.on("upload-error", errorHandler);

    return () => {
      uppy.off("upload-success", successHandler);
      uppy.off("upload-error", errorHandler);
      uppy.destroy();
    };
  }, [isDesktop, onUploadSuccess, matchId]);

  const handleMobileFileSelect = (event) => {
    const file = event.target.files?.[0];
    const uppy = uppyRef.current;

    if (!file || !uppy) {
      return;
    }

    uppy.getFiles().forEach((existingFile) => {
      uppy.removeFile(existingFile.id);
    });

    uppy.addFile({
      name: file.name,
      type: file.type,
      data: file,
      source: "Local",
      isRemote: false,
    });

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setThumbnailUrl(null);
    setThumbnailFailed(false);
    generateThumbnail(url);
    setSelectedFileName(file.name);
    setUploadStatus("");
  };

  const generateThumbnail = (sourceUrl) => {
    const requestId = ++thumbnailRequestIdRef.current;
    let done = false;

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.src = sourceUrl;

    // Mobile browsers decode more reliably when the video element is in the DOM.
    video.style.position = 'fixed';
    video.style.left = '-99999px';
    video.style.top = '-99999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    document.body.appendChild(video);

    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(safetyTimer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    };

    const waitForEvent = (target, eventName) =>
      new Promise((resolve, reject) => {
        const onEvent = () => {
          target.removeEventListener(eventName, onEvent);
          target.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          target.removeEventListener(eventName, onEvent);
          target.removeEventListener('error', onError);
          reject(new Error(`Failed while waiting for ${eventName}`));
        };
        target.addEventListener(eventName, onEvent, { once: true });
        target.addEventListener('error', onError, { once: true });
      });

    const nextPaint = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const isFrameMostlyBlack = (ctx, width, height) => {
      try {
        const sampleSize = 32;
        const stepX = Math.max(1, Math.floor(width / sampleSize));
        const stepY = Math.max(1, Math.floor(height / sampleSize));
        const imageData = ctx.getImageData(0, 0, width, height).data;
        let luminanceTotal = 0;
        let samples = 0;

        for (let y = 0; y < height; y += stepY) {
          for (let x = 0; x < width; x += stepX) {
            const index = (y * width + x) * 4;
            const r = imageData[index];
            const g = imageData[index + 1];
            const b = imageData[index + 2];
            luminanceTotal += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
            samples += 1;
          }
        }

        const averageLuminance = samples ? luminanceTotal / samples : 0;
        return averageLuminance < 10;
      } catch {
        return false;
      }
    };

    const captureFrame = () => {
      if (!video.videoWidth || !video.videoHeight) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (isFrameMostlyBlack(ctx, canvas.width, canvas.height)) {
        return null;
      }

      return canvas.toDataURL('image/jpeg', 0.88);
    };

    const runCapture = async () => {
      try {
        await waitForEvent(video, 'loadedmetadata');

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const candidateTimes = duration > 0
          ? [
              Math.min(0.2, Math.max(0.05, duration * 0.05)),
              Math.min(0.8, Math.max(0.15, duration * 0.15)),
              Math.min(1.5, Math.max(0.3, duration * 0.3)),
            ]
          : [0.1, 0.25, 0.5];

        for (const time of candidateTimes) {
          if (done) return;

          try {
            const targetTime = duration > 0 ? Math.min(Math.max(0.01, time), Math.max(0.01, duration - 0.05)) : time;
            video.currentTime = targetTime;
            await waitForEvent(video, 'seeked');

            try {
              await video.play();
              video.pause();
            } catch {
              // Some browsers block autoplay; seek + paint is enough.
            }

            await nextPaint();
            const capturedUrl = captureFrame();
            if (capturedUrl) {
              if (thumbnailRequestIdRef.current === requestId) {
                setThumbnailUrl(capturedUrl);
                setThumbnailFailed(false);
              }
              cleanup();
              return;
            }
          } catch {
            // Try the next timestamp.
          }
        }

        if (thumbnailRequestIdRef.current === requestId) {
          setThumbnailFailed(true);
        }
      } catch {
        if (thumbnailRequestIdRef.current === requestId) {
          setThumbnailFailed(true);
        }
      } finally {
        cleanup();
      }
    };

    const safetyTimer = setTimeout(() => {
      if (thumbnailRequestIdRef.current === requestId) {
        setThumbnailFailed(true);
      }
      cleanup();
    }, 5000);

    runCapture();
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleMobileUpload = async () => {
    const uppy = uppyRef.current;

    if (!uppy || !uppy.getFiles().length) {
      setUploadStatus("Select a file first.");
      return;
    }

    await uppy.upload();
  };

  return (
    <div className="video-uploader">
      <h2 className="video-uploader-title">Upload Video</h2>

      {isDesktop ? (
        <div ref={containerRef} />
      ) : (
        <div className="video-upload-actions">
          <label className="video-file-label" htmlFor="mobile-video-file">
            Choose file
          </label>
          <input
            id="mobile-video-file"
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            onChange={handleMobileFileSelect}
            className="video-file-input"
          />
          {previewUrl && (
            <div className="video-upload-preview">
              {thumbnailUrl && (
                <div className="video-upload-thumbnail">
                  <img src={thumbnailUrl} alt="Video thumbnail" />
                </div>
              )}
              {!thumbnailUrl && !thumbnailFailed && (
                <video
                  className="video-upload-preview-el"
                  src={previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    const duration = Number.isFinite(el.duration) ? el.duration : 0;
                    if (duration > 0) {
                      try {
                        el.currentTime = Math.min(0.3, Math.max(0.05, duration * 0.1));
                      } catch {
                        // Ignore seek failures for unsupported files.
                      }
                    }
                  }}
                />
              )}
              {thumbnailFailed && (
                <div className="video-upload-thumbnail-fallback">
                  <i className="fas fa-video" />
                </div>
              )}
            </div>
          )}
          {selectedFileName && (
            <button className="video-upload-btn" onClick={handleMobileUpload}>
              Upload from device
            </button>
          )}
        </div>
      )}

      {uploadStatus && <p className="video-upload-meta">{uploadStatus}</p>}
    </div>
  );
}
