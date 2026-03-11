import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../utils/api';
import Modal from '../components/Modal';
import { formatShortDate } from '../utils/date';
import { getViewedMatchIdSet } from '../utils/viewedMatches';
import './Home.css';

const Home = () => {
  const location = useLocation();
  const [teams, setTeams] = useState([]);
  const [matchesByTeam, setMatchesByTeam] = useState({});
  const [invites, setInvites] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showTeamActionModal, setShowTeamActionModal] = useState(false);
  const [teamActionTab, setTeamActionTab] = useState('create');

  const [openSections, setOpenSections] = useState({
    recentGames: false,
    upcomingMatches: false,
  });

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const teamRes = await api.get('/teams');
      const teamList = teamRes.data || [];
      setTeams(teamList);

      const matchEntries = await Promise.all(
        teamList.map(async (team) => {
          const res = await api.get(`/teams/${team._id}/matches`);
          return [team._id, res.data || []];
        })
      );

      setMatchesByTeam(Object.fromEntries(matchEntries));
    } catch (err) {
      console.error('Load dashboard error:', err);
      setError(err.response?.data?.message || 'Could not load dashboard data.');
      setTeams([]);
      setMatchesByTeam({});
    } finally {
      setLoading(false);
    }
  };

  const loadInvites = async () => {
    try {
      const res = await api.get('/invites');
      setInvites(res.data || []);
    } catch (err) {
      console.error('Load invites error:', err);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      await loadDashboard();
      await loadInvites();
    };

    initialize();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteFromQuery = params.get('invite');
    if (inviteFromQuery) {
      setJoinCode(inviteFromQuery.toUpperCase());
      setTeamActionTab('join');
      setShowTeamActionModal(true);
    }
  }, [location.search]);

  const recentGamesFeed = useMemo(() => {
    const rows = teams.flatMap((team) => {
      const matches = matchesByTeam[team._id] || [];
      return matches.map((match) => ({
        id: match._id,
        teamId: team._id,
        teamName: team.name,
        opponent: match.opponent,
        date: match.date,
      }));
    });

    return rows
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
  }, [matchesByTeam, teams]);

  const upcomingMatchesFeed = useMemo(() => {
    const now = new Date();
    return recentGamesFeed
      .filter((match) => new Date(match.date) >= now)
      .slice(0, 8);
  }, [recentGamesFeed]);

  const viewedMatchIds = useMemo(() => getViewedMatchIdSet(), [matchesByTeam, teams]);

  const recentGamesNotificationCount = useMemo(
    () => recentGamesFeed.filter((game) => !viewedMatchIds.has(game.id)).length,
    [recentGamesFeed, viewedMatchIds]
  );

  const upcomingMatchesNotificationCount = useMemo(
    () => upcomingMatchesFeed.filter((match) => !viewedMatchIds.has(match.id)).length,
    [upcomingMatchesFeed, viewedMatchIds]
  );

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) {
      setError('Please enter a team name.');
      return;
    }

    try {
      await api.post('/teams', { name });
      setNewTeamName('');
      await loadDashboard();
      setShowTeamActionModal(false);
    } catch (err) {
      console.error('Create team error:', err);
      setError(err.response?.data?.message || 'Could not create team.');
    }
  };

  const handleJoinTeam = async () => {
    const inviteCode = joinCode.trim().toUpperCase();
    if (!inviteCode) {
      setJoinError('Please enter an invite code.');
      setJoinMessage('');
      return;
    }

    try {
      const res = await api.post('/teams/join', { inviteCode });
      setJoinMessage(res.data?.message || 'Joined team successfully.');
      setJoinError('');
      setJoinCode('');
      await loadDashboard();
      await loadInvites();
      setShowTeamActionModal(false);
    } catch (err) {
      console.error('Join team error:', err);
      setJoinError(err.response?.data?.message || 'Could not join team.');
      setJoinMessage('');
    }
  };

  const handleRespondInvite = async (inviteId, action) => {
    try {
      await api.post(`/invites/${inviteId}/respond`, { action });
      await loadDashboard();
      await loadInvites();
    } catch (err) {
      console.error('Respond invite error:', err);
      setError(err.response?.data?.message || 'Could not update invite.');
    }
  };

  const formatDate = (dateStr) => formatShortDate(dateStr);

  const toggleSection = (sectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  return (
    <div className="home-container">
      <div className="dashboard-head">
        <h1>Dashboard</h1>
        <button
          type="button"
          className="dashboard-add-btn"
          aria-label="Create or join team"
          onClick={() => setShowTeamActionModal(true)}
        >
          <i className="fas fa-plus"></i>
        </button>
      </div>

      {joinError && <p className="home-error-text">{joinError}</p>}
      {joinMessage && <p className="home-success-text">{joinMessage}</p>}

      {invites.length > 0 && (
        <div className="invite-notification-card">
          <h3 className="invite-notification-title">Team Invites</h3>
          {invites.map((invite) => (
            <div key={invite._id} className="invite-notification-row">
              <div>
                <p className="feed-main">{invite.team?.name || 'Team'} invited you</p>
                <p className="feed-sub">Role: {invite.role}</p>
              </div>
              <div className="invite-notification-actions">
                <button
                  className="team-create-btn"
                  onClick={() => handleRespondInvite(invite._id, 'accept')}
                >
                  Accept
                </button>
                <button
                  className="team-create-btn invite-decline-btn"
                  onClick={() => handleRespondInvite(invite._id, 'decline')}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="home-error-text">{error}</p>}

      {loading && <p className="no-games">Loading dashboard...</p>}
      
      <div className="teams-list">
        {!loading && teams.length === 0 && (
          <p className="no-teams">No teams yet. Create your first team to get started.</p>
        )}

        {teams.map(team => {
          const recentGames = (matchesByTeam[team._id] || []).slice(0, 3);
          const teamNotificationCount = (matchesByTeam[team._id] || []).filter(
            (match) => !viewedMatchIds.has(match._id)
          ).length;
          return (
          <div key={team._id} className="team-card">
            <Link to={`/team/${team._id}`} className="team-card-header">
              <div className="team-card-header-title">
                <h2>{team.name}</h2>
                {teamNotificationCount > 0 && (
                  <span className="notification-badge" aria-label={`${teamNotificationCount} unviewed matches`}>
                    {teamNotificationCount}
                  </span>
                )}
              </div>
              <i className="fas fa-chevron-right"></i>
            </Link>
            
            <div className="recent-games">
              {recentGames.length > 0 ? (
                recentGames.map(game => (
                  <Link
                    key={game._id}
                    to={`/team/${team._id}/game/${game._id}`}
                    className="recent-game"
                  >
                    <span className="opponent">vs {game.opponent}</span>
                    <span className="date">{formatDate(game.date)}</span>
                  </Link>
                ))
              ) : (
                <p className="no-games">No recent games</p>
              )}
            </div>
          </div>
        )})}
        <div className="section-divider" role="separator" aria-label="Feed section">
          <span>Feeds</span>
        </div>

        <div className="feed-card">
          <button
            className="feed-header"
            onClick={() => toggleSection('recentGames')}
            aria-expanded={openSections.recentGames}
            aria-controls="recent-games-feed"
          >
            <div className="feed-title-group">
              <h2>Recent Games</h2>
              {recentGamesNotificationCount > 0 && (
                <span className="notification-badge" aria-label={`${recentGamesNotificationCount} unviewed recent games`}>
                  {recentGamesNotificationCount}
                </span>
              )}
            </div>
            <i className={`fas ${openSections.recentGames ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </button>

          {openSections.recentGames && (
            <div id="recent-games-feed" className="feed-content">
              {recentGamesFeed.map((game) => (
                <Link
                  key={`${game.teamId}-${game.id}`}
                  to={`/team/${game.teamId}/game/${game.id}`}
                  className="feed-item"
                >
                  <div>
                    <p className="feed-main">{game.teamName} vs {game.opponent}</p>
                    <p className="feed-sub">Game recap</p>
                  </div>
                  <span className="feed-date">{formatDate(game.date)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="feed-card">
          <button
            className="feed-header"
            onClick={() => toggleSection('upcomingMatches')}
            aria-expanded={openSections.upcomingMatches}
            aria-controls="upcoming-matches-feed"
          >
            <div className="feed-title-group">
              <h2>Upcoming Matches</h2>
              {upcomingMatchesNotificationCount > 0 && (
                <span className="notification-badge" aria-label={`${upcomingMatchesNotificationCount} unopened upcoming matches`}>
                  {upcomingMatchesNotificationCount}
                </span>
              )}
            </div>
            <i className={`fas ${openSections.upcomingMatches ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </button>

          {openSections.upcomingMatches && (
            <div id="upcoming-matches-feed" className="feed-content">
              {upcomingMatchesFeed.map((match) => (
                <Link
                  key={match.id}
                  to={`/team/${match.teamId}/game/${match.id}`}
                  className="feed-item"
                >
                  <div>
                    <p className="feed-main">{match.teamName} vs {match.opponent}</p>
                    <p className="feed-sub">Upcoming match</p>
                  </div>
                  <span className="feed-date">{formatDate(match.date)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showTeamActionModal}
        onClose={() => setShowTeamActionModal(false)}
        title="Team Actions"
      >
        <div className="team-action-tabs">
          <button
            className={`invite-tab ${teamActionTab === 'create' ? 'active' : ''}`}
            onClick={() => setTeamActionTab('create')}
          >
            Create Team
          </button>
          <button
            className={`invite-tab ${teamActionTab === 'join' ? 'active' : ''}`}
            onClick={() => setTeamActionTab('join')}
          >
            Join Team
          </button>
        </div>

        {teamActionTab === 'create' ? (
          <div className="team-create-card">
            <input
              type="text"
              className="team-create-input"
              placeholder="Create a team..."
              value={newTeamName}
              onChange={(e) => {
                setNewTeamName(e.target.value);
                if (error) {
                  setError('');
                }
              }}
            />
            <button
              className="team-create-btn"
              onClick={async () => {
                await handleCreateTeam();
              }}
            >
              Create Team
            </button>
          </div>
        ) : (
          <div className="team-create-card">
            <input
              type="text"
              className="team-create-input"
              placeholder="Join with invite code..."
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value);
                if (joinError) {
                  setJoinError('');
                }
                if (joinMessage) {
                  setJoinMessage('');
                }
              }}
            />
            <button
              className="team-create-btn"
              onClick={async () => {
                await handleJoinTeam();
              }}
            >
              Join Team
            </button>
          </div>
        )}

        {error && <p className="home-error-text">{error}</p>}
        {joinError && <p className="home-error-text">{joinError}</p>}
        {joinMessage && <p className="home-success-text">{joinMessage}</p>}
      </Modal>
    </div>
  );
};

export default Home;
