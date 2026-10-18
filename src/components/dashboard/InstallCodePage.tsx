import React from 'react';
import { Code2, Download } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

export const InstallCodePage: React.FC = () => {
  const { t } = useSettings();
  const appOrigin = window.location.origin;

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-6 overflow-y-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>{t('install')}</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Customers reach the chat only through the WordPress plugin.
        </p>
      </div>

      <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl shadow-xs space-y-4 max-w-2xl">
        <ol className="list-decimal ps-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <li>Download the plugin below.</li>
          <li>
            In WordPress go to <strong>Plugins &gt; Add New &gt; Upload Plugin</strong>, upload it and activate it.
          </li>
          <li>
            Open <strong>Settings &gt; LiveFlow Chat</strong> and enter{' '}
            <code className="font-mono px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded" dir="ltr">
              {appOrigin}
            </code>{' '}
            as the chat server URL.
          </li>
        </ol>

        <a
          href="/liveflow-chat.zip"
          download
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download WordPress plugin</span>
        </a>
      </div>
    </div>
  );
};
