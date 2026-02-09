'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SkillResult {
  id: string;
  name: string;
  description: string;
  content?: string;
  source_url?: string;
  skillUrl?: string;
  githubUrl?: string;
  category?: string;
  author?: string;
  stars?: number;
  score?: number;
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

interface Pagination {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  hasMore?: boolean;
}

type Tab = 'popular' | 'search' | 'installed';

function formatStars(stars: number): string {
  if (stars >= 1000000) return `${(stars / 1000000).toFixed(1)}M`;
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`;
  return String(stars);
}

function SkillCard({
  skill,
  isInstalled,
  installing,
  onInstall,
}: {
  skill: SkillResult;
  isInstalled: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10 hover:border-white/20 transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{skill.name}</h4>
          {skill.author && (
            <p className="text-[10px] text-white/40">by {skill.author}</p>
          )}
        </div>
        {typeof skill.stars === 'number' && skill.stars > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-400 flex-shrink-0 flex items-center gap-0.5">
            <span>&#9733;</span> {formatStars(skill.stars)}
          </span>
        )}
      </div>

      <p
        className={`text-xs text-white/50 mt-1 ${expanded ? '' : 'line-clamp-2'} cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        {skill.description}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {skill.skillUrl && (
            <a
              href={skill.skillUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              title="View on SkillsMP"
            >
              SkillsMP
            </a>
          )}
          {skill.githubUrl && (
            <a
              href={skill.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
              title="View on GitHub"
            >
              GitHub
            </a>
          )}
        </div>

        {isInstalled ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded">
            Installed
          </span>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className="text-xs px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
          >
            {installing ? 'Installing...' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('popular');
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  // Popular tab state
  const [popularSkills, setPopularSkills] = useState<SkillResult[]>([]);
  const [popularPagination, setPopularPagination] = useState<Pagination | null>(null);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularPage, setPopularPage] = useState(1);

  // Search tab state
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'keyword' | 'ai'>('keyword');
  const [searchResults, setSearchResults] = useState<SkillResult[]>([]);
  const [searchPagination, setSearchPagination] = useState<Pagination | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchInstalled();
  }, []);

  // Load popular skills on mount
  useEffect(() => {
    fetchPopular(1, true);
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

  const fetchPopular = async (page: number, reset: boolean) => {
    setPopularLoading(true);
    try {
      const res = await fetch(`/api/skills/search?q=*&sortBy=stars&page=${page}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        const skills = data.skills || [];
        setPopularSkills(prev => reset ? skills : [...prev, ...skills]);
        setPopularPagination(data.pagination || null);
        setPopularPage(page);
      }
    } catch (error) {
      console.error('Error fetching popular skills:', error);
    } finally {
      setPopularLoading(false);
    }
  };

  const handleSearch = useCallback((value: string, page = 1, append = false) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      setSearchPagination(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const aiParam = searchMode === 'ai' ? '&ai=true' : '';
        const res = await fetch(`/api/skills/search?q=${encodeURIComponent(value)}${aiParam}&page=${page}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          const skills = data.skills || [];
          setSearchResults(prev => append ? [...prev, ...skills] : skills);
          setSearchPagination(data.pagination || null);
          setSearchPage(page);
        } else {
          if (!append) setSearchResults([]);
        }
      } catch (error) {
        console.error('Error searching skills:', error);
        if (!append) setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, page > 1 ? 0 : 300);
  }, [searchMode]);

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
          source_url: skill.skillUrl || skill.source_url,
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

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'popular', label: 'Popular' },
    { key: 'search', label: 'Search' },
    { key: 'installed', label: 'Installed', count: installedSkills.length },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 bg-white/5 rounded-lg p-1 border border-white/10 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="ml-1.5 text-[10px] opacity-60">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Popular Tab */}
      {activeTab === 'popular' && (
        <div className="glass rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/70">Top Skills by Stars</h3>
            {popularPagination?.total && (
              <span className="text-[10px] text-white/30">
                {popularSkills.length} of {popularPagination.total.toLocaleString()} skills
              </span>
            )}
          </div>

          {popularSkills.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {popularSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isInstalled={installedIds.has(skill.id)}
                    installing={installing === skill.id}
                    onInstall={() => handleInstall(skill)}
                  />
                ))}
              </div>

              {popularPagination?.hasNext && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => fetchPopular(popularPage + 1, false)}
                    disabled={popularLoading}
                    className="px-4 py-2 text-xs text-white/60 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {popularLoading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          ) : popularLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="text-center py-12 text-white/40 text-sm">
              Unable to load popular skills.
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="glass rounded-xl p-4 sm:p-5">
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

          {searchPagination?.total && (
            <p className="text-[10px] text-white/30 mb-2">
              {searchPagination.total.toLocaleString()} results found
            </p>
          )}

          {searchResults.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isInstalled={installedIds.has(skill.id)}
                    installing={installing === skill.id}
                    onInstall={() => handleInstall(skill)}
                  />
                ))}
              </div>

              {(searchPagination?.hasNext || searchPagination?.hasMore) && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => handleSearch(query, searchPage + 1, true)}
                    disabled={searching}
                    className="px-4 py-2 text-xs text-white/60 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {searching ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          ) : query && !searching ? (
            <div className="text-center py-6 text-white/40 text-sm">
              No skills found for &quot;{query}&quot;
            </div>
          ) : !query ? (
            <div className="text-center py-12 text-white/40 text-sm">
              Type a query to search the SkillsMP marketplace.
            </div>
          ) : null}
        </div>
      )}

      {/* Installed Tab */}
      {activeTab === 'installed' && (
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
              <p className="text-4xl mb-4">&#128268;</p>
              <p className="text-sm">No skills installed yet. Browse the Popular or Search tabs to find and install skills.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
