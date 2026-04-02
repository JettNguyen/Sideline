import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Modal from '../components/Modal';
import api from '../utils/api';
import { formatMonthYear, formatShortDate } from '../utils/date';
import './Team.css';

const Team = () => {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [inviteTab, setInviteTab] = useState('search');
  const [isSwitchingTab, setIsSwitchingTab] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const justSelectedRef = useRef(false);
  const [gameDate, setGameDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [gameError, setGameError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [team, setTeam] = useState(null);
  const [games, setGames] = useState([]);
  const isOwner = (team?.membershipRole || '').toLowerCase() === 'owner';

  const toGameView = (match) => {
    const date = match.date;
    const month = formatMonthYear(match.date);

    return {
      id: match._id,
      opponent: match.opponent,
      date,
      month,
    };
  };

  useEffect(() => {
    const loadTeamData = async () => {
      setLoading(true);
      setPageError('');

      try {
        const [teamRes, matchRes] = await Promise.all([
          api.get(`/teams/${teamId}`),
          api.get(`/teams/${teamId}/matches`),
        ]);

        setTeam(teamRes.data);
        setGames((matchRes.data || []).map(toGameView));
      } catch (err) {
        console.error('Load team page error:', err);
        setPageError(err.response?.data?.message || 'Could not load this team.');
      } finally {
        setLoading(false);
      }
    };

    loadTeamData();
  }, [teamId]);

  const groupedGames = [...games]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .reduce((acc, game) => {
    if (!acc[game.month]) acc[game.month] = [];
    acc[game.month].push(game);
    return acc;
  }, {});

  const handleAddGame = () => {
    const trimmedOpponent = opponent.trim();
    if (!gameDate && !trimmedOpponent) {
      setGameError('Please select a date and enter an opponent name.');
      return;
    }

    if (!gameDate) {
      setGameError('Please select a date.');
      return;
    }

    if (!trimmedOpponent) {
      setGameError('Please enter an opponent name.');
      return;
    }

    const newGame = {
      opponent: trimmedOpponent,
      date: `${gameDate}T00:00:00.000Z`,
    };

    api.post(`/teams/${teamId}/matches`, newGame)
      .then((res) => {
        const created = toGameView(res.data);
        setGames((prev) => [created, ...prev]);
        setGameError('');
        setShowAddGameModal(false);
        setGameDate('');
        setOpponent('');
      })
      .catch((err) => {
        console.error('Create game error:', err);
        setGameError(err.response?.data?.message || 'Could not create game.');
      });
  };

  useEffect(() => {
    const q = searchQuery.trim();

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/users/search', { params: { q, teamId } });
        setSearchResults(res.data || []);
        setShowDropdown(true);
      } catch (err) {
        console.error('User search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [searchQuery, teamId]);

  const switchInviteTab = (tab) => {
    if (tab === inviteTab || isSwitchingTab) return;
    setIsSwitchingTab(true);
    setTimeout(() => {
      setInviteTab(tab);
      setIsSwitchingTab(false);
    }, 150);
  };

  const handleInviteSearch = () => {
    const username = searchQuery.trim();
    if (!username) {
      setInviteError('Please enter a username.');
      setInviteSuccess('');
      return;
    }

    api.post(`/teams/${teamId}/invites`, { username })
      .then(() => {
        setInviteSuccess('Invite sent successfully.');
        setInviteError('');
        setSearchQuery('');
        setSearchResults([]);
        setShowDropdown(false);
      })
      .catch((err) => {
        console.error('Send invite error:', err);
        setInviteError(err.response?.data?.message || 'Could not send invite.');
        setInviteSuccess('');
      });
  };

  const inviteCode = team?.inviteCode || '';
  const inviteLink = inviteCode ? `${window.location.origin}/?invite=${inviteCode}` : '';
  const qrImageUrl = inviteLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteLink)}`
    : '';

  const handleCopyInviteCode = async () => {
    if (!inviteCode) {
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteCode);
      } else {
        // Fallback for HTTP (local dev) and older iOS Safari
        const textarea = document.createElement('textarea');
        textarea.value = inviteCode;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setInviteSuccess('Invite code copied.');
      setInviteError('');
    } catch (err) {
      console.error('Copy invite code error:', err);
      setInviteError('Could not copy invite code.');
      setInviteSuccess('');
    }
  };

  const formatDate = (dateStr) => {
    return formatShortDate(dateStr);
  };

  const handleDeleteTeam = () => {
    if (!team || !isOwner) return;
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteTeam = async () => {
    try {
      setIsDeletingTeam(true);
      await api.delete(`/teams/${teamId}`);
      navigate('/');
    } catch (err) {
      console.error('Delete team error:', err);
      setPageError(err.response?.data?.message || 'Could not delete team.');
      setShowDeleteConfirmModal(false);
    } finally {
      setIsDeletingTeam(false);
    }
  };

  return (
    <div className="team-page">
      <div className="team-header">
        <h1 className="team-name">{team?.name || 'Team'}</h1>
        <div className="team-header-actions">
          {isOwner && (
            <button
              className="delete-team-btn"
              onClick={handleDeleteTeam}
              disabled={isDeletingTeam}
            >
              {isDeletingTeam ? 'Deleting...' : 'Delete Team'}
            </button>
          )}
          <button className="invite-btn" onClick={() => setShowInviteModal(true)}>
            <i className="fas fa-user-plus"></i>
          </button>
        </div>
      </div>

      {pageError && <p className="team-error-text">{pageError}</p>}
      {loading && <p className="team-loading-text">Loading team...</p>}

      <div className="games-list">
        <div
          className="add-game-card"
          onClick={() => {
            setGameError('');
            setShowAddGameModal(true);
          }}
        >
            <i className="fas fa-plus"></i>
            <span>Add Game</span>
        </div>
        {!loading && games.length === 0 && (
          <p className="team-loading-text">No games yet. Add your first match.</p>
        )}

        {Object.entries(groupedGames).map(([month, monthGames]) => (
          <div key={month} className="month-group">
            <h3 className="month-header">{month}</h3>
            
            {monthGames.map(game => (
              <Link
                key={game.id}
                to={`/team/${teamId}/game/${game.id}`}
                className="game-card"
              >
                <div className="game-info">
                  <span className="game-opponent">vs {game.opponent}</span>
                  <span className="game-date">{formatDate(game.date)}</span>
                </div>
                <i className="fas fa-arrow-right"></i>
              </Link>
            ))}
          </div>
        ))}
      </div>

      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteError('');
          setInviteSuccess('');
          setSearchQuery('');
          setSearchResults([]);
          setShowDropdown(false);
        }}
        title="Invite to Team"
      >
        <div className="invite-tabs">
          <button
            className={`invite-tab ${inviteTab === 'search' ? 'active' : ''}`}
            onClick={() => switchInviteTab('search')}
          >
            Search User
          </button>
          <button
            className={`invite-tab ${inviteTab === 'code' ? 'active' : ''}`}
            onClick={() => switchInviteTab('code')}
          >
            Invite Code
          </button>
        </div>

        <div className={`invite-panel${isSwitchingTab ? ' switching' : ''}`}>
          {inviteTab === 'search' ? (
            <div className="invite-search">
              <label className="modal-label">Username or email</label>
              <div className="user-search-wrap">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="modal-input"
                  placeholder="Search by username or email..."
                  value={searchQuery}
                  autoComplete="off"
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (inviteError) setInviteError('');
                    if (inviteSuccess) setInviteSuccess('');
                  }}
                />
                {showDropdown && searchResults.length > 0 && (
                  <ul className="user-search-dropdown">
                    {searchResults.map((user) => (
                      <li
                        key={user._id}
                        className="user-search-result"
                        onClick={() => {
                          justSelectedRef.current = true;
                          setSearchQuery(user.username);
                          setShowDropdown(false);
                          searchInputRef.current?.blur();
                        }}
                      >
                        <i className="fas fa-user"></i>
                        {user.username}
                      </li>
                    ))}
                  </ul>
                )}
                {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                  <p className="user-search-hint">No users found</p>
                )}
              </div>
              <button className="modal-btn modal-btn-primary" onClick={handleInviteSearch}>
                Send Invite
              </button>
              {inviteError && <p className="team-error-text">{inviteError}</p>}
              {inviteSuccess && <p className="team-success-text">{inviteSuccess}</p>}
            </div>
          ) : (
            <div className="invite-code-section">
              <div className="invite-code-box">
                <p className="invite-code-label">Share this code</p>
                <span className="invite-code">{team?.inviteCode || 'N/A'}</span>
              </div>

              {qrImageUrl ? (
                <img src={qrImageUrl} alt="Team invite QR code" className="team-qr-image" />
              ) : (
                <div className="qr-placeholder">QR Code</div>
              )}

              <button className="modal-btn modal-btn-secondary" onClick={handleCopyInviteCode}>
                <i className="fas fa-copy"></i>
                Copy Code
              </button>
              {inviteLink && <p className="team-link-text">Join link: {inviteLink}</p>}
              {inviteError && <p className="team-error-text">{inviteError}</p>}
              {inviteSuccess && <p className="team-success-text">{inviteSuccess}</p>}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showAddGameModal}
        onClose={() => {
          setGameError('');
          setShowAddGameModal(false);
        }}
        title="Add New Game"
      >
        <label className="modal-label">Date</label>
        <input
          type="date"
          className="modal-input"
          value={gameDate}
          onChange={(e) => {
            setGameDate(e.target.value);
            if (gameError) {
              setGameError('');
            }
          }}
        />

        <label className="modal-label">Opponent</label>
        <input
          type="text"
          className="modal-input"
          placeholder="Team name..."
          value={opponent}
          onChange={(e) => {
            setOpponent(e.target.value);
            if (gameError) {
              setGameError('');
            }
          }}
        />

        {gameError && <p className="team-error-text">{gameError}</p>}

        <p className="game-hint">
          <i className="fas fa-info-circle"></i>
          You can upload footage after creating the game
        </p>

        <button
          className="modal-btn modal-btn-primary"
          onClick={handleAddGame}
        >
          Create Game
        </button>
      </Modal>

      <Modal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        title="Delete Team"
      >
        <div className="confirm-dialog">
          <div className="confirm-icon danger">
            <i className="fas fa-triangle-exclamation"></i>
          </div>
          <p className="confirm-message">
            This will permanently delete <strong>{team?.name}</strong> and remove all matches, clips, and memberships.
          </p>
          <div className="confirm-actions">
            <button
              className="modal-btn modal-btn-cancel"
              onClick={() => setShowDeleteConfirmModal(false)}
              disabled={isDeletingTeam}
            >
              Cancel
            </button>
            <button
              className="modal-btn modal-btn-danger"
              onClick={confirmDeleteTeam}
              disabled={isDeletingTeam}
            >
              {isDeletingTeam ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Team;
