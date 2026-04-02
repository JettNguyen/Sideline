import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

const CLOSE_ANIMATION_MS = 200;

const Modal = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef(null);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(isOpen);
  const skipFirstRun = useRef(true);

  useEffect(() => {
    if (skipFirstRun.current) {
      skipFirstRun.current = false;
      return;
    }

    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    } else {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, CLOSE_ANIMATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    // Lock scroll on html (not body) — avoids collapsing body height which
    // triggers iOS to recalculate env(safe-area-inset-bottom) and dvh,
    // causing the persistent gap after the modal closes.
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 0) {
      setCurrentY(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (currentY > 50) {
      onClose();
    }
    setCurrentY(0);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isVisible) return null;

  return createPortal(
    <div className={`modal-backdrop${isClosing ? ' closing' : ''}`} onClick={handleBackdropClick}>
      <div
        ref={modalRef}
        className={`modal-content${isClosing ? ' closing' : ''}`}
        style={isClosing ? undefined : { transform: `translateY(${currentY}px)` }}
      >
        <div
          className="modal-handle-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="modal-handle" />
        </div>
        {title && <h2 className="modal-title">{title}</h2>}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
