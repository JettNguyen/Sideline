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

    setSelectedFileName(file.name);
    setUploadStatus("");
  };

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
          <button className="video-upload-btn" onClick={handleMobileUpload}>
            Upload from device
          </button>
          {selectedFileName && (
            <p className="video-upload-meta">Selected: {selectedFileName}</p>
          )}
        </div>
      )}

      {uploadStatus && <p className="video-upload-meta">{uploadStatus}</p>}
    </div>
  );
}
