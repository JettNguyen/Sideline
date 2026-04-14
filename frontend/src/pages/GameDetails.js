import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useLocation } from 'react-router-dom';
import Modal from '../components/Modal';
import VideoUploader from '../components/VideoUploader';
import api from '../utils/api';
import { formatLongDate } from '../utils/date';
import useAuth from '../hooks/useAuth';
import useDelayedLoadingIndicator from '../hooks/useDelayedLoadingIndicator';
import './GameDetails.css';

const formatSeconds = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const toValidDuration = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

const filterToClips = (prev, clips) =>
  Object.fromEntries(clips.filter((c) => prev[c._id]).map((c) => [c._id, prev[c._id]]));

const MODAL_CLOSE_ANIMATION_MS = 200;

const GameDetails = () => {
  const { teamId, gameId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const initialClipIdRef = useRef(new URLSearchParams(location.search).get('clipId'));
  const videoRef = useRef(null);
  const uploadCloseTimerRef = useRef(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [game, setGame] = useState({
    id: gameId,
    teamName: 'Team',
    opponent: 'Opponent',
    date: new Date().toISOString(),
  });

  const [clips, setClips] = useState([]);
  const [currentClip, setCurrentClip] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoadingClips, setIsLoadingClips] = useState(true);
  const [videoError, setVideoError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [clipDurations, setClipDurations] = useState({});
  const [clipPreviewUrls, setClipPreviewUrls] = useState({});
  const [userTeamRole, setUserTeamRole] = useState(null);
  const [clipPendingDelete, setClipPendingDelete] = useState(null);
  const showClipsLoadingIndicator = useDelayedLoadingIndicator(isLoadingClips, 1000);

  const activeClip = clips[currentClip] || null;
  const activeClipTags = activeClip?.tags || [];

  useEffect(() => {
    const loadMatch = async () => {
      try {
        const res = await api.get(`/matches/${gameId}`);
        const match = res.data;
        setGame({
          id: match._id,
          teamId: match.team?._id || '',
          teamName: match.team?.name || 'Team',
          opponent: match.opponent,
          date: match.date,
        });
      } catch (err) {
        console.error('Load match details error:', err);
      }
    };

    loadMatch();
  }, [gameId]);

  const loadVideos = async () => {
    setIsLoadingClips(true);
    setVideoError('');

    try {
      const res = await api.get('/videos', {
        params: {
          matchId: gameId,
        },
      });
      const nextClips = res.data || [];

      setClips(nextClips);
      setClipPreviewUrls((prev) => filterToClips(prev, nextClips));
      setClipDurations((prev) => filterToClips(prev, nextClips));
      setCurrentClip((prevIndex) => {
        if (!nextClips.length) {
          return 0;
        }
        const clipId = initialClipIdRef.current;
        if (clipId) {
          const targetIndex = nextClips.findIndex((c) => c._id === clipId);
          if (targetIndex !== -1) {
            initialClipIdRef.current = null;
            return targetIndex;
          }
        }
        return Math.min(prevIndex, nextClips.length - 1);
      });
    } catch (err) {
      console.error('Error fetching videos:', err);
      setVideoError(err.response?.data?.message || 'Could not load clips.');
      setClips([]);
      setCurrentClip(0);
    } finally {
      setIsLoadingClips(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, [gameId]);

  useEffect(() => {
    if (!teamId) return;
    const fetchRole = async () => {
      try {
        const res = await api.get(`/teams/${teamId}`);
        setUserTeamRole(res.data.membershipRole || null);
      } catch (err) {
        console.error('Fetch team role error:', err);
      }
    };
    fetchRole();
  }, [teamId]);

  useEffect(() => {
    if (!clips.length) {
      return;
    }

    let cancelled = false;

    const fetchPreviewUrls = async () => {
      const clipsWithoutPreview = clips.filter((clip) => !clipPreviewUrls[clip._id]);
      if (!clipsWithoutPreview.length) {
        return;
      }

      const previewEntries = await Promise.all(
        clipsWithoutPreview.map(async (clip) => {
          try {
            const res = await api.get(`/videos/${clip._id}/play`);
            return [clip._id, res.data.url];
          } catch (err) {
            console.error('Error loading clip preview URL:', err);
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setClipPreviewUrls((prev) => {
        const next = { ...prev };
        previewEntries.forEach((entry) => {
          if (entry) {
            next[entry[0]] = entry[1];
          }
        });
        return next;
      });
    };

    fetchPreviewUrls();

    return () => {
      cancelled = true;
    };
  }, [clips, clipPreviewUrls]);

  const quickTags = ['Goal', 'Save', 'Great play'];

  useEffect(() => {
    const fetchPlaybackUrl = async () => {
      if (!activeClip) {
        setVideoUrl(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        return;
      }

      try {
        setVideoError('');
        const res = await api.get(`/videos/${activeClip._id}/play`);
        setVideoUrl(res.data.url);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
      } catch (err) {
        console.error('Error getting playback URL:', err);
        setVideoError(err.response?.data?.message || 'Could not load selected clip.');
        setVideoUrl(null);
      }
    };

    fetchPlaybackUrl();
  }, [activeClip?._id]); // intentionally omitting full activeClip to avoid re-fetching on tag updates

  const handleLoadedMetadata = () => {
    const durationSeconds = toValidDuration(videoRef.current?.duration);
    setDuration(durationSeconds);

    if (activeClip?._id) {
      setClipDurations((prev) => ({
        ...prev,
        [activeClip._id]: durationSeconds,
      }));
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) {
      return;
    }

    const nextTime = videoRef.current.currentTime || 0;
    const nextDuration = toValidDuration(videoRef.current.duration);

    setCurrentTime(nextTime);
    if (nextDuration) {
      setDuration(nextDuration);
    }
  };

  const handleScrub = (event) => {
    const nextTime = Number(event.target.value) || 0;
    setCurrentTime(nextTime);

    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) {
      return;
    }

    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
      } catch (err) {
        console.error('Play error:', err);
      }
      return;
    }

    videoRef.current.pause();
  };

  const handleAddTagMoment = async () => {
    if (!selectedTag || !activeClip) return;

    try {
      const res = await api.post(`/videos/${activeClip._id}/tags`, {
        label: selectedTag,
        timeSec: Number(currentTime.toFixed(2)),
      });

      setClips((prev) =>
        prev.map((clip) =>
          clip._id === activeClip._id
            ? { ...clip, tags: res.data }
            : clip
        )
      );
    } catch (err) {
      console.error("Failed to add tag", err);
    }
  };

  const seekToMoment = (timeSec) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = timeSec;
    setCurrentTime(timeSec);
  };

  const removeTagMoment = async (tagId) => {
    if (!activeClip) return;

    try {
      await api.delete(`/videos/${activeClip._id}/tags/${tagId}`);

      setClips((prev) =>
        prev.map((clip) =>
          clip._id === activeClip._id
            ? {
                ...clip,
                tags: clip.tags.filter((tag) => tag._id !== tagId),
              }
            : clip
        )
      );
    } catch (err) {
      console.error("Failed to delete tag", err);
    }
  };

  const currentClipDurationLabel = useMemo(() => {
    if (!activeClip) {
      return '0:00';
    }

    return formatSeconds(clipDurations[activeClip._id] || duration);
  }, [activeClip, clipDurations, duration]);

  const sliderMax = useMemo(() => {
    const knownDuration = toValidDuration(duration);
    if (knownDuration) {
      return knownDuration;
    }

    // Keep the playhead moving even before metadata duration is available.
    return Math.max(currentTime, 1);
  }, [duration, currentTime]);

  const scrubMarkers = useMemo(() => {
    if (!duration) {
      return [];
    }

    return activeClipTags
      .filter((tag) => Number.isFinite(tag.timeSec))
      .map((tag) => ({
        ...tag,
        leftPercent: Math.min(100, Math.max(0, (tag.timeSec / duration) * 100)),
      }));
  }, [activeClipTags, duration]);

  const handleUploadComplete = async () => {
    await loadVideos();
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);

    if (uploadCloseTimerRef.current) {
      clearTimeout(uploadCloseTimerRef.current);
    }

    uploadCloseTimerRef.current = setTimeout(() => {
      handleUploadComplete();
      uploadCloseTimerRef.current = null;
    }, MODAL_CLOSE_ANIMATION_MS + 40);
  };

  useEffect(() => {
    return () => {
      if (uploadCloseTimerRef.current) {
        clearTimeout(uploadCloseTimerRef.current);
      }
    };
  }, []);

  const handleDeleteClip = async (clipId) => {
    try {
      await api.delete(`/videos/${clipId}`);
      const deletedIndex = clips.findIndex((c) => c._id === clipId);
      setClips((prev) => prev.filter((c) => c._id !== clipId));
      if (deletedIndex !== -1) {
        setCurrentClip((prevIdx) => {
          const newLength = clips.length - 1;
          if (newLength === 0) return 0;
          if (deletedIndex === prevIdx && deletedIndex >= newLength) return newLength - 1;
          if (deletedIndex < prevIdx) return prevIdx - 1;
          return prevIdx;
        });
      }
    } catch (err) {
      console.error('Failed to delete clip', err);
    }
  };

  const canDeleteClip = (clip) => {
    if (!user) return false;
    return (
      clip.uploadedBy?.toString() === user._id?.toString() ||
      ['owner', 'coach'].includes(userTeamRole)
    );
  };

  return (
    <div className="game-details-page">
      <div className="game-matchup">
        <h1 className="matchup-title">
          <span>{game.teamName}</span>
          <span className="vs">vs</span>
          <span>{game.opponent}</span>
        </h1>
        <p>Total clips: {clips.length}</p>
        <p className="matchup-date">{formatLongDate(game.date)}</p>
      </div>

      {clips.length === 0 ? (
        <p className="clips-empty-text-video">No clips available. Upload one to view playback.</p>
      ) : (
        <>
          <div className="main-player">
            <div className="video-container">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  className="video-player"
                  key={activeClip?._id || 'no-clip'}
                  src={`${videoUrl}#t=0.001`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                />
              ) : (
                <div className="video-placeholder">
                  <i className="fas fa-play"></i>
                </div>
              )}
            </div>
            <div className="video-controls">
              <div className="video-controls-top-row">
                <button className="play-toggle-btn" onClick={togglePlayPause} disabled={!videoUrl}>
                  <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                {activeClip?.uploadedBy?.username && (
                  <p className="video-uploader">
                    <i className="fas fa-user"></i> {activeClip.uploadedBy.username}
                  </p>
                )}
              </div>

              <div className="time-slider-wrap">
                <input
                  type="range"
                  className="time-slider"
                  min="0"
                  max={sliderMax}
                  step="0.1"
                  value={Math.min(currentTime, sliderMax)}
                  onChange={handleScrub}
                  disabled={!videoUrl}
                />
                <div className="time-marker-track" aria-hidden="true">
                  {scrubMarkers.map((tag) => (
                    <button
                      key={tag._id}
                      type="button"
                      className="time-marker"
                      style={{ left: `${tag.leftPercent}%` }}
                      onClick={() => seekToMoment(tag.timeSec)}
                      title={`${tag.label} at ${formatSeconds(tag.timeSec)}`}
                    />
                  ))}
                </div>
              </div>
              <div className="time-display">
                <span>{formatSeconds(currentTime)}</span>
                <span>{currentClipDurationLabel}</span>
              </div>

              {videoError && <p className="video-error-text">{videoError}</p>}
            </div>
          </div>

          <div className="moment-tags">
        {quickTags.map((label) => (
          <button
            key={label}
            className={`tag-chip ${selectedTag === label ? 'selected' : ''}`}
            onClick={() => setSelectedTag(selectedTag === label ? null : label)}
          >
            {label}
          </button>
        ))}
        <p className="tag-hint">Select a tag, then use "Tag at …" to mark the current moment.</p>
      </div>

      <div className="moment-log-section">
        <h3>Tagged Moments</h3>
        {activeClipTags.length === 0 ? (
          <p className="clips-empty-text">No moments tagged for this clip yet.</p>
        ) : (
          <div className="moment-log-list">
            {activeClipTags.map((tag) => (
              <div key={tag._id} className="moment-log-item">
                <button
                  type="button"
                  className="moment-log-jump-btn"
                  onClick={() => seekToMoment(tag.timeSec)}
                >
                  <span className="moment-log-label">{tag.label}</span>
                  <span className="moment-log-time">{formatSeconds(tag.timeSec)}</span>
                </button>
                <button
                  type="button"
                  className="moment-log-remove-btn"
                  onClick={() => removeTagMoment(tag._id)}
                  aria-label={`Remove ${tag.label} moment at ${formatSeconds(tag.timeSec)}`}
                  title="Remove tagged moment"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      <div className="clips-section">
        <div className="clips-header">
          <h3>All Clips</h3>
          <button className="add-clip-btn" onClick={() => setShowUploadModal(true)}>
            <i className="fas fa-plus"></i>
          </button>
        </div>
        {showClipsLoadingIndicator && <p className="clips-empty-text">Loading clips...</p>}
        {!isLoadingClips && clips.length === 0 && (
          <p className="clips-empty-text">No clips uploaded yet. Upload your first clip.</p>
        )}
        <div className="clips-grid">
          {clips.map((clip, index) => {
            const canDelete = canDeleteClip(clip);
            return (
              <div key={clip._id} className="clip-card-wrapper">
                <div
                  className={`clip-card ${currentClip === index ? 'active' : ''}${canDelete ? ' clip-card-has-delete' : ''}`}
                  onClick={() => setCurrentClip(index)}
                >
                  <div className="clip-thumbnail">
                    {clipPreviewUrls[clip._id] ? (
                      <video
                        className="clip-preview-video"
                        src={`${clipPreviewUrls[clip._id]}#t=0.001`}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          const clipDuration = event.currentTarget.duration || 0;
                          setClipDurations((prev) => {
                            if (prev[clip._id]) {
                              return prev;
                            }
                            return {
                              ...prev,
                              [clip._id]: clipDuration,
                            };
                          });
                        }}
                      />
                    ) : (
                      <i className="fas fa-play"></i>
                    )}
                  </div>
                  <span className="clip-duration">{formatSeconds(clipDurations[clip._id] || 0)}</span>
                </div>
                {canDelete && (
                  <button
                    className="clip-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClipPendingDelete(clip._id);
                    }}
                    aria-label="Delete clip"
                  >
                    <i className="fas fa-trash-alt"></i>
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
        }}
        title="Upload Video"
      >
        <div className="game-upload-panel">
          <VideoUploader onUploadSuccess={handleUploadSuccess} matchId={gameId} />
        </div>
      </Modal>

      <Modal
        isOpen={!!clipPendingDelete}
        onClose={() => setClipPendingDelete(null)}
        title="Delete Clip"
      >
        <div className="confirm-dialog">
          <div className="confirm-icon danger">
            <i className="fas fa-trash-alt" />
          </div>
          <p className="confirm-message">Are you sure you want to delete this clip? This cannot be undone.</p>
          <div className="confirm-actions">
            <button
              className="modal-btn modal-btn-cancel"
              onClick={() => setClipPendingDelete(null)}
            >
              Cancel
            </button>
            <button
              className="modal-btn modal-btn-danger"
              onClick={() => {
                handleDeleteClip(clipPendingDelete);
                setClipPendingDelete(null);
              }}
            >
              <i className="fas fa-trash-alt" /> Delete
            </button>
          </div>
        </div>
      </Modal>

      {createPortal(
        <div className="bottom-action-bar">
          <button
            className="bar-btn"
            onClick={() => setShowUploadModal(true)}
          >
            <i className="fas fa-cloud-upload-alt"></i>
            Upload Video
          </button>
          <button
            className={`bar-btn primary ${!selectedTag || !videoUrl ? 'disabled' : ''}`}
            onClick={handleAddTagMoment}
            disabled={!selectedTag || !videoUrl}
          >
            <i className="fas fa-flag"></i>
            Tag at {formatSeconds(currentTime)}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GameDetails;
