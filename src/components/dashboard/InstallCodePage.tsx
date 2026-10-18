import React, { useState } from 'react';
import { Code2, Copy, Check } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

export const InstallCodePage: React.FC = () => {
  const { settings, t } = useSettings();
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${window.location.origin}/widget.js" data-position="${settings.widget_position || 'bottom-right'}" defer></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-6 overflow-y-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>{t('install')}</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Add this line to the footer of your website to show the chat bubble on every page.
        </p>
      </div>

      <div className="p-4 md:p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl shadow-xs space-y-4 max-w-3xl">
        <div className="relative">
          <pre dir="ltr" className="p-4 pe-28 bg-zinc-900 text-zinc-100 font-mono text-xs rounded-2xl overflow-x-auto border border-zinc-800">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-3 end-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <ol className="list-decimal ps-5 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <li>
            WordPress: open <strong>Code Snippets &gt; Header &amp; Footer</strong> (WPCode) and paste the line into the{' '}
            <strong>Footer</strong> box, then save.
          </li>
          <li>Clear your cache plugin (e.g. LiteSpeed Cache) so visitors get the updated pages.</li>
          <li>
            Change <code dir="ltr">data-position</code> to <code dir="ltr">bottom-left</code> or{' '}
            <code dir="ltr">bottom-right</code> to move the bubble.
          </li>
        </ol>
      </div>
    </div>
  );
};
