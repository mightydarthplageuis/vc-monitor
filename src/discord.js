const https = require("https");

const PAGE_LINK_PREFIX = "https://us.vestiairecollective.com";
const IMAGE_PREFIX = "https://images.vestiairecollective.com";

function buildEmbed(item) {
  const pageLink = PAGE_LINK_PREFIX + (item.link || "");
  const pictures = item.pictures || [];
  const imageUrl = pictures.length ? IMAGE_PREFIX + pictures[0] : null;

  const price = item.price || {};
  const priceStr = `${((price.cents || 0) / 100).toFixed(2)} ${price.currency || ""}`.trim();

  const embed = {
    title: `${item.brand?.name || "?"} - ${item.name || "?"}`,
    url: pageLink,
    color: 0x2ecc71,
    fields: [
      { name: "Price", value: priceStr || "?", inline: true },
      { name: "Location", value: item.country || "?", inline: true },
      { name: "Condition", value: item.condition?.label || "?", inline: true },
      { name: "Size", value: item.size?.label || "?", inline: true },
    ],
  };
  if (imageUrl) embed.image = { url: imageUrl };

  return embed;
}

/** POST a single item as a Discord embed to the given webhook URL. */
function sendEmbed(webhookUrl, item) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify({ embeds: [buildEmbed(item)] }));
    const u = new URL(webhookUrl);

    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": data.length },
        timeout: 15000,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode));
      }
    );

    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = { sendEmbed, buildEmbed };
