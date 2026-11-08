// Read-aloud using the browser's built-in voices. Picks the most natural-sounding English voice available.
let chosen: SpeechSynthesisVoice | null = null;
let preferredName = '';
try {
  preferredName = localStorage.getItem('citybuilding.voice') ?? '';
} catch { /* storage unavailable */ }

const PREFS = [/natural/i, /neural/i, /(aria|jenny|ava|emma|michelle|samantha)/i, /google us english/i, /en-us/i];

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

function choose() {
  const vs = englishVoices();
  if (!vs.length) return null;
  if (preferredName) {
    const p = vs.find((v) => v.name === preferredName);
    if (p) return p;
  }
  for (const re of PREFS) {
    const us = vs.find((v) => re.test(v.name) && v.lang.toLowerCase().includes('us'));
    if (us) return us;
    const any = vs.find((v) => re.test(v.name));
    if (any) return any;
  }
  return vs[0];
}

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => (chosen = choose());
  chosen = choose();
}

export function setVoice(name: string) {
  preferredName = name;
  try {
    localStorage.setItem('citybuilding.voice', name);
  } catch { /* ignore */ }
  chosen = choose();
}

export function currentVoiceName() {
  return chosen?.name ?? '';
}

export function say(text: string, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/−/g, ' minus ').replace(/\+/g, ' plus ').replace(/=\s*\?/g, ' equals what?').replace(/\?\s*=/g, ' what number equals ').replace(/___/g, ' blank '));
  if (!chosen) chosen = choose();
  if (chosen) u.voice = chosen;
  u.rate = rate;
  u.pitch = 1.05;
  speechSynthesis.speak(u);
}
