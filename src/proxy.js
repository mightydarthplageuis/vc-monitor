const { HttpsProxyAgent } = require("https-proxy-agent");

/**
 * Build an HTTPS proxy agent from a "host:port:user:pass" string
 * (e.g. a Decodo/Smartproxy rotating endpoint).
 */
function buildAgent(proxyString) {
  if (!proxyString) return undefined;

  const parts = proxyString.split(":");
  if (parts.length < 2) return undefined;

  const [host, port, user, ...passParts] = parts;
  const pass = passParts.join(":");

  let url;
  if (user) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
    url = `http://${auth}@${host}:${port}`;
  } else {
    url = `http://${host}:${port}`;
  }

  return new HttpsProxyAgent(url);
}

module.exports = { buildAgent };
