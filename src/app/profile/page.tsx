'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Save, User, Mail, Building, MapPin } from 'lucide-react';

interface ProfileData {
  name: string;
  email: string;
  company: string;
  location: string;
  bio: string;
  avatar: string;
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    email: '',
    company: '',
    location: '',
    bio: '',
    avatar: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setProfile(prev => ({
        ...prev,
        name: session.user?.name || '',
        email: session.user?.email || '',
        avatar: session.user?.image || '',
      }));
    }
    
    // Load saved profile data
    fetchProfile();
  }, [session]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">General Information</h1>
      
      {/* Avatar Section */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
        <div className="flex items-center gap-6">
          <div className="relative">
            {profile.avatar ? (
              <img 
                src={profile.avatar} 
                alt="Profile" 
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">{profile.name || 'Your Name'}</h2>
            <p className="text-gray-400">{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <User className="w-4 h-4" />
              Full Name
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>
          
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Mail className="w-4 h-4" />
              Email Address
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-4 py-2 bg-gray-600 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Building className="w-4 h-4" />
              Company
            </label>
            <input
              type="text"
              value={profile.company}
              onChange={(e) => setProfile({ ...profile, company: e.target.value })}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Acme Inc."
            />
          </div>
          
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <MapPin className="w-4 h-4" />
              Location
            </label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="San Francisco, CA"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-300 mb-2 block">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            rows={4}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Tell us about yourself..."
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-50`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
