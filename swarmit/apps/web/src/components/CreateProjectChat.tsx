'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, CheckCircle2, Circle, Loader2, Save } from 'lucide-react';
import { api, type Project } from '@/lib/api';

// ─── Field definitions ───────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  group: 'basics' | 'details';
  question: string;
  type: 'text' | 'select' | 'tags' | 'date' | 'email' | 'url-list';
  required: boolean;
  options?: string[];
  hint?: string;
}

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', group: 'basics', question: "Let's start! What would you like to name your project?", type: 'text', required: true },
  { key: 'projectType', label: 'Project Type', group: 'basics', question: 'What type of project is this? Choose one: Web App, API/Backend, Mobile App, Data Pipeline, AI/ML, Full Stack, or Other.', type: 'select', required: true, options: ['web-app', 'api-backend', 'mobile-app', 'data-pipeline', 'ai-ml', 'full-stack', 'other'] },
  { key: 'goal', label: 'Goal', group: 'basics', question: 'What is the main goal of this project? Describe it in 1-2 sentences.', type: 'text', required: true },
  { key: 'targetUsers', label: 'Target Users', group: 'basics', question: 'Who are the target users for this project?', type: 'text', required: true },
  { key: 'mustHaves', label: 'Must-Have Features', group: 'basics', question: 'What are the must-have features? List them separated by commas.', type: 'tags', required: true, hint: 'Separate items with commas' },
  { key: 'deadline', label: 'Deadline', group: 'basics', question: 'When is the target deadline? Please enter a date (e.g., 2026-04-01).', type: 'date', required: true },
  { key: 'budgetRange', label: 'Budget Range', group: 'basics', question: 'What is your budget range? Choose: < $100, $100-$500, $500-$1000, or $1000+.', type: 'select', required: true, options: ['< $100', '$100-$500', '$500-$1000', '$1000+'] },
  { key: 'contactEmail', label: 'Contact Email', group: 'basics', question: "What's the best email to contact the project owner?", type: 'email', required: true },
  // Details (optional)
  { key: 'niceToHaves', label: 'Nice-to-Have Features', group: 'details', question: 'Any nice-to-have features? List them separated by commas, or type "skip" to skip.', type: 'tags', required: false, hint: 'Separate items with commas, or type "skip"' },
  { key: 'referenceLinks', label: 'Reference Links', group: 'details', question: 'Any reference links or inspiration URLs? Separate with commas, or type "skip".', type: 'url-list', required: false },
  { key: 'constraints', label: 'Constraints', group: 'details', question: 'Any known constraints or limitations? Type "skip" if none.', type: 'text', required: false },
  { key: 'comms', label: 'Communication', group: 'details', question: 'How do you prefer to receive updates? Type "skip" if no preference.', type: 'text', required: false },
  { key: 'dataSensitivity', label: 'Data Sensitivity', group: 'details', question: 'What level of data sensitivity? Choose: Public, Internal, Confidential, Restricted, or "skip".', type: 'select', required: false, options: ['public', 'internal', 'confidential', 'restricted'] },
  { key: 'prd', label: 'PRD', group: 'details', question: 'Want to paste a PRD (product requirements document)? Type "skip" if not.', type: 'text', required: false },
];

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

// ─── Validation ──────────────────────────────────────────────

