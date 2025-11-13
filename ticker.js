// ticker.js
document.addEventListener("DOMContentLoaded", () => {
  const savedSettings = JSON.parse(localStorage.getItem("gameSettings")) || {};

  const spacerType = savedSettings.spacerType || "space";
  const spacerLength = parseInt(savedSettings.spacerLength || 50);
  const speed = parseInt(savedSettings.tickerSpeed || 50);

  const ticker = document.getElementById("ticker");
  if (!ticker) return; // Safety check

  fetch("news.json")
    .then((res) => res.json())
    .then((newsItems) => {
      const spacer =
        spacerType === "dashed"
          ? " — ".repeat(spacerLength / 2)
          : "\u00A0".repeat(spacerLength);

      function showRandomMessages() {
        const shuffled = [...newsItems].sort(() => Math.random() - 0.5);
        const text = shuffled.map((item) => item.message).join(spacer) + spacer;

        ticker.textContent = text;

        const width = ticker.offsetWidth;
        const duration = width / speed;

        // update CSS variables for proper movement distance
        const containerWidth = ticker.parentElement.offsetWidth;
        ticker.style.setProperty("--start", `${containerWidth}px`);
        ticker.style.setProperty("--end", `-${width}px`);

        // reset and reapply animation
        ticker.style.animation = "none";
        void ticker.offsetHeight; // force reflow
        ticker.style.animation = `ticker-scroll ${duration}s linear infinite`;
      }

      showRandomMessages();
    })
    .catch((err) => console.error("Ticker Error:", err));
});
