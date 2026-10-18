import React from 'react';
import { FileText } from 'lucide-react';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Message attachment: images show inline, other files as a download link. */
export const Attachment: React.FC<{ url: string; imageClassName?: string }> = ({ url, imageClassName = 'max-h-60' }) => {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`block mb-2 rounded-xl overflow-hidden ${imageClassName}`}>
        <img src={url} alt="Attachment" className="w-full object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      download
      className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="font-semibold">{ext ? `${ext.toUpperCase()} file` : 'File'}</span>
    </a>
  );
};
