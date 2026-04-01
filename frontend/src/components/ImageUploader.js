import React, { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import ImageEditor from "@uppy/image-editor";
import Dashboard from "@uppy/dashboard";
import "@uppy/core/css/style.min.css";
import "@uppy/image-editor/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "./ImageUploader.css";

const API_BASE_URL = (process.env.REACT_APP_API_URL || "http://localhost:5001/api").replace(/\/$/, "");

export default function ImageUploader({ onUploadSuccess }) {
  const containerRef = useRef(null);
  const uppyRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 900px)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 900px)");
    const onChange = (event) => setIsDesktop(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("No auth token found");
      setUploadStatus("Upload failed: no auth token");
      return;
    }

    const uppy = new Uppy({
      id: "image-uploader",
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: [".jpg", ".jpeg", ".png"],
      },
      autoProceed: false,
    });

    uppyRef.current = uppy;

    uppy.use(ImageEditor, {
      id: 'ImageEditor',
      quality: 0.8,
      cropperOptions: { aspectRatio: 1 },
      replaceFile: true,
    });

    uppy.use(Dashboard, {
      id: 'Dashboard',
      inline: isDesktop,
      target: isDesktop ? containerRef.current : (typeof document !== 'undefined' ? 'body' : undefined),
      height: 400,
      showProgressDetails: true,
      note: "Accepted file types: jpg, jpeg, png",
      proudlyDisplayPoweredByUppy: false,
      showLinkToFileUploadResult: false,
      theme: "dark",
    });

    uppy.use(XHRUpload, {
      endpoint: `${API_BASE_URL}/images`,
      method: "POST",
      fieldName: "file",
      headers: { Authorization: `Bearer ${token}` },
    });

    const successHandler = (file, response) => {
      setUploadStatus(`${file.name} uploaded successfully.`);
      setSelectedFileName(file.name);
      if (typeof onUploadSuccess === "function") onUploadSuccess(response?.body);
    };

    const errorHandler = (file, error, response) => {
      console.error("Upload error:", error, response);
      setUploadStatus(`Upload failed${file?.name ? ` for ${file.name}` : ""}`);
    };

    uppy.on("upload-success", successHandler);
    uppy.on("upload-error", errorHandler);

    return () => {
      uppy.off("upload-success", successHandler);
      uppy.off("upload-error", errorHandler);
      uppy.destroy();
    };
  }, [onUploadSuccess, isDesktop]);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    const uppy = uppyRef.current;
    if (!file || !uppy) return;

    uppy.getFiles().forEach((f) => uppy.removeFile(f.id));

    uppy.addFile({
      name: file.name,
      type: file.type,
      data: file,
      source: "Local",
      isRemote: false,
    });

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSelectedFileName(file.name);
    setUploadStatus("");

    // open editor after selecting image
    openEditor();
  };

  const handleUpload = async () => {
    const uppy = uppyRef.current;
    if (!uppy || !uppy.getFiles().length) {
      setUploadStatus("Select an image first.");
      return;
    }
    await uppy.upload();
  };

  const openEditor = () => {
    const uppy = uppyRef.current;
    if (!uppy) return;

    const dashboard = uppy.getPlugin('Dashboard');
    if (dashboard && typeof dashboard.open === 'function') {
      dashboard.open();
      return;
    }

    console.warn('No dashboard plugin available to open editor');
  };

  return (
    <div className="image-uploader">
      <h2 className="image-uploader-title">Upload Profile Picture</h2>

      {previewUrl && (
        <div className="preview-row">
          <img
            src={previewUrl}
            alt="Preview"
            className="preview-image"
            style={{
              width: 150,
              height: 150,
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
          <button
            className="edit-square"
            onClick={openEditor}
            aria-label="Edit or crop image"
            title="Edit / Crop"
          >
            <i className="fas fa-edit" />
          </button>
        </div>
      )}

      {selectedFileName && <p className="upload-meta">Selected: {selectedFileName}</p>}
      {uploadStatus && <p className="upload-meta">{uploadStatus}</p>}
      {!selectedFileName && <p className="upload-meta">No image selected</p>}

      {isDesktop ? (
        <div ref={containerRef} />
      ) : (
        <div className="mobile-upload-actions">
          <label className="mobile-file-label" htmlFor="image-file">
            Choose Photo
          </label>
          <input
            id="image-file"
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={handleFileSelect}
            className="mobile-file-input"
          />

          {selectedFileName && (
            <button className="mobile-upload-btn" onClick={handleUpload}>
              Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}