function validateInput(field: FieldDef, input: string): { valid: boolean; error?: string; parsed?: unknown } {
  const trimmed = input.trim();
  if (!trimmed) return { valid: false, error: 'Please provide a response.' };

  if (!field.required && trimmed.toLowerCase() === 'skip') {
    return { valid: true, parsed: undefined };
  }

  switch (field.type) {
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { valid: false, error: 'Please enter a valid email address.' };
      return { valid: true, parsed: trimmed };
    }
    case 'date': {
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return { valid: false, error: 'Please enter a valid date (e.g., 2026-04-01).' };
      return { valid: true, parsed: trimmed };
    }
    case 'select': {
      const lower = trimmed.toLowerCase();
      const match = field.options?.find(o => o.toLowerCase() === lower || o.toLowerCase().replace(/[\s/]+/g, '-') === lower.replace(/[\s/]+/g, '-'));
      if (!match) return { valid: false, error: `Please choose one of: ${field.options?.join(', ')}` };
      return { valid: true, parsed: match };
    }
    case 'tags': {
      const tags = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      if (field.required && tags.length === 0) return { valid: false, error: 'Please provide at least one item.' };
      return { valid: true, parsed: tags };
    }
    case 'url-list': {
      const urls = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      return { valid: true, parsed: urls };
    }
    default:
      return { valid: true, parsed: trimmed };
  }
}

// ─── Props ───────────────────────────────────────────────────

interface Props {
  onCreated: (project: Project) => void;
  onClose: () => void;
}

