import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import './SearchOverlay.css';

export default function SearchOverlay({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sheetOffsetY, setSheetOffsetY] = useState(0);
  const inputRef = useRef(null);
  const dragStateRef = useRef({ active: false, startY: 0, pointerId: null, offsetY: 0 });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSearching(false);
      setTimeout(() => inputRef.current?.focus(), 350);
    } else {
      setSheetOffsetY(0);
      dragStateRef.current = { active: false, startY: 0, pointerId: null, offsetY: 0 };
    }
  }, [isOpen]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/teams/search', { params: { q } });
        setResults(res.data || []);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const handleRequest = async (teamId) => {
    try {
      await api.post(`/teams/${teamId}/requests`);
      setResults((prev) =>
        prev.map((t) => (t._id === teamId ? { ...t, myStatus: 'requested' } : t))
      );
    } catch (err) {
      console.error('Request error:', err);
    }
  };

  const handleViewTeam = (teamId) => {
    onClose();
    navigate(`/team/${teamId}`);
  };

  const handleSheetPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startY: e.clientY,
      pointerId: e.pointerId,
      offsetY: 0,
    };
    setSheetOffsetY(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleSheetPointerMove = (e) => {
    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const diff = e.clientY - drag.startY;
    const offsetY = diff > 0 ? diff : 0;
    dragStateRef.current.offsetY = offsetY;
    setSheetOffsetY(offsetY);
  };

  const handleSheetPointerEnd = (e) => {
    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const draggedDistance = drag.offsetY;
    dragStateRef.current = { active: false, startY: 0, pointerId: null, offsetY: 0 };
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (draggedDistance > 70) {
      onClose();
    }
    setSheetOffsetY(0);
  };

  if (!isOpen) return null;

  const q = query.trim();

  return (
    <div className="search-overlay" onClick={onClose}>
      <div
        className="search-sheet"
        onClick={(e) => e.stopPropagation()}
        style={sheetOffsetY > 0 ? { transform: `translateY(${sheetOffsetY}px)` } : undefined}
      >
        <div
          className="search-handle-area"
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerEnd}
          onPointerCancel={handleSheetPointerEnd}
        >
          <div className="search-handle" />
        </div>
        <div className="search-input-row">
          <i className="fas fa-search search-icon" />
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            placeholder="Search teams by name or location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query.length > 0 && (
            <button className="search-clear-btn" onClick={() => setQuery('')} aria-label="Clear">
              <i className="fas fa-times" />
            </button>
          )}
        </div>

        <div className="search-results">
          {searching && <p className="search-hint">Searching...</p>}
          {!searching && q.length >= 2 && results.length === 0 && (
            <p className="search-hint">No public teams found for &ldquo;{q}&rdquo;</p>
          )}
          {!searching && q.length < 2 && (
            <p className="search-hint">Type at least 2 characters to search</p>
          )}
          {!searching && results.map((team) => {
            const isActive = team.myStatus === 'active';
            const isRequested = team.myStatus === 'requested';
            return (
              <div key={team._id} className="search-result-card">
                <div className="search-result-info">
                  <p className="search-result-name">{team.name}</p>
                  <p className="search-result-meta">
                    {team.location && (
                      <span>
                        <i className="fas fa-location-dot" />
                        {team.location}
                      </span>
                    )}
                    <span>
                      <i className="fas fa-users" />
                      {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                    </span>
                  </p>
                </div>
                <div className="search-result-action">
                  {isActive ? (
                    <button
                      className="search-action-btn view"
                      onClick={() => handleViewTeam(team._id)}
                    >
                      View
                    </button>
                  ) : isRequested ? (
                    <button className="search-action-btn pending" disabled>
                      Pending
                    </button>
                  ) : (
                    <button
                      className="search-action-btn request"
                      onClick={() => handleRequest(team._id)}
                    >
                      Request
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
