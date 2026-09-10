/* audio.js - the one place that talks to SpeechSynthesis. Flashcard,
 * review, the word list and the tooltip all just import speak(). */
export const speak = text => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = .85;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch(e){}
};
