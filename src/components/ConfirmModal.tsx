'use client';

import { memo, useEffect, useRef } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
}

const variantConfig = {
  danger: {
    icon: '🗑️',
    iconBg: 'bg-red-500/20',
    iconBorder: 'border-red-500/30',
    confirmButton: 'bg-red-500 hover:bg-red-600 text-white',
    confirmButtonHover: 'hover:shadow-red-500/25',
  },
  warning: {
    icon: '⚠️',
    iconBg: 'bg-amber-500/20',
    iconBorder: 'border-amber-500/30',
    confirmButton: 'bg-amber-500 hover:bg-amber-600 text-white',
    confirmButtonHover: 'hover:shadow-amber-500/25',
  },
  default: {
    icon: '❓',
    iconBg: 'bg-blue-500/20',
    iconBorder: 'border-blue-500/30',
    confirmButton: 'bg-blue-500 hover:bg-blue-600 text-white',
    confirmButtonHover: 'hover:shadow-blue-500/25',
  },
};

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant];

  // Focus the confirm button when modal opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 modal-backdrop flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#1e1e2f]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon and Title */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className={`w-14 h-14 mx-auto mb-4 rounded-full ${config.iconBg} border ${config.iconBorder} flex items-center justify-center text-2xl`}>
            {config.icon}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-sm text-white/60 leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 hover:text-white transition-all font-medium text-sm disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${config.confirmButton} ${config.confirmButtonHover} hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ConfirmModal);
