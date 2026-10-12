import React, { useState } from 'react';
import { Code2, Copy, Check, Sparkles, ExternalLink, Globe, Shield, Link2, AlertTriangle } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useCustomerChatLinks } from '../../lib/chatLink';

const CopyLinkRow: React.FC<{ url: string; t: (key: any) => string }> = ({ url, t }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code dir="ltr" className="flex-1 min-w-0 truncate px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 font-mono text-xs rounded-xl border border-zinc-200 dark:border-zinc-700">
        {url}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? t('copied') : t('copyLink')}</span>
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>{t('openLink')}</span>
      </a>
    </div>
  );
};

export const InstallCodePage: React.FC = () => {
  const { settings, t } = useSettings();
  const [copied, setCopied] = useState(false);
  const { currentLink, networkLinks, isLocalhost } = useCustomerChatLinks();

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const embedSnippet = `<script src="${appOrigin}/widget.js" data-widget-id="${settings.id || 'liveflow-prod'}" defer></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>{t('install')}</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Add the LiveFlow live chat widget to any website or web application with a single HTML script tag.
        </p>
      </div>

      {/* Direct customer chat link */}
      <div className="p-6 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 rounded-3xl shadow-xs space-y-4 max-w-4xl">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('customerLink')}</h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('customerLinkDesc')}</p>

        <CopyLinkRow url={currentLink} t={t} />

        {isLocalhost && (
          <>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('localhostWarning')}</span>
            </div>
            {networkLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{t('networkLinks')}</p>
                {networkLinks.map((url) => (
                  <CopyLinkRow key={url} url={url} t={t} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Main Snippet Card */}
      <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl shadow-xs space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              HTML Embed Snippet (Shadow DOM / Iframe Isolated)
            </h3>
          </div>
          <span className="text-[11px] text-zinc-400">Paste right before &lt;/body&gt;</span>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          The widget runs in an isolated frame container. It will not leak CSS styles, collision classes, or modify your host website's layout.
        </p>

        {/* Code Block with Copy Button */}
        <div className="relative group">
          <pre className="p-4 bg-zinc-900 text-zinc-100 font-mono text-xs rounded-2xl overflow-x-auto border border-zinc-800 shadow-inner">
            <code>{embedSnippet}</code>
          </pre>

          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-3 right-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Platforms Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>HTML & Next.js</span>
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Paste the script tag directly before the closing <code className="text-zinc-700 dark:text-zinc-300 font-mono">&lt;/body&gt;</code> in your <code className="font-mono">index.html</code> or in Next.js <code className="font-mono">app/layout.tsx</code>.
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Shopify & E-commerce</span>
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Go to <strong>Online Store &gt; Themes &gt; Edit code</strong>, open <code className="font-mono">theme.liquid</code>, and paste the code right before the closing <code className="font-mono">&lt;/body&gt;</code> tag.
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-purple-600" />
            <span>WordPress</span>
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <a href="/liveflow-chat.zip" download className="text-emerald-600 dark:text-emerald-400 font-semibold underline">Download the plugin</a>, then in WordPress go to <strong>Plugins &gt; Add New &gt; Upload Plugin</strong>, activate it, and enter <code className="font-mono" dir="ltr">{appOrigin}</code> under <strong>Settings &gt; LiveFlow Chat</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
