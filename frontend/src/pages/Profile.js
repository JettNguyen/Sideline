import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { AuthContext } from '../context/AuthContext';
import useAuth from '../hooks/useAuth';
import api from '../utils/api';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const { user, updateUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoStatus, setPhotoStatus] = useState('Update your picture');
  const [passwordStatus, setPasswordStatus] = useState('Send a reset link');
  const [teams, setTeams] = useState([]);
  const [kids, setKids] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [modalType, setModalType] = useState(null);
  const [form, setForm] = useState({ primary: '', secondary: '', tertiary: '' });
  const [payload, setPayload] = useState(null);
  const [childTeamId, setChildTeamId] = useState('');

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
      case 'reset':
        setPasswordStatus('Reset link sent');
        break;
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
          <p className="value">Mark your photo as updated.</p>
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

        <div className="modal-actions">
          <button className="pill-btn ghost" onClick={closeModal}>Cancel</button>
          <button className="pill-btn" onClick={saveModal}>Save</button>
        </div>
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
          {loadingData && <p className="value">Loading account details...</p>}

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
              <p className="value">{photoStatus}</p>
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
          <p className="subheading">Teams</p>
          {!loadingData && teams.length === 0 && (
            <p className="value">No teams yet.</p>
          )}
          {teams.map((team, index) => (
            <div className="row" key={team.id}>
              <div>
                <p className="label">{team.name}</p>
                <p className="value">Role: {team.role}</p>
              </div>
              <button className="pill-btn" onClick={() => editTeam(index)}>Edit</button>
            </div>
          ))}

          <p className="subheading">Kids</p>
          {!loadingData && kids.length === 0 && (
            <p className="value">No kids added yet.</p>
          )}
          {kids.map((kid, index) => (
            <div className="row" key={kid.id}>
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

      <button className="signout-btn" onClick={handleSignOut}>Sign out</button>

      {renderModal()}
    </div>
  );
};

export default Profile;
