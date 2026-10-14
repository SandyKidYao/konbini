// Shared by the homepage: the scene runs in an iframe from the same origin, so the page can follow its
// day and night (the app flips body[data-theme] when daylight fades), and hands it focus so its keys work.
export function mountScene(frame) {
  frame.addEventListener('load', () => {
    const body = frame.contentDocument?.body;
    if (body) {
      const apply = () => { document.documentElement.dataset.scene = body.dataset.theme === 'dark' ? 'dark' : 'light'; };
      apply();
      new MutationObserver(apply).observe(body, { attributes: true, attributeFilter: ['data-theme'] });
    }
    frame.focus();
  });
}
