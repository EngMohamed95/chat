import React from 'react';

interface AvatarProps {
  name?: string | null;
  url?: string | null;
  /** Size, border, etc. Rounded + object-cover are always applied. */
  className?: string;
}

/** Profile photo, or the first letter of the name when there is no photo. */
export const Avatar: React.FC<AvatarProps> = ({ name, url, className = 'w-8 h-8' }) => {
  if (url) {
    return <img src={url} alt={name || ''} className={`${className} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${className} rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white text-xs font-bold flex items-center justify-center shrink-0`}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
};