export default function CreateProjectChat({ onCreated, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'll help you create a new project. I'll ask you a series of questions to gather all the details. Let's go!" },
    { role: 'assistant', content: FIELDS[0].question },
  ]);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [inputText, setInputText] = useState('');
  const [phase, setPhase] = useState<'basics' | 'ask-details' | 'details' | 'confirm'>('basics');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const basicsFields = FIELDS.filter(f => f.group === 'basics');
  const detailsFields = FIELDS.filter(f => f.group === 'details');
  const basicsCompleted = basicsFields.filter(f => values[f.key] !== undefined).length;
  const detailsCompleted = detailsFields.filter(f => values[f.key] !== undefined).length;

  const handleSend = () => {
    const input = inputText.trim();
    if (!input || submitting) return;
    setInputText('');

    const newMessages: ChatMessage[] = [{ role: 'user', content: input }];

    if (phase === 'ask-details') {
      const answer = input.toLowerCase();
      if (answer === 'yes' || answer === 'y') {
        // Start details phase
        const firstDetail = detailsFields[0];
        const detailStartIndex = FIELDS.findIndex(f => f.key === firstDetail.key);
        setPhase('details');
        setFieldIndex(detailStartIndex);
        newMessages.push({ role: 'assistant', content: "Let's fill in some optional details." });
        newMessages.push({ role: 'assistant', content: firstDetail.question });
      } else {
        setPhase('confirm');
        newMessages.push({ role: 'assistant', content: buildSummary() });
        newMessages.push({ role: 'assistant', content: 'Ready to create the project? Click "Create Project" below, or "Save as Draft" to save for later.' });
      }
      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    if (phase === 'confirm') {
      setMessages(prev => [...prev, ...newMessages, { role: 'assistant', content: 'Use the buttons below to create or save as draft.' }]);
      return;
    }

    const currentField = FIELDS[fieldIndex];
    const result = validateInput(currentField, input);

    if (!result.valid) {
      newMessages.push({ role: 'assistant', content: result.error! });
      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    // Store value (undefined = skipped)
    if (result.parsed !== undefined) {
      setValues(prev => ({ ...prev, [currentField.key]: result.parsed }));
    }

    // Move to next field
    const nextIndex = fieldIndex + 1;

    if (phase === 'basics') {
      if (nextIndex < basicsFields.length + (FIELDS.findIndex(f => f.group === 'basics'))) {
        // Check if we're still in basics
        const nextField = FIELDS[nextIndex];
        if (nextField && nextField.group === 'basics') {
          setFieldIndex(nextIndex);
          newMessages.push({ role: 'assistant', content: nextField.question });
        } else {
          // Done with basics
          setPhase('ask-details');
          newMessages.push({ role: 'assistant', content: `All required fields are filled! Would you like to add optional details (nice-to-haves, reference links, constraints, etc.)? Type "yes" or "skip".` });
        }
      } else {
        setPhase('ask-details');
        newMessages.push({ role: 'assistant', content: `All required fields are filled! Would you like to add optional details? Type "yes" or "skip".` });
      }
    } else if (phase === 'details') {
      const nextField = FIELDS[nextIndex];
      if (nextField && nextField.group === 'details') {
        setFieldIndex(nextIndex);
        newMessages.push({ role: 'assistant', content: nextField.question });
      } else {
        // Done with all details
        setPhase('confirm');
        newMessages.push({ role: 'assistant', content: buildSummary() });
        newMessages.push({ role: 'assistant', content: 'Ready to create the project? Click "Create Project" below, or "Save as Draft" to save for later.' });
      }
    }

    setMessages(prev => [...prev, ...newMessages]);
  };

  const buildSummary = (): string => {
    let summary = "Here's a summary of your project:\n\n";
    for (const field of FIELDS) {
      const val = values[field.key];
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        if (val.length > 0) summary += `**${field.label}:** ${val.join(', ')}\n`;
      } else {
        summary += `**${field.label}:** ${String(val)}\n`;
      }
    }
    return summary;
  };

  const handleCreate = async (isDraft: boolean) => {
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { isDraft };

      for (const field of FIELDS) {
        const val = values[field.key];
        if (val === undefined) continue;

        if (field.key === 'deadline' && typeof val === 'string') {
          payload.deadline = new Date(val).toISOString();
        } else {
          payload[field.key] = val;
        }
      }

      if (!payload.title) {
        setError('Title is required');
        setSubmitting(false);
        return;
      }

      const project = await api.projects.create(payload as Parameters<typeof api.projects.create>[0]);
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-5xl mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">Create with Chat</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: chat + checklist */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat panel (left) */}
          <div className="flex-[3] flex flex-col border-r border-zinc-800 min-w-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
                    }`}
                  >
                    {msg.content.split('\n').map((line, li) => {
                      // Render bold markdown
                      const parts = line.split(/(\*\*[^*]+\*\*)/g);
                      return (
                        <span key={li}>
                          {li > 0 && <br />}
                          {parts.map((part, pi) =>
                            part.startsWith('**') && part.endsWith('**')
                              ? <strong key={pi} className="font-semibold">{part.slice(2, -2)}</strong>
                              : <span key={pi}>{part}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-800 shrink-0">
              {phase === 'confirm' ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleCreate(true)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Save as Draft
                  </button>
                  <button
                    onClick={() => handleCreate(false)}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex-1 justify-center"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Create Project
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                    placeholder="Type your answer..."
                    className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                    className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white rounded-xl transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>
          </div>

          {/* Checklist panel (right) */}
          <div className="flex-[2] overflow-y-auto p-4 hidden md:block">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Project Checklist</h3>

            {/* Basics */}
            <div className="mb-4">
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Basics ({basicsCompleted} of {basicsFields.length})
              </h4>
              <div className="space-y-1.5">
                {basicsFields.map(field => {
                  const val = values[field.key];
                  const filled = val !== undefined;
                  return (
                    <div key={field.key} className="flex items-start gap-2">
                      {filled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <span className={`text-sm ${filled ? 'text-zinc-300' : 'text-zinc-500'}`}>{field.label}</span>
                        {filled && (
                          <p className="text-xs text-zinc-500 truncate">
                            {Array.isArray(val) ? val.join(', ') : String(val)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Details */}
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Details ({detailsCompleted} of {detailsFields.length})
              </h4>
              <div className="space-y-1.5">
                {detailsFields.map(field => {
                  const val = values[field.key];
                  const filled = val !== undefined;
                  return (
                    <div key={field.key} className="flex items-start gap-2">
                      {filled ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <span className={`text-sm ${filled ? 'text-zinc-300' : 'text-zinc-500'}`}>{field.label}</span>
                        {filled && (
                          <p className="text-xs text-zinc-500 truncate">
                            {Array.isArray(val) ? val.join(', ') : String(val)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
