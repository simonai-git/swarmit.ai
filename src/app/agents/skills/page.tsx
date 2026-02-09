'use client';

import { useState, useEffect, useRef } from 'react';

interface SkillResult {
  id: string;
  name: string;
  description: string;
  content?: string;
  source_url?: string;
  category?: string;
  author?: string;
}

interface InstalledSkill {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_description: string | null;
  skill_content: string | null;
  source_url: string | null;
  category: string | null;
  author: string | null;
  installed_at: string;
}

export default function SkillsPage() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'keyword' | 'ai'>('keyword');
  const [searchResults, setSearchResults] = useState<SkillResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchInstalled();
  }, []);

  const fetchInstalled = async () => {
    try {
      const res = await fetch('/api/skills/installed');
      if (res.ok) {
        const data = await res.json();
        const skills = data.skills || [];
        setInstalledSkills(skills);
        setInstalledIds(new Set(skills.map((s: InstalledSkill) => s.skill_id)));
      }
    } catch (error) {
      console.error('Error fetching installed skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const aiParam = searchMode === 'ai' ? '&ai=true' : '';
        const res = await fetch(`/api/skills/search?q=${encodeURIComponent(value)}${aiParam}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.skills || data.results || data || []);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Error searching skills:', error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleInstall = async (skill: SkillResult) => {
    setInstalling(skill.id);
    try {
      const res = await fetch('/api/skills/installed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: skill.id,
          skill_name: skill.name,
          skill_description: skill.description,
          skill_content: skill.content,
          source_url: skill.source_url,
          category: skill.category,
          author: skill.author,
        }),
      });
      if (res.ok) {
        fetchInstalled();
      }
    } catch (error) {
      console.error('Error installing skill:', error);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!confirm('Uninstall this skill? It will also be removed from any agents.')) return;
    try {
      const res = await fetch(`/api/skills/installed?skill_id=${encodeURIComponent(skillId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchInstalled();
      }
    } catch (error) {
      console.error('Error uninstalling skill:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-white/60">Loading skills...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Search & Install Section */}
      <div className="glass rounded-xl p-4 sm:p-5 mb-6">
        <h3 className="text-sm font-medium text-white/70 mb-3">Search & Install Skills</h3>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 pr-10"
              placeholder="Search for skills..."
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search mode toggle */}
          <div className="flex items-center bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => { setSearchMode('keyword'); if (query) handleSearch(query); }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                searchMode === 'keyword' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'
              }`}
            >
              Keyword
            </button>
            <button
              onClick={() => { setSearchMode('ai'); if (query) handleSearch(query); }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                searchMode === 'ai' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'
              }`}
            >
              AI Search
            </button>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {searchResults.map((skill) => {
              const isInstalled = installedIds.has(skill.id);
              return (
                <div
                  key={skill.id}
                  className="bg-white/5 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">{skill.name}</h4>
                      {skill.author && (
                        <p className="text-[10px] text-white/40">by {skill.author}</p>
                      )}
                    </div>
                    {skill.category && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/50 flex-shrink-0">
                        {skill.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 mt-1 line-clamp-2">{skill.description}</p>
                  <div className="mt-2">
                    {isInstalled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded">
                        Installed
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInstall(skill)}
                        disabled={installing === skill.id}
                        className="text-xs px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                      >
                        {installing === skill.id ? 'Installing...' : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {query && !searching && searchResults.length === 0 && (
          <div className="text-center py-6 text-white/40 text-sm">
            No skills found for &quot;{query}&quot;
          </div>
        )}
      </div>

      {/* Installed Skills Section */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-white/70">
            Installed Skills ({installedSkills.length})
          </h3>
        </div>

        {installedSkills.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-2">Name</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-2 hidden sm:table-cell">Category</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-2 hidden md:table-cell">Author</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-2 hidden lg:table-cell">Installed</th>
                  <th className="text-right text-xs text-white/50 font-medium px-4 py-2 w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {installedSkills.map((skill) => (
                  <tr key={skill.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2">
                      <div className="text-sm text-white">{skill.skill_name}</div>
                      {skill.skill_description && (
                        <div className="text-[10px] text-white/40 line-clamp-1">{skill.skill_description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-white/50 hidden sm:table-cell">{skill.category || '-'}</td>
                    <td className="px-4 py-2 text-xs text-white/50 hidden md:table-cell">{skill.author || '-'}</td>
                    <td className="px-4 py-2 text-xs text-white/40 hidden lg:table-cell">
                      {new Date(skill.installed_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleUninstall(skill.skill_id)}
                        className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      >
                        Uninstall
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-white/40">
            <p className="text-4xl mb-4">🔌</p>
            <p className="text-sm">No skills installed yet. Search above to find and install skills.</p>
          </div>
        )}
      </div>
    </>
  );
}
