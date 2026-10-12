import React, { useState } from 'react';
import { Star, CheckCircle2, Heart } from 'lucide-react';
import { isArabic } from '../../lib/rtl';

interface CSATSurveyCardProps {
  conversationId: string;
  existingRating?: number | null;
  onSubmit: (rating: number, feedback?: string) => Promise<void>;
  primaryColor?: string;
}

export const CSATSurveyCard: React.FC<CSATSurveyCardProps> = ({
  conversationId: _conversationId,
  existingRating,
  onSubmit,
  primaryColor = '#10b981',
}) => {
  const [rating, setRating] = useState<number>(existingRating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(existingRating));

  const ratingLabels = [
    { score: 1, emoji: '😞', label: 'Very Poor' },
    { score: 2, emoji: '🙁', label: 'Poor' },
    { score: 3, emoji: '😐', label: 'Neutral' },
    { score: 4, emoji: '🙂', label: 'Good' },
    { score: 5, emoji: '😍', label: 'Great!' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, feedback);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-4 my-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-center animate-in zoom-in-95 duration-200">
        <div className="w-10 h-10 mx-auto mb-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          Thank you for your feedback!
        </h4>
        <p className="text-xs text-emerald-700 dark:text-emerald-300/80 mt-1">
          Your rating helps our team constantly improve our support quality.
        </p>
        <div className="flex items-center justify-center gap-1 mt-2 text-amber-400">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`w-3.5 h-3.5 ${s <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 my-3 p-4 bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-sm text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
        <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
        <span>How was your support experience today?</span>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">
        Please rate our live support assistance:
      </p>

      {/* Star / Emoji selector */}
      <div className="flex items-center justify-center gap-2 mb-3">
        {ratingLabels.map(({ score, emoji, label }) => {
          const active = (hoverRating || rating) >= score;
          return (
            <button
              key={score}
              type="button"
              onMouseEnter={() => setHoverRating(score)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(score)}
              className={`flex flex-col items-center p-1.5 rounded-xl transition-all ${
                rating === score
                  ? 'bg-white dark:bg-zinc-700 shadow-sm scale-110 ring-2 ring-emerald-500'
                  : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
              title={label}
            >
              <span className="text-xl mb-0.5">{emoji}</span>
              <Star
                className={`w-3.5 h-3.5 ${
                  active ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'
                }`}
              />
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Leave a quick note or comment (optional)..."
          dir={isArabic(feedback) ? 'rtl' : 'ltr'}
          className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400"
          maxLength={300}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: primaryColor }}
          className="w-full py-2 px-3 text-xs font-semibold text-white rounded-xl shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Rating'}
        </button>
      </form>
    </div>
  );
};
