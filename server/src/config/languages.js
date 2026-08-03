const LANGUAGE_IDS = Object.freeze({
  c: 50,
  cpp: 54,
  java: 62,
  python: 71,
});

const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(LANGUAGE_IDS));

function getLanguageId(language) {
  return LANGUAGE_IDS[language];
}

module.exports = {
  LANGUAGE_IDS,
  SUPPORTED_LANGUAGES,
  getLanguageId,
};
