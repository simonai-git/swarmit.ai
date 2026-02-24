'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { api, type TaskComment } from '@/lib/api';

interface TaskCommentsProps {
  taskId: string;
  comments: TaskComment[];
  onCommentAdded: () => void;
}

export default function TaskComments({ taskId, comments, onCommentAdded }: TaskCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [localComments, setLocalComments] = useState<TaskComment[]>(comments);

  // Keep in sync with parent
  if (comments !== localComments && comments.length !== localComments.length) {
    setLocalComments(comments);
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setAddingComment(true);
    try {
      const comment = await api.tasks.addComment(taskId, {
        author: 'User',
        content: newComment.trim(),
      });
      setLocalComments(prev => [...prev, comment]);
      setNewComment('');
      onCommentAdded();
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setAddingComment(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        Comments
      </h3>

      {localComments.length === 0 && (
        <p className="text-sm text-zinc-600 italic mb-3">No comments yet</p>
      )}

      <div className="space-y-3 mb-3">
        {localComments.map((comment) => (
          <div
            key={comment.id}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-zinc-300">
                {comment.author}
              </span>
              <span className="text-[10px] text-zinc-600">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-zinc-400 whitespace-pre-wrap">
              {comment.content}
            </p>
          </div>
        ))}
      </div>

      {/* Add comment form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAddComment();
            }
          }}
          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleAddComment}
          disabled={addingComment || !newComment.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
