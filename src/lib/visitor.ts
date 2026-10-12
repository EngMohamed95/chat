import { VisitorMetadata } from '../types';

export function getVisitorMetadata(): VisitorMetadata {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  
  let browser = 'Unknown Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = 'Unknown OS';
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let device = 'Desktop';
  if (/Mobi|Android|iPhone/i.test(ua)) device = 'Mobile';
  else if (/Tablet|iPad/i.test(ua)) device = 'Tablet';

  let referrer = '';
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname : 'Direct Visit';
  } catch {
    referrer = 'Direct Visit';
  }

  return {
    current_url: typeof window !== 'undefined' ? window.location.pathname || '/' : '/',
    referrer: referrer || 'Direct Visit',
    browser,
    os,
    device,
    country: 'Saudi Arabia', // Can default or fetch geo
    first_seen_at: new Date().toISOString(),
  };
}
