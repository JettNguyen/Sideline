import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

const CLOSE_ANIMATION_MS = 200;

const Modal = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef(null);
  const [currentY, setCurrentY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(isOpen);
  const dragStateRef = useRef({ active: false, startY: 0, pointerId: null, offsetY: 0 });
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
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startY: e.clientY,
      pointerId: e.pointerId,
      offsetY: 0,
    };
    setCurrentY(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const dragState = dragStateRef.current;
    if (!dragState.active || dragState.pointerId !== e.pointerId) return;
    const diff = e.clientY - dragState.startY;
    const offsetY = diff > 0 ? diff : 0;
    dragStateRef.current.offsetY = offsetY;
    setCurrentY(offsetY);
  };

  const handlePointerEnd = (e) => {
    const dragState = dragStateRef.current;
    if (!dragState.active || dragState.pointerId !== e.pointerId) return;
    const draggedDistance = dragState.offsetY;
    dragStateRef.current = { active: false, startY: 0, pointerId: null, offsetY: 0 };
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (draggedDistance > 70) {
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
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
