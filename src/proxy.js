/**
 * Build a "http://user:pass@host:port" proxy URL (for curl's -x flag) from a
 * "host:port:user:pass" string (e.g. a Decodo/Smartproxy rotating endpoint).
 */
function buildProxyUrl(proxyString) {
  if (!proxyString) return undefined;

  const parts = proxyString.split(":");
  if (parts.length < 2) return undefined;

  const [host, port, user, ...passParts] = parts;
  const pass = passParts.join(":");

  if (user) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
    return `http://${auth}@${host}:${port}`;
  }
  return `http://${host}:${port}`;
}

/** Pick a random proxy string from a list (one per line / array entry). */
function pickRandom(proxyList) {
  if (!Array.isArray(proxyList) || proxyList.length === 0) return undefined;
  return proxyList[Math.floor(Math.random() * proxyList.length)];
}

/** Mask the password portion of a "host:port:user:pass" string for logging. */
function maskProxy(proxyString) {
  if (!proxyString) return "(none)";
  const parts = proxyString.split(":");
  if (parts.length < 4) return proxyString;
  const [host, port, user] = parts;
  return `${host}:${port}:${user}:***`;
}

module.exports = { buildProxyUrl, pickRandom, maskProxy };
