import { useEffect, useState } from 'react';
import { liveflowService } from './api';

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Links to the customer chat page (/chat). When the dashboard is opened via
 * localhost, the best link to share is the computer's network address instead.
 */
export function useCustomerChatLinks() {
  const [networkLinks, setNetworkLinks] = useState<string[]>([]);

  useEffect(() => {
    liveflowService
      .getServerInfo()
      .then((info) => setNetworkLinks(info.lanUrls.map((url) => `${url}/chat`)))
      .catch(() => {});
  }, []);

  const currentLink = `${window.location.origin}/chat`;
  const isLocalhost = LOCAL_HOSTNAMES.includes(window.location.hostname);
  const shareLink = isLocalhost && networkLinks[0] ? networkLinks[0] : currentLink;

  return { shareLink, currentLink, networkLinks, isLocalhost };
}
