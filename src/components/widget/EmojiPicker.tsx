import React from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_LIST = [
  '👋', '👍', '❤️', '😊', '🙏', '🔥', '🎉', '🚀',
  '💡', '✨', '👏', '🤝', '💯', '⭐', '🙌', '😍',
  '🤔', '😅', '👀', '💼', '⚡', '✅', '💬', '🌟',
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  return (
    <div className="absolute bottom-14 left-4 z-50 p-2 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-100 dark:border-zinc-750 text-xs font-semibold text-zinc-500">
        <span>Emojis</span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 rounded"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-transform active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
