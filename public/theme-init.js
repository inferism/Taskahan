// Runs synchronously from <head> before first paint (no inline script, per the CSP).
;(function () {
  var pref = 'system'
  try {
    pref = localStorage.getItem('theme') || 'system'
  } catch (e) {
    /* storage blocked: follow the system */
  }
  var dark =
    pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
  root.style.colorScheme = dark ? 'dark' : 'light'
})()
