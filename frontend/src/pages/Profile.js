import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { AuthContext } from '../context/AuthContext';
import useAuth from '../hooks/useAuth';
import api from '../utils/api';
import { formatLongDate } from '../utils/date';
import useDelayedLoadingIndicator from '../hooks/useDelayedLoadingIndicator';
import './Profile.css';
import ImageUploader from '../components/ImageUploader';

const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext); 
  const { user, updateUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoStatus, setPhotoStatus] = useState('Update your picture');
  const [passwordStatus, setPasswordStatus] = useState('Send a reset link');
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [teams, setTeams] = useState([]);
  const [kids, setKids] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [modalType, setModalType] = useState(null);
  const [form, setForm] = useState({ primary: '', secondary: '', tertiary: '' });
  const [payload, setPayload] = useState(null);
  const [childTeamId, setChildTeamId] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [loadingProfilePic, setLoadingProfilePic] = useState(false);
  const [myClips, setMyClips] = useState([]);
  const [loadingMyClips, setLoadingMyClips] = useState(false);
  const [myClipsOpen, setMyClipsOpen] = useState(false);
  const [myClipThumbUrls, setMyClipThumbUrls] = useState({});
  const showProfileDataLoadingIndicator = useDelayedLoadingIndicator(loadingData, 1000);
  const showMyClipsLoadingIndicator = useDelayedLoadingIndicator(loadingMyClips, 1000);
  const showProfilePicLoadingIndicator = useDelayedLoadingIndicator(loadingProfilePic, 1000);

  const loadMyClips = async () => {
    if (myClips.length > 0) return;
    setLoadingMyClips(true);
    try {
      const res = await api.get('/videos/me');
      setMyClips(res.data || []);
    } catch (err) {
      console.error('Load my clips error:', err);
    } finally {
      setLoadingMyClips(false);
    }
  };

  const loadProfileLists = async () => {
    setLoadingData(true);
    setProfileError('');

    try {
      const teamRes = await api.get('/teams');
      const teamRows = (teamRes.data || []).map((team) => ({
        id: team._id,
        name: team.name,
        role: team.membershipRole || 'member',
      }));
      setTeams(teamRows);

      const kidResponses = await Promise.all(
        teamRows.map(async (team) => {
          const res = await api.get(`/teams/${team.id}/kids`);
          return (res.data || []).map((kid) => ({
            id: kid._id,
            name: kid.name,
            teamId: team.id,
            teamName: team.name,
            group: kid.ageGroup || '',
          }));
        })
      );

      setKids(kidResponses.flat());
      if (teamRows.length > 0) {
        setChildTeamId(teamRows[0].id);
      }
    } catch (err) {
      console.error('Load profile lists error:', err);
      setProfileError(err.response?.data?.message || 'Could not load account data.');
      setTeams([]);
      setKids([]);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    setName(user.username || '');
    setEmail(user.email || '');
  }, [user]);

  useEffect(() => {
    loadProfileLists();
  }, []);

  useEffect(() => {
    const fetchProfilePic = async () => {
      setLoadingProfilePic(true);
      try {
        const res = await api.get('/images/me');
        setProfilePicUrl(res.data.url);
      } catch (err) {
        console.error("Failed to load profile pic", err);
        setProfilePicUrl('');
      } finally {
        setLoadingProfilePic(false);
      }
    };

    if (user?.profilePicture) {
      fetchProfilePic();
    } else {
      setLoadingProfilePic(false);
      setProfilePicUrl('');
    }
  }, [user]);

  useEffect(() => {
    if (!myClipsOpen || !myClips.length) return;

    let cancelled = false;

    const fetchThumbs = async () => {
      const clipsWithout = myClips.filter((c) => !myClipThumbUrls[c._id]);
      if (!clipsWithout.length) return;

      const entries = await Promise.all(
        clipsWithout.map(async (clip) => {
          try {
            const res = await api.get(`/videos/${clip._id}/play`);
            return [clip._id, res.data.url];
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      setMyClipThumbUrls((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (entry) next[entry[0]] = entry[1];
        });
        return next;
      });
    };

    fetchThumbs();
    return () => { cancelled = true; };
  }, [myClipsOpen, myClips]);

  const openModal = (type, data = {}) => {
    setModalType(type);
    setPayload(data);
    setProfileError('');

    switch (type) {
      case 'name':
        setForm({ primary: name, secondary: '', tertiary: '' });
        break;
      case 'email':
        setForm({ primary: email, secondary: '', tertiary: '' });
        break;
      case 'photo':
      case 'reset':
        setForm({ primary: '', secondary: '', tertiary: '' });
        break;
      case 'team': {
        const team = teams[data.index] || {};
        setForm({
          primary: team.name || '',
          secondary: '',
          tertiary: team.role || ''
        });
        break;
      }
      case 'kid': {
        const kid = kids[data.index] || {};
        setForm({
          primary: kid.name || '',
          secondary: kid.teamName || '',
          tertiary: kid.group || ''
        });
        break;
      }
      case 'add':
        setForm({ primary: 'team', secondary: '', tertiary: '' });
        if (teams.length > 0) {
          setChildTeamId(teams[0].id);
        }
        break;
      default:
        setForm({ primary: '', secondary: '', tertiary: '' });
    }
  };

  const closeModal = () => {
    setModalType(null);
    setPayload(null);
    setForm({ primary: '', secondary: '', tertiary: '' });
    setProfileError('');
  };

  const saveModal = async () => {
    setProfileError('');

    switch (modalType) {
      case 'name': {
        const username = form.primary.trim();
        if (!username) {
          setProfileError('Username is required.');
          return;
        }
        try {
          const res = await api.patch('/users/me', { username });
          setName(res.data.username);
          updateUser(res.data);
        } catch (err) {
          console.error('Update username error:', err);
          setProfileError(err.response?.data?.message || 'Could not update username.');
          return;
        }
        break;
      }
      case 'email': {
        const nextEmail = form.primary.trim();
        if (!nextEmail) {
          setProfileError('Email is required.');
          return;
        }
        try {
          const res = await api.patch('/users/me', { email: nextEmail });
          setEmail(res.data.email);
          updateUser(res.data);
        } catch (err) {
          console.error('Update email error:', err);
          setProfileError(err.response?.data?.message || 'Could not update email.');
          return;
        }
        break;
      }
      case 'photo':
        setPhotoStatus('Photo updated');
        break;
      case 'reset': {
        const resetEmail = email.trim().toLowerCase();

        if (!resetEmail) {
          setProfileError('Email is required.');
          return;
        }

        try {
          setIsSendingPasswordReset(true);
          const res = await api.post('/auth/request-password-reset', { email: resetEmail });

          setPasswordStatus(res.data?.message || 'Password reset email sent');
        } catch (err) {
          console.error('Send password reset email error:', err.response?.data || err);
          setProfileError(err.response?.data?.message || 'Could not send password reset email.');
          return;
        } finally {
          setIsSendingPasswordReset(false);
        }
        break;
      }
      case 'team': {
        if (payload?.index == null) break;
        const team = teams[payload.index];
        if (!team) break;

        const teamName = form.primary.trim();
        if (!teamName) {
          setProfileError('Team name is required.');
          return;
        }

        try {
          await api.patch(`/teams/${team.id}`, { name: teamName });
          await loadProfileLists();
        } catch (err) {
          console.error('Update team error:', err);
          setProfileError(err.response?.data?.message || 'Could not update team.');
          return;
        }
        break;
      }
      case 'kid': {
        if (payload?.index == null) break;
        const kid = kids[payload.index];
        if (!kid) break;

        const kidName = form.primary.trim();
        if (!kidName) {
          setProfileError('Child name is required.');
          return;
        }

        try {
          await api.patch(`/teams/${kid.teamId}/kids/${kid.id}`, {
            name: kidName,
            ageGroup: form.tertiary.trim(),
          });
          await loadProfileLists();
        } catch (err) {
          console.error('Update kid error:', err);
          setProfileError(err.response?.data?.message || 'Could not update child.');
          return;
        }
        break;
      }
      case 'add': {
        if (form.primary === 'team') {
          const teamName = form.secondary.trim();
          if (!teamName) {
            setProfileError('Team name is required.');
            return;
          }
          try {
            await api.post('/teams', { name: teamName });
            await loadProfileLists();
          } catch (err) {
            console.error('Create team error:', err);
            setProfileError(err.response?.data?.message || 'Could not create team.');
            return;
          }
        } else {
          const kidName = form.secondary.trim();
          if (!kidName) {
            setProfileError('Child name is required.');
            return;
          }
          if (!childTeamId) {
            setProfileError('Create a team before adding a child.');
            return;
          }
          try {
            await api.post(`/teams/${childTeamId}/kids`, {
              name: kidName,
              ageGroup: form.tertiary.trim(),
            });
            await loadProfileLists();
          } catch (err) {
            console.error('Create kid error:', err);
            setProfileError(err.response?.data?.message || 'Could not add child.');
            return;
          }
        }
        break;
      }
      default:
        break;
    }
    closeModal();
  };

  const editName = () => openModal('name');
  const changePhoto = () => openModal('photo');
  const updateEmail = () => openModal('email');
  const sendReset = () => openModal('reset');
  const editTeam = (index) => openModal('team', { index });
  const editKid = (index) => openModal('kid', { index });
  const addChildOrTeam = () => openModal('add');

  const toggleMyClips = () => {
    const nextOpen = !myClipsOpen;
    setMyClipsOpen(nextOpen);
    if (nextOpen) loadMyClips();
  };

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  const renderModal = () => {
    if (!modalType) return null;

    const titleMap = {
      name: 'Edit name',
      email: 'Update email',
      photo: 'Profile photo',
      reset: 'Password reset',
      team: 'Edit team',
      kid: 'Edit child',
      add: 'Add child / team'
    };

    return (
      <Modal isOpen={!!modalType} onClose={closeModal} title={titleMap[modalType] || 'Edit'}>
        {modalType === 'name' && (
          <>
            <label className="modal-label">Username</label>
            <input
              type="text"
              className="modal-input"
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
              autoFocus
            />
          </>
        )}

        {modalType === 'email' && (
          <>
            <label className="modal-label">Email</label>
            <input
              type="email"
              className="modal-input"
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
              autoFocus
            />
          </>
        )}

        {modalType === 'photo' && (
          <ImageUploader
            onUploadSuccess={(data) => {
              setPhotoStatus('Photo updated');

              if (data?.user) {
                updateUser(data.user);
              }

              setTimeout(async () => {
                try {
                  const res = await api.get('/images/me');
                  setProfilePicUrl(res.data.url);
                } catch (err) {
                  console.error(err);
                }
              }, 300);

              closeModal();
            }}
          />
        )}

        {modalType === 'reset' && (
          <p className="value">Send a reset link to {email}?</p>
        )}

        {modalType === 'team' && (
          <>
            <label className="modal-label">Team name</label>
            <input
              type="text"
              className="modal-input"
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
              autoFocus
            />
            <label className="modal-label">Role</label>
            <input
              type="text"
              className="modal-input"
              value={form.tertiary}
              disabled
            />
          </>
        )}

        {modalType === 'kid' && (
          <>
            <label className="modal-label">Child name</label>
            <input
              type="text"
              className="modal-input"
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
              autoFocus
            />
            <label className="modal-label">Team</label>
            <input
              type="text"
              className="modal-input"
              value={form.secondary}
              disabled
            />
            <label className="modal-label">Age group / league</label>
            <input
              type="text"
              className="modal-input"
              value={form.tertiary}
              onChange={(e) => setForm({ ...form, tertiary: e.target.value })}
            />
          </>
        )}

        {modalType === 'add' && (
          <>
            <label className="modal-label">Type</label>
            <select
              className="modal-select"
              value={form.primary}
              onChange={(e) => setForm({ ...form, primary: e.target.value })}
            >
              <option value="team">Team</option>
              <option value="child">Child</option>
            </select>
            {form.primary === 'team' ? (
              <>
                <label className="modal-label">Team name</label>
                <input
                  type="text"
                  className="modal-input"
                  value={form.secondary}
                  onChange={(e) => setForm({ ...form, secondary: e.target.value })}
                  autoFocus
                />
                <label className="modal-label">Age group / league</label>
                <input
                  type="text"
                  className="modal-input"
                  value={form.tertiary}
                  onChange={(e) => setForm({ ...form, tertiary: e.target.value })}
                />
              </>
            ) : (
              <>
                <label className="modal-label">Team</label>
                <select
                  className="modal-select"
                  value={childTeamId}
                  onChange={(e) => setChildTeamId(e.target.value)}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
                <label className="modal-label">Child name</label>
                <input
                  type="text"
                  className="modal-input"
                  value={form.secondary}
                  onChange={(e) => setForm({ ...form, secondary: e.target.value })}
                  autoFocus
                />
                <label className="modal-label">Age group / league</label>
                <input
                  type="text"
                  className="modal-input"
                  value={form.tertiary}
                  onChange={(e) => setForm({ ...form, tertiary: e.target.value })}
                />
              </>
            )}
          </>
        )}

        {profileError && <p className="profile-error-text">{profileError}</p>}

        {modalType !== 'photo' && (
          <div className="modal-actions">
            <button className="modal-btn modal-btn-cancel" onClick={closeModal} disabled={isSendingPasswordReset}>
              Cancel
            </button>
            <button className="modal-btn modal-btn-primary" onClick={saveModal} disabled={isSendingPasswordReset}>
              {modalType === 'reset'
                ? (isSendingPasswordReset ? 'Sending...' : 'Yes')
                : 'Save'}
            </button>
          </div>
        )}
      </Modal>
    );
  };

  return (
    <div className="profile-container">
      <h1>Profile</h1>

      <section className="profile-section">
        <div className="section-head">
          <h2>Account Basics</h2>
        </div>

        <div className="card">
          {profileError && <p className="profile-error-text">{profileError}</p>}
          {showProfileDataLoadingIndicator && <p className="value">Loading account details...</p>}

          <div className="row">
            <div>
              <p className="label">Username</p>
              <p className="value">{name || 'Not available'}</p>
            </div>
            <button className="pill-btn" onClick={editName}>Edit</button>
          </div>

          <div className="row">
            <div>
              <p className="label">Profile photo</p>
                {user?.profilePicture && profilePicUrl ? (
                  <img
                    src={profilePicUrl}
                    alt="Profile"
                    className="profile-avatar"
                  />
                ) : user?.profilePicture && showProfilePicLoadingIndicator ? (
                  <p className="value">Loading profile photo...</p>
                ) : (
                  <p className="value">{photoStatus}</p>
                )}
            </div>
            <button className="pill-btn" onClick={changePhoto}>Change</button>
          </div>

          <div className="row">
            <div>
              <p className="label">Email</p>
              <p className="value">{email || 'Not available'}</p>
            </div>
            <button className="pill-btn" onClick={updateEmail}>Update</button>
          </div>

          <div className="row">
            <div>
              <p className="label">Password reset</p>
              <p className="value">{passwordStatus}</p>
            </div>
            <button className="pill-btn" onClick={sendReset}>Send</button>
          </div>
        </div>
      </section>

      <section className="profile-section">
        <div className="section-head">
          <h2>Teams & Kids</h2>
        </div>

        <div className="card">
          <p className="label">Teams</p>
          {!loadingData && teams.length === 0 && (
            <p className="value">No teams yet.</p>
          )}
          {teams.map((team, index) => (
            <div className="row-team-kid" key={team.id}>
              <div>
                <p className="label">{team.name}</p>
                <p className="value">Role: {team.role}</p>
              </div>
              <button className="pill-btn" onClick={() => editTeam(index)}>Edit</button>
            </div>
          ))}

          <p className="label">Kids</p>
          {!loadingData && kids.length === 0 && (
            <p className="value">No kids added yet.</p>
          )}
          {kids.map((kid, index) => (
            <div className="row-team-kid" key={kid.id}>
              <div>
                <p className="label">{kid.name}</p>
                <p className="value">{kid.teamName} · {kid.group || 'No age group'}</p>
              </div>
              <button className="pill-btn" onClick={() => editKid(index)}>Edit</button>
            </div>
          ))}

          <button className="full-btn" onClick={addChildOrTeam}>Add child / team</button>
        </div>
      </section>

      <section className="profile-section">
        <button className="section-toggle" onClick={toggleMyClips} aria-expanded={myClipsOpen}>
          <h2>My Clips</h2>
          <i className={`fas fa-chevron-${myClipsOpen ? 'up' : 'down'}`}></i>
        </button>

        {myClipsOpen && (
          <div className="card">
            {showMyClipsLoadingIndicator && <p className="value">Loading clips...</p>}
            {!loadingMyClips && myClips.length === 0 && (
              <p className="value">No clips uploaded yet.</p>
            )}
            {!loadingMyClips && myClips.length > 0 && (
              <div className="my-clips-grid">
                {myClips.map((clip) => (
                  <button
                    key={clip._id}
                    className="my-clip-item"
                    onClick={() =>
                      navigate(
                        `/team/${clip.match?.team?._id}/game/${clip.match?._id}?clipId=${clip._id}`
                      )
                    }
                  >
                    <div className="my-clip-thumb">
                      {myClipThumbUrls[clip._id] ? (
                        <video
                          className="my-clip-preview"
                          src={`${myClipThumbUrls[clip._id]}#t=0.001`}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <i className="fas fa-play"></i>
                      )}
                    </div>
                    <div className="my-clip-info">
                      <p className="my-clip-match">
                        {clip.match?.team?.name} vs {clip.match?.opponent}
                      </p>
                      <p className="my-clip-date">{formatLongDate(clip.match?.date)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <button className="signout-btn" onClick={handleSignOut}>Sign out</button>

      {renderModal()}
    </div>
  );
};

export default Profile;
