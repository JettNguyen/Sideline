import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Modal from '../components/Modal';
import VideoUploader from '../components/VideoUploader';
import api from '../utils/api';
import { formatLongDate } from '../utils/date';
import { markMatchViewed } from '../utils/viewedMatches';
import './GameDetails.css';

const CLIP_TAGS_STORAGE_KEY = 'sideline.clipTags';

const readStoredClipTags = () => {
  try {
    const raw = window.localStorage.getItem(CLIP_TAGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (err) {
    console.error('Could not read clip tags:', err);
    return {};
  }
};

const formatSeconds = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const toValidDuration = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

const GameDetails = () => {
  const { gameId } = useParams();
  const videoRef = useRef(null);
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
  const [tagsByClip, setTagsByClip] = useState(() => readStoredClipTags());
  const [clipDurations, setClipDurations] = useState({});
  const [clipPreviewUrls, setClipPreviewUrls] = useState({});

  const activeClip = clips[currentClip] || null;
  const activeClipTags = activeClip ? (tagsByClip[activeClip._id] || []) : [];

  useEffect(() => {
    const loadMatch = async () => {
      try {
        const res = await api.get(`/matches/${gameId}`);
        const match = res.data;
        markMatchViewed(match._id);
        setGame({
          id: match._id,
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

  useEffect(() => {
    window.localStorage.setItem(CLIP_TAGS_STORAGE_KEY, JSON.stringify(tagsByClip));
  }, [tagsByClip]);

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
      setClipPreviewUrls((prev) => {
        const next = {};
        nextClips.forEach((clip) => {
          if (prev[clip._id]) {
            next[clip._id] = prev[clip._id];
          }
        });
        return next;
      });
      setClipDurations((prev) => {
        const next = {};
        nextClips.forEach((clip) => {
          if (prev[clip._id]) {
            next[clip._id] = prev[clip._id];
          }
        });
        return next;
      });
      setCurrentClip((prevIndex) => {
        if (!nextClips.length) {
          return 0;
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

  const formatDate = (dateStr) => {
    return formatLongDate(dateStr);
  };

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
  }, [activeClip]);

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

  const handleAddTagMoment = () => {
    if (!selectedTag || !activeClip) {
      return;
    }

    const nextTag = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: selectedTag,
      timeSec: Number(currentTime.toFixed(2)),
    };

    setTagsByClip((prev) => ({
      ...prev,
      [activeClip._id]: [...(prev[activeClip._id] || []), nextTag],
    }));
  };

  const seekToMoment = (timeSec) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = timeSec;
    setCurrentTime(timeSec);
  };

  const removeTagMoment = (tagId) => {
    if (!activeClip) {
      return;
    }

    setTagsByClip((prev) => ({
      ...prev,
      [activeClip._id]: (prev[activeClip._id] || []).filter((tag) => tag.id !== tagId),
    }));
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

  return (
    <div className="game-details-page">
      <div className="game-matchup">
        <h1 className="matchup-title">
          <span>{game.teamName}</span>
          <span className="vs">vs</span>
          <span>{game.opponent}</span>
        </h1>
        <p>Total clips: {clips.length}</p>
        <p className="matchup-date">{formatDate(game.date)}</p>
      </div>

      <div className="main-player">
        <div className="video-container">
          {videoUrl ? (
            <video
              ref={videoRef}
              className="video-player"
              key={activeClip?._id || 'no-clip'}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            >
              <source src={videoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="video-placeholder">
              <i className="fas fa-play"></i>
            </div>
          )}
        </div>
        <div className="video-controls">
          <button className="play-toggle-btn" onClick={togglePlayPause} disabled={!videoUrl}>
            <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
            {isPlaying ? 'Pause' : 'Play'}
          </button>

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
                  key={tag.id}
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
      </div>

      <div className="moment-log-section">
        <h3>Tagged Moments</h3>
        {activeClipTags.length === 0 ? (
          <p className="clips-empty-text">No moments tagged for this clip yet.</p>
        ) : (
          <div className="moment-log-list">
            {activeClipTags.map((tag) => (
              <div key={tag.id} className="moment-log-item">
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
                  onClick={() => removeTagMoment(tag.id)}
                  aria-label={`Remove ${tag.label} moment at ${formatSeconds(tag.timeSec)}`}
                  title="Remove tagged moment"
                >
                  <i className="fas fa-trash-alt"></i>
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="clips-section">
        <div className="clips-header">
          <h3>All Clips</h3>
          <button className="add-clip-btn" onClick={() => setShowUploadModal(true)}>
            <i className="fas fa-plus"></i>
          </button>
        </div>
        {isLoadingClips && <p className="clips-empty-text">Loading clips...</p>}
        {!isLoadingClips && clips.length === 0 && (
          <p className="clips-empty-text">No clips uploaded yet. Upload your first clip.</p>
        )}
        <div className="clips-grid">
          {clips.map((clip, index) => (
            <div
              key={clip._id}
              className={`clip-card ${currentClip === index ? 'active' : ''}`}
              onClick={() => setCurrentClip(index)}
            >
              <div className="clip-thumbnail">
                {clipPreviewUrls[clip._id] ? (
                  <video
                    className="clip-preview-video"
                    src={clipPreviewUrls[clip._id]}
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
          ))}
        </div>
      </div>

      <Modal
        isOpen={showUploadModal}
        onClose={async () => {
          setShowUploadModal(false);
          await handleUploadComplete();
        }}
        title="Upload from device"
      >
        <div className="game-upload-panel">
          <VideoUploader onUploadSuccess={handleUploadComplete} matchId={gameId} />
        </div>
      </Modal>

      <div className="bottom-action-bar">
        <button
          className="bar-btn"
          onClick={() => setShowUploadModal(true)}
        >
          <i className="fas fa-cloud-upload-alt"></i>
          Upload from device
        </button>
        <button 
          className={`bar-btn primary ${!selectedTag ? 'disabled' : ''}`}
          onClick={handleAddTagMoment}
          disabled={!selectedTag || !videoUrl}
        >
          <i className="fas fa-flag"></i>
          Tag at {formatSeconds(currentTime)}
        </button>
      </div>
    </div>
  );
};

export default GameDetails;
