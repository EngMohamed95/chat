import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Key,
  ShieldAlert,
} from 'lucide-react';
import { Profile } from '../../types';
import { liveflowService } from '../../lib/api';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

export const UsersManagement: React.FC = () => {
  const { profile: currentUser } = useAuth();
  const { t } = useSettings();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'agent'>('agent');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadProfiles = async () => {
    setLoading(true);
    const list = await liveflowService.getProfiles();
    setProfiles(list);
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !fullName) return;

    setSubmitting(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await liveflowService.createUser({
        username,
        password,
        full_name: fullName,
        role,
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to create user');
      } else {
        setActionSuccess(`Account "${res.user?.username}" created. They can sign in now.`);
        setFullName('');
        setUsername('');
        setPassword('');
        setShowAddModal(false);
        loadProfiles();
      }
    } catch (err: any) {
      setActionError(err.message || 'Error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (target: Profile) => {
    const res = await liveflowService.updateUser(target.id, {
      is_active: !target.is_active,
    });
    if (!res.success) alert(res.error || 'Failed to update user');
    loadProfiles();
  };

  const handleResetPassword = async (target: Profile) => {
    const newPassword = window.prompt(`${t('newPasswordFor')} ${target.full_name} (@${target.username})`);
    if (newPassword === null) return;
    const res = await liveflowService.updateUser(target.id, { password: newPassword });
    if (res.success) {
      setActionError('');
      setActionSuccess(`${t('passwordUpdated')}: @${target.username}`);
    } else {
      alert(res.error || 'Failed to update password');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this staff member? This will remove their credentials.')) {
      return;
    }
    try {
      const res = await liveflowService.deleteUser(userId);
      if (res.success) {
        loadProfiles();
      } else {
        alert(res.error || 'Failed to delete user');
      }
    } catch (err: any) {
      alert(err.message || 'Delete operation failed');
    }
  };

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{t('users')}</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Create staff accounts, disable or delete them, and reset passwords.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowAddModal(true);
            setActionError('');
            setActionSuccess('');
          }}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t('addUser')}</span>
        </button>
      </div>

      {actionSuccess && !showAddModal && (
        <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-200">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Profiles Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-400">Loading team members...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-850/40">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {profiles.map((p) => {
                  const isCurrent = p.id === currentUser?.id;

                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/40 transition-colors">
                      <td className="py-3.5 px-4 flex items-center gap-3">
                        <Avatar
                          name={p.full_name}
                          url={p.avatar_url}
                          className="w-8 h-8 border border-zinc-200 dark:border-zinc-700"
                        />
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <span>{p.full_name}</span>
                            {isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded font-normal">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-zinc-400" dir="ltr">@{p.username}</p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            p.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}
                        >
                          {p.role === 'admin' ? 'Administrator' : 'Support Agent'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => !isCurrent && handleToggleActive(p)}
                          disabled={isCurrent}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer disabled:cursor-default ${
                            p.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span>{p.is_active ? 'Active' : 'Disabled'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-zinc-500 text-[11px]">
                        {new Date(p.created_at).toLocaleDateString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(p)}
                            className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                            title={t('resetPassword')}
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(p.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Delete agent"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add User */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <span>Provision New Staff Member</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="p-3 mb-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-600 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Layla Al-Sabah"
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  {t('username')} *
                </label>
                <input
                  type="text"
                  required
                  pattern="[A-Za-z0-9._\-]{3,32}"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ahmed"
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100"
                />
                <p className="text-[10px] text-zinc-400 mt-1">{t('usernameHint')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  Temporary Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  Access Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'agent')}
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 cursor-pointer"
                >
                  <option value="agent">Support Agent (Can handle chats & notes)</option>
                  <option value="admin">Administrator (Can manage users & system settings)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
