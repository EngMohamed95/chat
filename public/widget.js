/**
 * LiveFlow chat bubble for any website (WordPress, Shopify, plain HTML).
 *
 *   <script src="https://chat.example.com/widget.js" defer></script>
 *
 * Optional attributes:
 *   data-position="bottom-left" | "bottom-right"  - overrides the dashboard setting
 *
 * The chat itself runs inside an iframe served by the LiveFlow server, so the
 * host site's CSS can't break it. The iframe tells us when it opens or closes
 * and which corner it belongs in; this script only sizes and places it.
 */
(function () {
  'use strict';

  if (window.__LiveFlowWidgetInitialized) return;
  window.__LiveFlowWidgetInitialized = true;

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var appOrigin = new URL(script.src, window.location.href).origin;
  var widgetId = script.getAttribute('data-widget-id') || 'default';
  var forcedPosition = script.getAttribute('data-position');
  if (forcedPosition !== 'bottom-left' && forcedPosition !== 'bottom-right') forcedPosition = null;

  var CLOSED_SIZE = 80; // 56px bubble + room for its shadow and unread badge
  var MOBILE_BREAKPOINT = 640;

  var state = { isOpen: false, position: forcedPosition || 'bottom-right', ready: false };

  var container = document.createElement('div');
  container.id = 'liveflow-widget-root';
  var base = container.style;
  base.position = 'fixed';
  base.zIndex = '2147483000';
  base.border = 'none';
  base.margin = '0';
  base.padding = '0';
  base.background = 'transparent';
  base.visibility = 'hidden'; // shown once the iframe reports its settings, so it never jumps sides
  base.transition = 'width .2s ease, height .2s ease, border-radius .2s ease';

  var iframe = document.createElement('iframe');
  // "Open the chat" links in reply emails carry ?lf_chat=<token>: hand it to the chat (which reopens that
  // conversation) and drop it from the address bar so it is not shared by accident.
  var resumeToken = null;
  try {
    var pageUrl = new URL(window.location.href);
    resumeToken = pageUrl.searchParams.get('lf_chat');
    if (resumeToken) {
      pageUrl.searchParams.delete('lf_chat');
      window.history.replaceState(window.history.state, '', pageUrl.toString());
    }
  } catch (e) {
    resumeToken = null;
  }

  // The chat runs on another origin, so tell it which page the visitor is on (shown to agents, linked in reply emails).
  iframe.src = appOrigin + '/?mode=widget&widgetId=' + encodeURIComponent(widgetId) +
    '&page=' + encodeURIComponent(window.location.href.slice(0, 500)) +
    '&ref=' + encodeURIComponent(document.referrer.slice(0, 500)) +
    (resumeToken ? '&resume=' + encodeURIComponent(resumeToken) : '');
  iframe.title = 'Live chat';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.allow = 'autoplay; clipboard-write';
  var f = iframe.style;
  f.width = '100%';
  f.height = '100%';
  f.border = 'none';
  f.display = 'block';
  f.background = 'transparent';
  f.colorScheme = 'normal';

  container.appendChild(iframe);

  function layout() {
    var isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    var side = state.position === 'bottom-left' ? 'left' : 'right';
    var other = side === 'left' ? 'right' : 'left';
    base[other] = 'auto';

    if (state.isOpen && isMobile) {
      base.width = '100%';
      base.height = '100%';
      base.bottom = '0';
      base[side] = '0';
      base.borderRadius = '0';
      base.boxShadow = 'none';
      base.overflow = 'hidden';
    } else if (state.isOpen) {
      base.width = '400px';
      base.height = 'min(640px, calc(100% - 40px))';
      base.bottom = '20px';
      base[side] = '20px';
      base.borderRadius = '24px';
      base.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.25)';
      base.overflow = 'hidden';
    } else {
      base.width = CLOSED_SIZE + 'px';
      base.height = CLOSED_SIZE + 'px';
      base.bottom = '12px';
      base[side] = '12px';
      base.borderRadius = '0';
      base.boxShadow = 'none';
      base.overflow = 'visible';
    }
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== appOrigin || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== 'liveflow-widget' || data.action !== 'resize') return;

    state.isOpen = !!data.isOpen;
    if (!forcedPosition && (data.position === 'bottom-left' || data.position === 'bottom-right')) {
      state.position = data.position;
    }
    layout();
    if (!state.ready) {
      state.ready = true;
      base.visibility = 'visible';
    }
  });

  window.addEventListener('resize', layout);

  function mount() {
    layout();
    document.body.appendChild(container);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
