(() => {
  const scene = window.__UI_REVIEW__;
  if (!scene) return;
  Date.now = () => scene.now;
  localStorage.removeItem("ww:recent-room");
  for (const key of Object.keys(localStorage)) if (key.startsWith("ww:host:")) localStorage.removeItem(key);
  let opened = false; let ready = false; let lastPath = "";
  const send = (data) => parent.postMessage({ key: scene.key, ...data }, location.origin);
  const check = () => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; send({ type: "ui-review:route", path: location.pathname }); }
    if (scene.panel && !opened) {
      if (document.querySelector("dialog[open]")) opened = true;
      else {
        const label = scene.panel === "host" ? "主持控制" : "查看身份";
        const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === label || (scene.panel === "private" && b.textContent.trim() === "查看当前任务"));
        if (button && !button.disabled) { opened = true; button.click(); }
      }
    }
    if (ready) return;
    const content = scene.panel === "private" ? document.querySelector("dialog[open] .identity img")
      : scene.panel === "host" ? document.querySelector("dialog[open] .host-controls")
        : scene.kind === "recap" ? document.querySelector(".role-gallery article")
          : scene.kind === "join" ? document.querySelector(".invite-summary")
            : scene.kind === "create" ? document.querySelector(".entry-form fieldset:not(:disabled)") : document.querySelector(".room-code strong");
    if (!content || (content.tagName === "IMG" && (!content.complete || !content.naturalWidth))) return;
    ready = true; void document.fonts.ready.then(() => send({ type: "ui-review:ready", scene: scene.id }));
  };
  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { childList: true, attributes: true, subtree: true });
  document.addEventListener("load", check, true); void document.fonts.ready.then(check);
  document.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
      || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    event.preventDefault(); send({ type: "ui-review:step", direction: event.key === "ArrowLeft" ? -1 : 1 });
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (link && new URL(link.href).origin === location.origin && new URL(link.href).pathname === "/") {
      event.preventDefault(); event.stopPropagation(); location.assign("/__app");
    }
  }, true);
})();
