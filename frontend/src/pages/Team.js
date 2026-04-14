import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Modal from '../components/Modal';
import api from '../utils/api';
import { formatMonthYear, formatShortDate } from '../utils/date';
import { useAuth } from '../context/AuthContext';
import useDelayedLoadingIndicator from '../hooks/useDelayedLoadingIndicator';
import './Team.css';

const ROLE_ORDER = { owner: 0, coach: 1, parent: 2, player: 3 };
const CLIENT_APP_URL = 'https://jettnguyen.github.io/Sideline';

const Team = () => {
  const navigate = useNavigate();
  const { teamId } = useParams();
  const { user } = useAuth();

  // Team & games
  const [team, setTeam] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPageContentVisible, setIsPageContentVisible] = useState(false);
  const [pageError, setPageError] = useState('');

  // Roster
  const [members, setMembers] = useState([]);
  const [memberPicUrls, setMemberPicUrls] = useState({});
  const [isRosterCollapsed, setIsRosterCollapsed] = useState(true);

  // Join requests
  const [joinRequests, setJoinRequests] = useState([]);
  const [joinRequestPicUrls, setJoinRequestPicUrls] = useState({});

  // Member action sheet
  const [selectedMember, setSelectedMember] = useState(null);
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const [memberClips, setMemberClips] = useState([]);
  const [loadingMemberClips, setLoadingMemberClips] = useState(false);
  const [memberClipThumbUrls, setMemberClipThumbUrls] = useState({});
  const [showMemberClipsModal, setShowMemberClipsModal] = useState(false);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState('search');
  const [isSwitchingTab, setIsSwitchingTab] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteRole, setInviteRole] = useState('player');
  const [requestRoleByUser, setRequestRoleByUser] = useState({});
  const searchInputRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Add game modal
  const [showAddGameModal, setShowAddGameModal] = useState(false);
  const [gameDate, setGameDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [gameError, setGameError] = useState('');

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: '', location: '', isPublic: false });
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Delete confirm modal
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const myRole = team?.membershipRole || '';
  const isOwnerOrCoach = ['owner', 'coach'].includes(myRole);
  const assignableRoles = myRole === 'owner' ? ['coach', 'parent', 'player'] : ['parent', 'player'];
  const showTeamLoadingIndicator = useDelayedLoadingIndicator(loading, 1000);
  const showMemberClipsLoadingIndicator = useDelayedLoadingIndicator(loadingMemberClips, 1000);

  const canRemoveMember = (member) => {
    if (!member) return false;
    if (!isOwnerOrCoach) return false;
    if (myRole === 'coach' && ['owner', 'coach'].includes(member.role)) return false;
    if (member.role === 'owner' && member.user?._id === user?._id) return false;
    return true;
  };


  const toGameView = (match) => ({
    id: match._id,
    opponent: match.opponent,
    date: match.date,
    month: formatMonthYear(match.date),
  });

  useEffect(() => {
    const loadTeamData = async () => {
      setLoading(true);
      setPageError('');
      try {
        const [teamRes, matchRes, membersRes] = await Promise.all([
          api.get(`/teams/${teamId}`),
          api.get(`/teams/${teamId}/matches`),
          api.get(`/teams/${teamId}/members`),
        ]);

        const teamData = teamRes.data;
        setTeam(teamData);
        setGames((matchRes.data || []).map(toGameView));
        setMembers(membersRes.data || []);

        // Load join requests if owner/coach
        if (['owner', 'coach'].includes(teamData.membershipRole)) {
          try {
            const reqRes = await api.get(`/teams/${teamId}/requests`);
            const requests = reqRes.data || [];
            setJoinRequests(requests);
            setRequestRoleByUser((prev) => {
              const next = { ...prev };
              const allowedRoles = teamData.membershipRole === 'owner'
                ? ['coach', 'parent', 'player']
                : ['parent', 'player'];
              requests.forEach((request) => {
                const fallbackRole = teamData.membershipRole === 'owner' ? 'parent' : 'player';
                const initialRole = allowedRoles.includes(request.role) ? request.role : fallbackRole;
                next[request.user._id] = next[request.user._id] || initialRole;
              });
              return next;
            });
          } catch {}
        }
      } catch (err) {
        console.error('Load team page error:', err);
        setPageError(err.response?.data?.message || 'Could not load this team.');
      } finally {
        setLoading(false);
      }
    };
    loadTeamData();
  }, [teamId]);

  useEffect(() => {
    if (loading) {
      setIsPageContentVisible(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setIsPageContentVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [loading, teamId]);

  // Lazy-load member profile pics
  useEffect(() => {
    if (!members.length) return;
    let cancelled = false;

    const fetchPics = async () => {
      const membersWithPic = members.filter(
        (m) => m.user?.profilePicture && !memberPicUrls[m.user._id]
      );
      if (!membersWithPic.length) return;

      const entries = await Promise.all(
        membersWithPic.map(async (m) => {
          try {
            const res = await api.get(`/images/user/${m.user._id}`);
            return [m.user._id, res.data.url];
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setMemberPicUrls((prev) => {
        const next = { ...prev };
        entries.forEach((e) => { if (e) next[e[0]] = e[1]; });
        return next;
      });
    };

    fetchPics();
    return () => { cancelled = true; };
  }, [members]);

  // Lazy-load join request profile pics
  useEffect(() => {
    if (!joinRequests.length) return;
    let cancelled = false;

    const fetchJoinRequestPics = async () => {
      const requestsWithPic = joinRequests.filter(
        (request) => request.user?.profilePicture && !joinRequestPicUrls[request.user._id]
      );

      if (!requestsWithPic.length) return;

      const entries = await Promise.all(
        requestsWithPic.map(async (request) => {
          try {
            const res = await api.get(`/images/user/${request.user._id}`);
            return [request.user._id, res.data.url];
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setJoinRequestPicUrls((prev) => {
        const next = { ...prev };
        entries.forEach((e) => { if (e) next[e[0]] = e[1]; });
        return next;
      });
    };

    fetchJoinRequestPics();
    return () => { cancelled = true; };
  }, [joinRequests]);

  useEffect(() => {
    if (joinRequests.length > 0) {
      setIsRosterCollapsed(false);
    }
  }, [joinRequests.length]);

  const handleAcceptRequest = async (userId) => {
    try {
      const selectedRole = requestRoleByUser[userId] || 'player';
      await api.patch(`/teams/${teamId}/requests/${userId}`, { action: 'accept', role: selectedRole });
      setJoinRequests((prev) => prev.filter((r) => r.user._id !== userId));
      setRequestRoleByUser((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      // Refresh members list
      const res = await api.get(`/teams/${teamId}/members`);
      setMembers(res.data || []);
    } catch (err) {
      console.error('Accept request error:', err);
      setPageError(err.response?.data?.message || 'Could not accept request.');
    }
  };

  const handleDenyRequest = async (userId) => {
    try {
      await api.patch(`/teams/${teamId}/requests/${userId}`, { action: 'deny' });
      setJoinRequests((prev) => prev.filter((r) => r.user._id !== userId));
      setRequestRoleByUser((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (err) {
      console.error('Deny request error:', err);
    }
  };

  const handleMemberTap = (member) => {
    setSelectedMember(member);
    setShowMemberSheet(true);
  };

  const handleViewMemberClips = async (member) => {
    setShowMemberSheet(false);
    setSelectedMember(member);
    setMemberClips([]);
    setMemberClipThumbUrls({});
    setLoadingMemberClips(true);
    setShowMemberClipsModal(true);

    try {
      const res = await api.get(`/videos/member/${member.user._id}`);
      const clips = res.data || [];
      setMemberClips(clips);

      // Lazy-load thumbnails
      const entries = await Promise.all(
        clips.map(async (clip) => {
          try {
            const r = await api.get(`/videos/${clip._id}/play`);
            return [clip._id, r.data.url];
          } catch {
            return null;
          }
        })
      );
      setMemberClipThumbUrls((prev) => {
        const next = { ...prev };
        entries.forEach((e) => { if (e) next[e[0]] = e[1]; });
        return next;
      });
    } catch (err) {
      console.error('Load member clips error:', err);
    } finally {
      setLoadingMemberClips(false);
    }
  };

  const handleRemoveMember = async (member) => {
    setShowMemberSheet(false);
    try {
      await api.delete(`/teams/${teamId}/members/${member.user._id}`);
      setMembers((prev) => prev.filter((m) => m.user._id !== member.user._id));
    } catch (err) {
      console.error('Remove member error:', err);
      setPageError(err.response?.data?.message || 'Could not remove member.');
    }
  };

  const switchInviteTab = (tab) => {
    if (tab === inviteTab || isSwitchingTab) return;
    setIsSwitchingTab(true);
    setTimeout(() => {
      setInviteTab(tab);
      setIsSwitchingTab(false);
    }, 150);
  };

  useEffect(() => {
    const q = searchQuery.trim();
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    if (q.length < 2) { setSearchResults([]); setShowDropdown(false); return; }

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

    return () => { clearTimeout(timer); setIsSearching(false); };
  }, [searchQuery, teamId]);

  const handleInviteSearch = () => {
    const username = searchQuery.trim();
    if (!username) { setInviteError('Please enter a username.'); setInviteSuccess(''); return; }

    api.post(`/teams/${teamId}/invites`, { username, role: inviteRole })
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

  const handleCopyInviteCode = async () => {
    const inviteCode = team?.inviteCode;
    if (!inviteCode) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteCode);
      } else {
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

  const handleAddGame = () => {
    const trimmedOpponent = opponent.trim();
    if (!gameDate && !trimmedOpponent) { setGameError('Please select a date and enter an opponent name.'); return; }
    if (!gameDate) { setGameError('Please select a date.'); return; }
    if (!trimmedOpponent) { setGameError('Please enter an opponent name.'); return; }

    api.post(`/teams/${teamId}/matches`, {
      opponent: trimmedOpponent,
      date: `${gameDate}T00:00:00.000Z`,
    })
      .then((res) => {
        setGames((prev) => [toGameView(res.data), ...prev]);
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

  const openSettings = () => {
    setSettingsForm({
      name: team?.name || '',
      location: team?.location || '',
      isPublic: team?.isPublic || false,
    });
    setSettingsError('');
    setShowSettingsModal(true);
  };

  const saveSettings = async () => {
    const name = settingsForm.name.trim();
    if (!name) { setSettingsError('Team name is required.'); return; }

    setSettingsSaving(true);
    setSettingsError('');
    try {
      const res = await api.patch(`/teams/${teamId}`, {
        name,
        location: settingsForm.location.trim(),
        isPublic: settingsForm.isPublic,
      });
      setTeam((prev) => ({ ...prev, ...res.data }));
      setShowSettingsModal(false);
    } catch (err) {
      console.error('Save settings error:', err);
      setSettingsError(err.response?.data?.message || 'Could not save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const confirmDeleteTeam = async () => {
    setIsDeletingTeam(true);
    try {
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

  // ─── Derived UI helpers ───────────────────────────────────────────────────
  const inviteCode = team?.inviteCode || '';
  const inviteLink = inviteCode ? `${CLIENT_APP_URL}/?invite=${inviteCode}` : '';
  const qrImageUrl = inviteLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteLink)}`
    : '';

  const groupedGames = [...games]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .reduce((acc, game) => {
      if (!acc[game.month]) acc[game.month] = [];
      acc[game.month].push(game);
      return acc;
    }, {});

  const sortedMembers = [...members].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`team-page ${isPageContentVisible ? 'is-ready' : 'is-entering'}`}>

      <div className="team-header team-enter-item" style={{ '--enter-delay': '0ms' }}>
        <h1 className="team-name">{team?.name || 'Team'}</h1>
        <div className="team-header-actions">
          <button className="invite-btn" onClick={() => setShowInviteModal(true)} aria-label="Invite">
            <i className="fas fa-user-plus" />
          </button>
          {isOwnerOrCoach && (
            <button className="settings-btn" onClick={openSettings} aria-label="Team settings">
              <i className="fas fa-gear" />
            </button>
          )}
        </div>
      </div>

      {pageError && <p className="team-error-text team-enter-item" style={{ '--enter-delay': '40ms' }}>{pageError}</p>}
      {showTeamLoadingIndicator && <p className="team-loading-text">Loading team...</p>}

      {!loading && members.length > 0 && (
        <div className="roster-section team-enter-item" style={{ '--enter-delay': '70ms' }}>
          <div
            className="roster-header"
            onClick={() => setIsRosterCollapsed(!isRosterCollapsed)}
            style={{ cursor: 'pointer' }}
          >
            <div>
              <p className="roster-heading">Roster <span className="roster-count">{members.length}</span></p>
            </div>
            <button
              className="roster-toggle-btn"
              onClick={(e) => { e.stopPropagation(); setIsRosterCollapsed(!isRosterCollapsed); }}
              aria-label={isRosterCollapsed ? 'Expand roster' : 'Collapse roster'}
            >
              <i className={`fas fa-chevron-${isRosterCollapsed ? 'down' : 'up'}`} />
            </button>
          </div>
          {!isRosterCollapsed && (
            <div className="roster-scroll">
              {sortedMembers.map((member) => (
                <button
                  key={member._id}
                  className="roster-card"
                  onClick={() => handleMemberTap(member)}
                >
                  <div className="roster-avatar">
                    {memberPicUrls[member.user?._id] ? (
                      <img
                        src={memberPicUrls[member.user._id]}
                        alt={member.user.username}
                        className="roster-avatar-img"
                      />
                    ) : (
                      <i className="fas fa-user" />
                    )}
                  </div>
                  <p className="roster-name">{member.user?.username || '—'}</p>
                  <p className="roster-role">{member.role}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isOwnerOrCoach && joinRequests.length > 0 && (
        <div className="requests-section team-enter-item" style={{ '--enter-delay': '100ms' }}>
          <p className="requests-heading">
            <i className="fas fa-user-clock" /> Pending Requests
          </p>
          {joinRequests.map((req) => (
            <div key={req._id} className="request-card">
              <div className="request-user">
                <div className="request-avatar">
                  {joinRequestPicUrls[req.user?._id] ? (
                    <img
                      src={joinRequestPicUrls[req.user._id]}
                      alt={req.user?.username || 'User'}
                      className="request-avatar-img"
                    />
                  ) : (
                    <i className="fas fa-user" />
                  )}
                </div>
                <div className="request-user-text">
                  <p className="request-username">{req.user?.username || 'Unknown'}</p>
                  <p className="request-email">{req.user?.email || 'No email available'}</p>
                </div>
              </div>
              <div className="request-actions">
                <select
                  className="request-role-select"
                  value={requestRoleByUser[req.user._id] || (myRole === 'owner' ? 'parent' : 'player')}
                  onChange={(e) => {
                    const role = e.target.value;
                    setRequestRoleByUser((prev) => ({ ...prev, [req.user._id]: role }));
                  }}
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <button className="request-btn accept" onClick={() => handleAcceptRequest(req.user._id)}>
                  Accept
                </button>
                <button className="request-btn deny" onClick={() => handleDenyRequest(req.user._id)}>
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="games-list team-enter-item" style={{ '--enter-delay': '130ms' }}>
        <div className="add-game-card" onClick={() => { setGameError(''); setShowAddGameModal(true); }}>
          <i className="fas fa-plus" />
          <span>Add Game</span>
        </div>
        {!loading && games.length === 0 && (
          <p className="team-loading-text">No games yet. Add your first match.</p>
        )}
        {Object.entries(groupedGames).map(([month, monthGames]) => (
          <div key={month} className="month-group">
            <h3 className="month-header">{month}</h3>
            {monthGames.map((game) => (
              <Link key={game.id} to={`/team/${teamId}/game/${game.id}`} className="game-card">
                <div className="game-info">
                  <span className="game-opponent">vs {game.opponent}</span>
                  <span className="game-date">{formatShortDate(game.date)}</span>
                </div>
                <i className="fas fa-arrow-right" />
              </Link>
            ))}
          </div>
        ))}
      </div>

      <Modal
        isOpen={showMemberSheet && !!selectedMember}
        onClose={() => setShowMemberSheet(false)}
        title={selectedMember?.user?.username}
      >
        <p className="sheet-member-role">{selectedMember?.role}</p>
        <button
          className="sheet-btn"
          onClick={() => handleViewMemberClips(selectedMember)}
        >
          <i className="fas fa-film" /> View Clips
        </button>
        {canRemoveMember(selectedMember) && (
          <button
            className="sheet-btn danger"
            onClick={() => handleRemoveMember(selectedMember)}
          >
            <i className="fas fa-user-minus" /> Remove from Team
          </button>
        )}
        <button className="sheet-btn cancel" onClick={() => setShowMemberSheet(false)}>
          Cancel
        </button>
      </Modal>

      <Modal
        isOpen={showMemberClipsModal}
        onClose={() => setShowMemberClipsModal(false)}
        title={`${selectedMember?.user?.username || ''}'s Clips`}
      >
        {showMemberClipsLoadingIndicator && <p className="team-loading-text">Loading clips...</p>}
        {!loadingMemberClips && memberClips.length === 0 && (
          <p className="team-loading-text">No shared clips found.</p>
        )}
        {!loadingMemberClips && memberClips.length > 0 && (
          <div className="member-clips-grid">
            {memberClips.map((clip) => (
              <button
                key={clip._id}
                className="member-clip-item"
                onClick={() => {
                  setShowMemberClipsModal(false);
                  navigate(
                    `/team/${clip.match?.team?._id}/game/${clip.match?._id}?clipId=${clip._id}`
                  );
                }}
              >
                <div className="member-clip-thumb">
                  {memberClipThumbUrls[clip._id] ? (
                    <video
                      className="member-clip-preview"
                      src={`${memberClipThumbUrls[clip._id]}#t=0.001`}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <i className="fas fa-play" />
                  )}
                </div>
                <div className="member-clip-info">
                  <p className="member-clip-match">
                    {clip.match?.team?.name} vs {clip.match?.opponent}
                  </p>
                  <p className="member-clip-date">{formatShortDate(clip.match?.date)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteError('');
          setInviteSuccess('');
          setInviteRole('player');
          setSearchQuery('');
          setSearchResults([]);
          setShowDropdown(false);
        }}
        title="Invite to Team"
      >
        <div className="invite-tabs">
          <button className={`invite-tab ${inviteTab === 'search' ? 'active' : ''}`} onClick={() => switchInviteTab('search')}>
            Search User
          </button>
          <button className={`invite-tab ${inviteTab === 'code' ? 'active' : ''}`} onClick={() => switchInviteTab('code')}>
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
                    {searchResults.map((u) => (
                      <li
                        key={u._id}
                        className="user-search-result"
                        onClick={() => {
                          justSelectedRef.current = true;
                          setSearchQuery(u.username);
                          setShowDropdown(false);
                          searchInputRef.current?.blur();
                        }}
                      >
                        <i className="fas fa-user" />
                        {u.username}
                      </li>
                    ))}
                  </ul>
                )}
                {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                  <p className="user-search-hint">No users found</p>
                )}
              </div>
              <label className="modal-label">Role</label>
              <select
                className="modal-input invite-role-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
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
                <i className="fas fa-copy" /> Copy Code
              </button>
              {inviteLink && <p className="team-link-text">Join link: {inviteLink}</p>}
              {inviteError && <p className="team-error-text">{inviteError}</p>}
              {inviteSuccess && <p className="team-success-text">{inviteSuccess}</p>}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={showAddGameModal} onClose={() => { setGameError(''); setShowAddGameModal(false); }} title="Add New Game">
        <label className="modal-label">Date</label>
        <input
          type="date"
          className="modal-input"
          value={gameDate}
          onChange={(e) => { setGameDate(e.target.value); if (gameError) setGameError(''); }}
        />
        <label className="modal-label">Opponent</label>
        <input
          type="text"
          className="modal-input"
          placeholder="Team name..."
          value={opponent}
          onChange={(e) => { setOpponent(e.target.value); if (gameError) setGameError(''); }}
        />
        {gameError && <p className="team-error-text">{gameError}</p>}
        <p className="game-hint">
          <i className="fas fa-info-circle" /> You can upload footage after creating the game
        </p>
        <button className="modal-btn modal-btn-primary" onClick={handleAddGame}>Create Game</button>
      </Modal>

      <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Team Settings">
        <label className="modal-label">Team name</label>
        <input
          type="text"
          className="modal-input"
          value={settingsForm.name}
          onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
          autoFocus
        />
        <label className="modal-label">Location</label>
        <input
          type="text"
          className="modal-input"
          placeholder="e.g. Gainesville, FL"
          value={settingsForm.location}
          onChange={(e) => setSettingsForm({ ...settingsForm, location: e.target.value })}
        />
        <div className="settings-toggle-row">
          <div>
            <p className="modal-label">Visibility</p>
            <p className="settings-toggle-hint">
              {settingsForm.isPublic
                ? 'Allow others to find and request to join'
                : 'Only team members can access this team'}
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settingsForm.isPublic}
              onChange={(e) => setSettingsForm({ ...settingsForm, isPublic: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {settingsError && <p className="team-error-text">{settingsError}</p>}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={() => setShowSettingsModal(false)} disabled={settingsSaving}>
            Cancel
          </button>
          <button className="modal-btn modal-btn-primary" onClick={saveSettings} disabled={settingsSaving}>
            {settingsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {myRole === 'owner' && (
          <div className="settings-danger-zone">
            <p className="danger-zone-label">Danger Zone</p>
            <button
              className="modal-btn modal-btn-danger"
              onClick={() => { setShowSettingsModal(false); setShowDeleteConfirmModal(true); }}
            >
              Delete Team
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={showDeleteConfirmModal} onClose={() => setShowDeleteConfirmModal(false)} title="Delete Team">
        <div className="confirm-dialog">
          <div className="confirm-icon danger">
            <i className="fas fa-triangle-exclamation" />
          </div>
          <p className="confirm-message">
            This will permanently delete <strong>{team?.name}</strong> and remove all matches, clips, and memberships.
          </p>
          <div className="confirm-actions">
            <button className="modal-btn modal-btn-cancel" onClick={() => setShowDeleteConfirmModal(false)} disabled={isDeletingTeam}>
              Cancel
            </button>
            <button className="modal-btn modal-btn-danger" onClick={confirmDeleteTeam} disabled={isDeletingTeam}>
              {isDeletingTeam ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default Team;
