"use strict";

/* ---------------------------------------------------------------------------
 * UI language: detection, storage, and the string table.
 *
 * Loaded as a plain script by the popup, the background worker
 * (importScripts) and the content script — unlike shared/api.js, nothing
 * here touches the API key, so it's safe in a youtube.com world too.
 *
 * "auto" (the default — nothing saved yet) means "follow the system
 * language", resolved fresh on every call via resolveLanguageCode() rather
 * than pinned once, so it tracks the OS language if that changes later.
 * ------------------------------------------------------------------------ */

// A curated subset, not an exhaustive one. `label` is the English name — used
// to instruct Gemini in shared/api.js's buildPrompt(), where an English
// instruction is the safest bet regardless of UI language. `native` is the
// name in its own language/script — used for the popup's <select>, so a
// Spanish speaker sees "Español", not "Spanish".
const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "nl", label: "Dutch", native: "Nederlands" },
  { code: "pl", label: "Polish", native: "Polski" },
  { code: "sv", label: "Swedish", native: "Svenska" },
  { code: "da", label: "Danish", native: "Dansk" },
  { code: "no", label: "Norwegian", native: "Norsk" },
  { code: "fi", label: "Finnish", native: "Suomi" },
  { code: "cs", label: "Czech", native: "Čeština" },
  { code: "ro", label: "Romanian", native: "Română" },
  { code: "el", label: "Greek", native: "Ελληνικά" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "uk", label: "Ukrainian", native: "Українська" },
  { code: "he", label: "Hebrew", native: "עברית" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "th", label: "Thai", native: "ไทย" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "zh", label: "Chinese (Simplified)", native: "中文（简体）" },
];

// navigator.language exists in the popup, the content script and — as
// WorkerNavigator — the service worker, so this runs unchanged in all three.
function systemLanguageCode() {
  const raw =
    (typeof navigator !== "undefined" &&
      (navigator.language ||
        (navigator.languages && navigator.languages[0]))) ||
    "en";
  return raw.split("-")[0].toLowerCase();
}

const getLanguagePref = async () =>
  (await chrome.storage.local.get("language")).language || "auto";

async function resolveLanguageCode() {
  const pref = await getLanguagePref();
  return pref === "auto" ? systemLanguageCode() : pref;
}

// English name, for the Gemini prompt. Falls back to Intl for a system
// language outside LANGUAGES, so "auto" never produces an unnamed code.
function languageLabel(code) {
  const known = LANGUAGES.find((l) => l.code === code);
  if (known) return known.label;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

// Native-script name, for the popup's <select>.
function languageNativeLabel(code) {
  const known = LANGUAGES.find((l) => l.code === code);
  if (known) return known.native;
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) || code;
  } catch {
    return languageLabel(code);
  }
}

/* ---------------------------------------------------------------------------
 * Strings
 *
 * Every UI-visible piece of text in the popup, the in-page modal and the
 * error paths, keyed the same way in every language. t() falls back to
 * STRINGS.en for a language that doesn't have a key yet (or isn't in this
 * table at all) — so a language with a partial or missing entry still
 * renders correctly, just in English for whatever's missing, rather than
 * showing a raw key or throwing. That's deliberate: it's what lets LANGUAGES
 * above list more languages than STRINGS fully covers, with no broken state
 * either way — the AI summary itself (shared/api.js's buildPrompt) works for
 * every one of them regardless, since it only needs languageLabel().
 *
 * {placeholders} are substituted by t(); see shared/i18n.js's t().
 * ------------------------------------------------------------------------ */

const STRINGS = {
  en: {
    // Navigation
    settings: "Settings",
    history: "History",
    summaryViewTitle: "Summary",
    back: "Back",

    // Settings panel
    apiKeyLabel: "Gemini API key",
    apiKeyHint:
      "Stored locally in this browser and sent only to Google's API. Get one at",
    show: "Show",
    hide: "Hide",
    saveKey: "Save key",
    clear: "Clear",
    enterKeyFirst: "Enter a key first.",
    keySaved: "Key saved.",
    keyCleared: "Key cleared.",
    summaryLanguage: "Language",
    autoDetected: "Auto (detected: {lang})",
    languageHint:
      "Applies to new summaries. Cached ones keep the language they were made in.",
    languageSaved: "Language saved.",
    viewHistory: "View history",
    clearCachedSummaries: "Clear cached summaries",
    cacheCleared: "Cached summaries cleared.",

    // Main view
    checkingTab: "Checking current tab…",
    noVideoTitle: "No YouTube video here",
    noVideoNotice:
      "Open a YouTube video (youtube.com/watch, /shorts or youtu.be) and click the icon again.",
    youtubeVideoFallback: "YouTube video",
    addApiKeyNotice: "Add your Gemini API key to get started.",
    addApiKeyToSummarize: "Add your API key to summarize.",
    noApiKeyTitle: "No API key set",
    noApiKeyDetailPopup:
      "Add your Gemini API key in settings (gear icon, top right), then try again.",
    noApiKeyDetailInPage:
      "Click the YouTube Quick Summary toolbar icon, open settings (gear icon) and add your Gemini API key.",
    summarize: "Summarize",
    summarizing: "Summarizing…",
    cachedRelative: "Cached {time}",
    resummarize: "Re-summarize",
    watchingVideo: "Watching the video…",
    watchingVideoSub:
      "Gemini processes the full video, so this can take a while.",
    unexpectedError: "Unexpected error",
    failedToStart: "Failed to start",
    tryAgain: "Try again",
    summarizedJustNow: "Summarized just now",

    // History view
    searchPlaceholder: "Search titles and summaries…",
    untitledVideo: "Untitled video",
    unknownDate: "unknown date",
    noMatches: "Nothing matches that search.",
    noSummariesYet:
      "No summaries yet. Summarize a video and it'll show up here.",

    // Entry view
    openOnYoutube: "Open on YouTube",
    delete: "Delete",
    deleteConfirm: "Click again to delete",
    cachedUnknownTime: "Cached at an unknown time",

    // Relative time (shared/render.js)
    justNow: "just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",

    // In-page modal (content.js)
    closeModal: "Close",
    notAYoutubeVideo: "Not a YouTube video",
    notAYoutubeVideoDetail:
      "Couldn't work out which video that menu belongs to.",
    extensionUnavailable: "Extension unavailable",
    extensionUnavailableDetail:
      "The extension was reloaded or updated. Refresh this page and try again.",

    // Gemini API errors (shared/api.js)
    invalidApiKeyTitle: "Invalid API key",
    invalidApiKeyDetail: "Check the key in settings, then save it again.",
    unsupportedVideoTitle: "Gemini couldn't read this video",
    unsupportedVideoDetail:
      "Private, unlisted, age-restricted, region-blocked and members-only videos aren't supported — only public ones.",
    requestRejectedTitle: "Request rejected by the API",
    requestRejectedFallback: "The API returned 400 with no detail.",
    apiNotEnabledTitle: "API not enabled for this key",
    apiKeyRejectedTitle: "API key rejected",
    apiKeyRejectedFallback:
      "The key was refused. Confirm it's a Gemini API key from Google AI Studio.",
    modelNotFoundTitle: "Model not found",
    modelNotFoundDetail:
      '"{model}" was rejected as unknown. The model may have been renamed or retired.',
    rateLimitTitle: "Rate limit or quota exceeded",
    rateLimitDetail:
      "The free tier caps YouTube video input at 8 hours per day. Wait and retry, or check your quota in Google AI Studio.",
    serverErrorTitle: "Google's API had a problem",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. This is usually transient — try again.",
    requestFailedTitle: "Request failed (HTTP {status})",
    requestFailedFallback: "No detail returned.",

    timedOutTitle: "Timed out",
    timedOutDetail:
      "No response after {seconds}s. Long videos can exceed this — try a shorter one, or retry.",
    connectionLostTitle: "Connection lost",
    connectionLostDetail: "The summary stopped partway through. ({message})",
    networkErrorTitle: "Network error",
    networkErrorDetail:
      "Couldn't reach Google's API. Check your connection. ({message})",

    blockSafety: "The response was blocked by Gemini's safety filters.",
    blockRecitation:
      "The response was blocked because it reproduced protected content.",
    blockProhibited: "The response was blocked as prohibited content.",
    blockBlocklist: "The response was blocked by a term blocklist.",
    blockMaxTokens: "The response hit the output token limit before finishing.",
    requestBlockedTitle: "Request blocked",
    blockedGeneric: "Blocked: {reason}",
    noSummaryTitle: "No summary returned",
    noSummaryGeneric: "The model returned no text{suffix}.",
    unreadableResponseTitle: "Unreadable response",
    unreadableResponseDetail: "The API returned no readable body.",
  },

  es: {
    settings: "Ajustes",
    history: "Historial",
    summaryViewTitle: "Resumen",
    back: "Atrás",
    apiKeyLabel: "Clave de API de Gemini",
    apiKeyHint:
      "Se guarda solo en este navegador y se envía únicamente a la API de Google. Consigue una en",
    show: "Mostrar",
    hide: "Ocultar",
    saveKey: "Guardar clave",
    clear: "Borrar",
    enterKeyFirst: "Introduce una clave primero.",
    keySaved: "Clave guardada.",
    keyCleared: "Clave borrada.",
    summaryLanguage: "Idioma",
    autoDetected: "Automático (detectado: {lang})",
    languageHint:
      "Se aplica a los resúmenes nuevos. Los guardados en caché conservan el idioma en el que se crearon.",
    languageSaved: "Idioma guardado.",
    viewHistory: "Ver historial",
    clearCachedSummaries: "Borrar resúmenes en caché",
    cacheCleared: "Resúmenes en caché borrados.",
    checkingTab: "Comprobando la pestaña actual…",
    noVideoTitle: "No hay ningún vídeo de YouTube aquí",
    noVideoNotice:
      "Abre un vídeo de YouTube (youtube.com/watch, /shorts o youtu.be) y vuelve a hacer clic en el icono.",
    youtubeVideoFallback: "Vídeo de YouTube",
    addApiKeyNotice: "Añade tu clave de API de Gemini para empezar.",
    addApiKeyToSummarize: "Añade tu clave de API para resumir.",
    noApiKeyTitle: "No se ha configurado ninguna clave de API",
    noApiKeyDetailPopup:
      "Añade tu clave de API de Gemini en ajustes (icono de engranaje, arriba a la derecha) y vuelve a intentarlo.",
    noApiKeyDetailInPage:
      "Haz clic en el icono de YouTube Quick Summary en la barra de herramientas, abre ajustes (icono de engranaje) y añade tu clave de API de Gemini.",
    summarize: "Resumir",
    summarizing: "Resumiendo…",
    cachedRelative: "En caché {time}",
    resummarize: "Volver a resumir",
    watchingVideo: "Viendo el vídeo…",
    watchingVideoSub:
      "Gemini procesa el vídeo completo, así que puede tardar un poco.",
    unexpectedError: "Error inesperado",
    failedToStart: "Error al iniciar",
    tryAgain: "Reintentar",
    summarizedJustNow: "Resumido ahora mismo",
    searchPlaceholder: "Buscar títulos y resúmenes…",
    untitledVideo: "Vídeo sin título",
    unknownDate: "fecha desconocida",
    noMatches: "No hay coincidencias con esa búsqueda.",
    noSummariesYet: "Aún no hay resúmenes. Resume un vídeo y aparecerá aquí.",
    openOnYoutube: "Abrir en YouTube",
    delete: "Eliminar",
    deleteConfirm: "Vuelve a hacer clic para eliminar",
    cachedUnknownTime: "En caché en un momento desconocido",
    justNow: "justo ahora",
    minutesAgo: "hace {n} min",
    hoursAgo: "hace {n} h",
    daysAgo: "hace {n} d",
    closeModal: "Cerrar",
    notAYoutubeVideo: "No es un vídeo de YouTube",
    notAYoutubeVideoDetail:
      "No se pudo determinar a qué vídeo pertenece ese menú.",
    extensionUnavailable: "Extensión no disponible",
    extensionUnavailableDetail:
      "La extensión se recargó o actualizó. Actualiza esta página e inténtalo de nuevo.",
    invalidApiKeyTitle: "Clave de API no válida",
    invalidApiKeyDetail: "Comprueba la clave en ajustes y guárdala de nuevo.",
    unsupportedVideoTitle: "Gemini no pudo leer este vídeo",
    unsupportedVideoDetail:
      "No se admiten vídeos privados, no listados, con restricción de edad, bloqueados por región o solo para miembros; solo los públicos.",
    requestRejectedTitle: "Solicitud rechazada por la API",
    requestRejectedFallback: "La API devolvió un error 400 sin más detalles.",
    apiNotEnabledTitle: "La API no está habilitada para esta clave",
    apiKeyRejectedTitle: "Clave de API rechazada",
    apiKeyRejectedFallback:
      "Se rechazó la clave. Confirma que es una clave de API de Gemini de Google AI Studio.",
    modelNotFoundTitle: "Modelo no encontrado",
    modelNotFoundDetail:
      '"{model}" se rechazó por desconocido. Puede que el modelo haya cambiado de nombre o se haya retirado.',
    rateLimitTitle: "Límite de uso o cuota excedidos",
    rateLimitDetail:
      "El nivel gratuito limita la entrada de vídeo de YouTube a 8 horas al día. Espera y vuelve a intentarlo, o revisa tu cuota en Google AI Studio.",
    serverErrorTitle: "La API de Google tuvo un problema",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Esto suele ser temporal: inténtalo de nuevo.",
    requestFailedTitle: "Solicitud fallida (HTTP {status})",
    requestFailedFallback: "No se devolvió ningún detalle.",
    timedOutTitle: "Tiempo de espera agotado",
    timedOutDetail:
      "Sin respuesta después de {seconds}s. Los vídeos largos pueden superar este límite: prueba con uno más corto o reinténtalo.",
    connectionLostTitle: "Conexión perdida",
    connectionLostDetail: "El resumen se detuvo a mitad de camino. ({message})",
    networkErrorTitle: "Error de red",
    networkErrorDetail:
      "No se pudo conectar con la API de Google. Comprueba tu conexión. ({message})",
    blockSafety:
      "La respuesta fue bloqueada por los filtros de seguridad de Gemini.",
    blockRecitation:
      "La respuesta fue bloqueada por reproducir contenido protegido.",
    blockProhibited: "La respuesta fue bloqueada por ser contenido prohibido.",
    blockBlocklist:
      "La respuesta fue bloqueada por una lista de términos prohibidos.",
    blockMaxTokens:
      "La respuesta alcanzó el límite de tokens de salida antes de terminar.",
    requestBlockedTitle: "Solicitud bloqueada",
    blockedGeneric: "Bloqueado: {reason}",
    noSummaryTitle: "No se devolvió ningún resumen",
    noSummaryGeneric: "El modelo no devolvió texto{suffix}.",
    unreadableResponseTitle: "Respuesta ilegible",
    unreadableResponseDetail: "La API no devolvió un cuerpo legible.",
  },

  fr: {
    settings: "Paramètres",
    history: "Historique",
    summaryViewTitle: "Résumé",
    back: "Retour",
    apiKeyLabel: "Clé API Gemini",
    apiKeyHint:
      "Stockée uniquement dans ce navigateur et envoyée uniquement à l'API de Google. Obtenez-en une sur",
    show: "Afficher",
    hide: "Masquer",
    saveKey: "Enregistrer la clé",
    clear: "Effacer",
    enterKeyFirst: "Saisissez d'abord une clé.",
    keySaved: "Clé enregistrée.",
    keyCleared: "Clé effacée.",
    summaryLanguage: "Langue",
    autoDetected: "Auto (détectée : {lang})",
    languageHint:
      "S'applique aux nouveaux résumés. Les résumés en cache conservent la langue dans laquelle ils ont été créés.",
    languageSaved: "Langue enregistrée.",
    viewHistory: "Voir l'historique",
    clearCachedSummaries: "Effacer les résumés en cache",
    cacheCleared: "Résumés en cache effacés.",
    checkingTab: "Vérification de l'onglet actuel…",
    noVideoTitle: "Aucune vidéo YouTube ici",
    noVideoNotice:
      "Ouvrez une vidéo YouTube (youtube.com/watch, /shorts ou youtu.be) et recliquez sur l'icône.",
    youtubeVideoFallback: "Vidéo YouTube",
    addApiKeyNotice: "Ajoutez votre clé API Gemini pour commencer.",
    addApiKeyToSummarize: "Ajoutez votre clé API pour résumer.",
    noApiKeyTitle: "Aucune clé API configurée",
    noApiKeyDetailPopup:
      "Ajoutez votre clé API Gemini dans les paramètres (icône d'engrenage, en haut à droite), puis réessayez.",
    noApiKeyDetailInPage:
      "Cliquez sur l'icône YouTube Quick Summary de la barre d'outils, ouvrez les paramètres (icône d'engrenage) et ajoutez votre clé API Gemini.",
    summarize: "Résumer",
    summarizing: "Résumé en cours…",
    cachedRelative: "En cache {time}",
    resummarize: "Résumer à nouveau",
    watchingVideo: "Visionnage de la vidéo…",
    watchingVideoSub:
      "Gemini traite la vidéo entière, cela peut donc prendre un moment.",
    unexpectedError: "Erreur inattendue",
    failedToStart: "Échec du démarrage",
    tryAgain: "Réessayer",
    summarizedJustNow: "Résumé à l'instant",
    searchPlaceholder: "Rechercher des titres et des résumés…",
    untitledVideo: "Vidéo sans titre",
    unknownDate: "date inconnue",
    noMatches: "Aucun résultat pour cette recherche.",
    noSummariesYet:
      "Aucun résumé pour l'instant. Résumez une vidéo et elle apparaîtra ici.",
    openOnYoutube: "Ouvrir sur YouTube",
    delete: "Supprimer",
    deleteConfirm: "Cliquez à nouveau pour supprimer",
    cachedUnknownTime: "Mis en cache à une heure inconnue",
    justNow: "à l'instant",
    minutesAgo: "il y a {n} min",
    hoursAgo: "il y a {n} h",
    daysAgo: "il y a {n} j",
    closeModal: "Fermer",
    notAYoutubeVideo: "Ce n'est pas une vidéo YouTube",
    notAYoutubeVideoDetail:
      "Impossible de déterminer à quelle vidéo ce menu appartient.",
    extensionUnavailable: "Extension indisponible",
    extensionUnavailableDetail:
      "L'extension a été rechargée ou mise à jour. Actualisez cette page et réessayez.",
    invalidApiKeyTitle: "Clé API invalide",
    invalidApiKeyDetail:
      "Vérifiez la clé dans les paramètres, puis enregistrez-la à nouveau.",
    unsupportedVideoTitle: "Gemini n'a pas pu lire cette vidéo",
    unsupportedVideoDetail:
      "Les vidéos privées, non répertoriées, avec restriction d'âge, bloquées par région ou réservées aux membres ne sont pas prises en charge — seules les vidéos publiques le sont.",
    requestRejectedTitle: "Requête rejetée par l'API",
    requestRejectedFallback: "L'API a renvoyé une erreur 400 sans détail.",
    apiNotEnabledTitle: "L'API n'est pas activée pour cette clé",
    apiKeyRejectedTitle: "Clé API refusée",
    apiKeyRejectedFallback:
      "La clé a été refusée. Vérifiez qu'il s'agit bien d'une clé API Gemini provenant de Google AI Studio.",
    modelNotFoundTitle: "Modèle introuvable",
    modelNotFoundDetail:
      "« {model} » a été rejeté car inconnu. Le modèle a peut-être été renommé ou retiré.",
    rateLimitTitle: "Limite de débit ou quota dépassé",
    rateLimitDetail:
      "Le niveau gratuit limite l'entrée vidéo YouTube à 8 heures par jour. Attendez et réessayez, ou vérifiez votre quota dans Google AI Studio.",
    serverErrorTitle: "L'API de Google a rencontré un problème",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. C'est généralement temporaire : réessayez.",
    requestFailedTitle: "Échec de la requête (HTTP {status})",
    requestFailedFallback: "Aucun détail renvoyé.",
    timedOutTitle: "Délai dépassé",
    timedOutDetail:
      "Aucune réponse après {seconds}s. Les vidéos longues peuvent dépasser ce délai : essayez une vidéo plus courte, ou réessayez.",
    connectionLostTitle: "Connexion perdue",
    connectionLostDetail:
      "Le résumé s'est arrêté en cours de route. ({message})",
    networkErrorTitle: "Erreur réseau",
    networkErrorDetail:
      "Impossible de joindre l'API de Google. Vérifiez votre connexion. ({message})",
    blockSafety:
      "La réponse a été bloquée par les filtres de sécurité de Gemini.",
    blockRecitation:
      "La réponse a été bloquée car elle reproduisait du contenu protégé.",
    blockProhibited: "La réponse a été bloquée en tant que contenu interdit.",
    blockBlocklist:
      "La réponse a été bloquée par une liste de termes interdits.",
    blockMaxTokens:
      "La réponse a atteint la limite de tokens de sortie avant de se terminer.",
    requestBlockedTitle: "Requête bloquée",
    blockedGeneric: "Bloqué : {reason}",
    noSummaryTitle: "Aucun résumé renvoyé",
    noSummaryGeneric: "Le modèle n'a renvoyé aucun texte{suffix}.",
    unreadableResponseTitle: "Réponse illisible",
    unreadableResponseDetail: "L'API n'a renvoyé aucun corps lisible.",
  },

  de: {
    settings: "Einstellungen",
    history: "Verlauf",
    summaryViewTitle: "Zusammenfassung",
    back: "Zurück",
    apiKeyLabel: "Gemini-API-Schlüssel",
    apiKeyHint:
      "Wird nur lokal in diesem Browser gespeichert und ausschließlich an die API von Google gesendet. Einen Schlüssel gibt es unter",
    show: "Anzeigen",
    hide: "Verbergen",
    saveKey: "Schlüssel speichern",
    clear: "Löschen",
    enterKeyFirst: "Bitte zuerst einen Schlüssel eingeben.",
    keySaved: "Schlüssel gespeichert.",
    keyCleared: "Schlüssel gelöscht.",
    summaryLanguage: "Sprache",
    autoDetected: "Automatisch (erkannt: {lang})",
    languageHint:
      "Gilt für neue Zusammenfassungen. Zwischengespeicherte behalten die Sprache, in der sie erstellt wurden.",
    languageSaved: "Sprache gespeichert.",
    viewHistory: "Verlauf anzeigen",
    clearCachedSummaries: "Zwischengespeicherte Zusammenfassungen löschen",
    cacheCleared: "Zwischengespeicherte Zusammenfassungen gelöscht.",
    checkingTab: "Aktueller Tab wird geprüft…",
    noVideoTitle: "Hier ist kein YouTube-Video",
    noVideoNotice:
      "Öffne ein YouTube-Video (youtube.com/watch, /shorts oder youtu.be) und klicke erneut auf das Symbol.",
    youtubeVideoFallback: "YouTube-Video",
    addApiKeyNotice: "Füge deinen Gemini-API-Schlüssel hinzu, um loszulegen.",
    addApiKeyToSummarize:
      "Füge deinen API-Schlüssel hinzu, um zusammenzufassen.",
    noApiKeyTitle: "Kein API-Schlüssel festgelegt",
    noApiKeyDetailPopup:
      "Füge deinen Gemini-API-Schlüssel in den Einstellungen hinzu (Zahnrad-Symbol oben rechts) und versuche es erneut.",
    noApiKeyDetailInPage:
      "Klicke auf das YT-Quick-Summary-Symbol in der Symbolleiste, öffne die Einstellungen (Zahnrad-Symbol) und füge deinen Gemini-API-Schlüssel hinzu.",
    summarize: "Zusammenfassen",
    summarizing: "Wird zusammengefasst…",
    cachedRelative: "Zwischengespeichert {time}",
    resummarize: "Erneut zusammenfassen",
    watchingVideo: "Video wird angesehen…",
    watchingVideoSub:
      "Gemini verarbeitet das gesamte Video, das kann daher etwas dauern.",
    unexpectedError: "Unerwarteter Fehler",
    failedToStart: "Start fehlgeschlagen",
    tryAgain: "Erneut versuchen",
    summarizedJustNow: "Gerade eben zusammengefasst",
    searchPlaceholder: "Titel und Zusammenfassungen durchsuchen…",
    untitledVideo: "Video ohne Titel",
    unknownDate: "unbekanntes Datum",
    noMatches: "Keine Treffer für diese Suche.",
    noSummariesYet:
      "Noch keine Zusammenfassungen. Fasse ein Video zusammen, dann erscheint es hier.",
    openOnYoutube: "Auf YouTube öffnen",
    delete: "Löschen",
    deleteConfirm: "Zum Löschen erneut klicken",
    cachedUnknownTime: "Zu unbekannter Zeit zwischengespeichert",
    justNow: "gerade eben",
    minutesAgo: "vor {n} Min.",
    hoursAgo: "vor {n} Std.",
    daysAgo: "vor {n} T.",
    closeModal: "Schließen",
    notAYoutubeVideo: "Kein YouTube-Video",
    notAYoutubeVideoDetail:
      "Konnte nicht ermitteln, zu welchem Video dieses Menü gehört.",
    extensionUnavailable: "Erweiterung nicht verfügbar",
    extensionUnavailableDetail:
      "Die Erweiterung wurde neu geladen oder aktualisiert. Lade diese Seite neu und versuche es erneut.",
    invalidApiKeyTitle: "Ungültiger API-Schlüssel",
    invalidApiKeyDetail:
      "Überprüfe den Schlüssel in den Einstellungen und speichere ihn erneut.",
    unsupportedVideoTitle: "Gemini konnte dieses Video nicht lesen",
    unsupportedVideoDetail:
      "Private, nicht gelistete, altersbeschränkte, regional gesperrte und nur für Mitglieder verfügbare Videos werden nicht unterstützt — nur öffentliche.",
    requestRejectedTitle: "Anfrage von der API abgelehnt",
    requestRejectedFallback:
      "Die API hat 400 ohne weitere Details zurückgegeben.",
    apiNotEnabledTitle: "API für diesen Schlüssel nicht aktiviert",
    apiKeyRejectedTitle: "API-Schlüssel abgelehnt",
    apiKeyRejectedFallback:
      "Der Schlüssel wurde abgelehnt. Stelle sicher, dass es sich um einen Gemini-API-Schlüssel aus Google AI Studio handelt.",
    modelNotFoundTitle: "Modell nicht gefunden",
    modelNotFoundDetail:
      '„{model}" wurde als unbekannt abgelehnt. Das Modell wurde möglicherweise umbenannt oder eingestellt.',
    rateLimitTitle: "Ratenlimit oder Kontingent überschritten",
    rateLimitDetail:
      "Die kostenlose Stufe begrenzt YouTube-Video-Eingaben auf 8 Stunden pro Tag. Warte und versuche es erneut, oder überprüfe dein Kontingent in Google AI Studio.",
    serverErrorTitle: "Bei Googles API ist ein Problem aufgetreten",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Das ist meist vorübergehend — versuche es erneut.",
    requestFailedTitle: "Anfrage fehlgeschlagen (HTTP {status})",
    requestFailedFallback: "Keine Details zurückgegeben.",
    timedOutTitle: "Zeitüberschreitung",
    timedOutDetail:
      "Keine Antwort nach {seconds}s. Lange Videos können dieses Limit überschreiten — versuche ein kürzeres Video oder wiederhole den Versuch.",
    connectionLostTitle: "Verbindung verloren",
    connectionLostDetail:
      "Die Zusammenfassung wurde mittendrin abgebrochen. ({message})",
    networkErrorTitle: "Netzwerkfehler",
    networkErrorDetail:
      "Googles API konnte nicht erreicht werden. Überprüfe deine Verbindung. ({message})",
    blockSafety: "Die Antwort wurde durch Geminis Sicherheitsfilter blockiert.",
    blockRecitation:
      "Die Antwort wurde blockiert, weil sie geschütztes Material wiedergegeben hat.",
    blockProhibited: "Die Antwort wurde als unzulässiger Inhalt blockiert.",
    blockBlocklist:
      "Die Antwort wurde durch eine Begriffssperrliste blockiert.",
    blockMaxTokens:
      "Die Antwort hat das Ausgabe-Token-Limit erreicht, bevor sie fertig war.",
    requestBlockedTitle: "Anfrage blockiert",
    blockedGeneric: "Blockiert: {reason}",
    noSummaryTitle: "Keine Zusammenfassung zurückgegeben",
    noSummaryGeneric: "Das Modell hat keinen Text zurückgegeben{suffix}.",
    unreadableResponseTitle: "Unlesbare Antwort",
    unreadableResponseDetail:
      "Die API hat keinen lesbaren Inhalt zurückgegeben.",
  },

  it: {
    settings: "Impostazioni",
    history: "Cronologia",
    summaryViewTitle: "Riepilogo",
    back: "Indietro",
    apiKeyLabel: "Chiave API Gemini",
    apiKeyHint:
      "Salvata solo in questo browser e inviata solo all'API di Google. Ottienine una su",
    show: "Mostra",
    hide: "Nascondi",
    saveKey: "Salva chiave",
    clear: "Cancella",
    enterKeyFirst: "Inserisci prima una chiave.",
    keySaved: "Chiave salvata.",
    keyCleared: "Chiave cancellata.",
    summaryLanguage: "Lingua",
    autoDetected: "Automatica (rilevata: {lang})",
    languageHint:
      "Si applica ai nuovi riepiloghi. Quelli in cache mantengono la lingua in cui sono stati creati.",
    languageSaved: "Lingua salvata.",
    viewHistory: "Visualizza cronologia",
    clearCachedSummaries: "Cancella riepiloghi in cache",
    cacheCleared: "Riepiloghi in cache cancellati.",
    checkingTab: "Controllo della scheda attuale…",
    noVideoTitle: "Nessun video di YouTube qui",
    noVideoNotice:
      "Apri un video di YouTube (youtube.com/watch, /shorts o youtu.be) e fai di nuovo clic sull'icona.",
    youtubeVideoFallback: "Video di YouTube",
    addApiKeyNotice: "Aggiungi la tua chiave API Gemini per iniziare.",
    addApiKeyToSummarize: "Aggiungi la tua chiave API per riassumere.",
    noApiKeyTitle: "Nessuna chiave API impostata",
    noApiKeyDetailPopup:
      "Aggiungi la tua chiave API Gemini nelle impostazioni (icona a forma di ingranaggio, in alto a destra), poi riprova.",
    noApiKeyDetailInPage:
      "Fai clic sull'icona di YouTube Quick Summary nella barra degli strumenti, apri le impostazioni (icona a forma di ingranaggio) e aggiungi la tua chiave API Gemini.",
    summarize: "Riassumi",
    summarizing: "Riassumendo…",
    cachedRelative: "In cache {time}",
    resummarize: "Riassumi di nuovo",
    watchingVideo: "Visione del video…",
    watchingVideoSub:
      "Gemini elabora l'intero video, quindi potrebbe volerci un po'.",
    unexpectedError: "Errore imprevisto",
    failedToStart: "Avvio non riuscito",
    tryAgain: "Riprova",
    summarizedJustNow: "Riassunto proprio ora",
    searchPlaceholder: "Cerca titoli e riepiloghi…",
    untitledVideo: "Video senza titolo",
    unknownDate: "data sconosciuta",
    noMatches: "Nessun risultato per questa ricerca.",
    noSummariesYet:
      "Ancora nessun riepilogo. Riassumi un video e apparirà qui.",
    openOnYoutube: "Apri su YouTube",
    delete: "Elimina",
    deleteConfirm: "Fai di nuovo clic per eliminare",
    cachedUnknownTime: "Messo in cache in un momento sconosciuto",
    justNow: "proprio ora",
    minutesAgo: "{n} min fa",
    hoursAgo: "{n} h fa",
    daysAgo: "{n} g fa",
    closeModal: "Chiudi",
    notAYoutubeVideo: "Non è un video di YouTube",
    notAYoutubeVideoDetail:
      "Impossibile stabilire a quale video appartenesse quel menu.",
    extensionUnavailable: "Estensione non disponibile",
    extensionUnavailableDetail:
      "L'estensione è stata ricaricata o aggiornata. Aggiorna questa pagina e riprova.",
    invalidApiKeyTitle: "Chiave API non valida",
    invalidApiKeyDetail:
      "Controlla la chiave nelle impostazioni, poi salvala di nuovo.",
    unsupportedVideoTitle: "Gemini non è riuscito a leggere questo video",
    unsupportedVideoDetail:
      "I video privati, non in elenco, con restrizioni di età, bloccati per area geografica e riservati ai membri non sono supportati: solo quelli pubblici.",
    requestRejectedTitle: "Richiesta rifiutata dall'API",
    requestRejectedFallback:
      "L'API ha restituito un errore 400 senza dettagli.",
    apiNotEnabledTitle: "API non abilitata per questa chiave",
    apiKeyRejectedTitle: "Chiave API rifiutata",
    apiKeyRejectedFallback:
      "La chiave è stata rifiutata. Verifica che sia una chiave API Gemini di Google AI Studio.",
    modelNotFoundTitle: "Modello non trovato",
    modelNotFoundDetail:
      '"{model}" è stato rifiutato perché sconosciuto. Il modello potrebbe essere stato rinominato o ritirato.',
    rateLimitTitle: "Limite di frequenza o quota superati",
    rateLimitDetail:
      "Il livello gratuito limita l'input video di YouTube a 8 ore al giorno. Attendi e riprova, oppure controlla la tua quota su Google AI Studio.",
    serverErrorTitle: "Si è verificato un problema con l'API di Google",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Di solito è temporaneo: riprova.",
    requestFailedTitle: "Richiesta non riuscita (HTTP {status})",
    requestFailedFallback: "Nessun dettaglio restituito.",
    timedOutTitle: "Tempo scaduto",
    timedOutDetail:
      "Nessuna risposta dopo {seconds}s. I video lunghi possono superare questo limite: prova con uno più breve o riprova.",
    connectionLostTitle: "Connessione persa",
    connectionLostDetail: "Il riepilogo si è interrotto a metà. ({message})",
    networkErrorTitle: "Errore di rete",
    networkErrorDetail:
      "Impossibile raggiungere l'API di Google. Controlla la tua connessione. ({message})",
    blockSafety:
      "La risposta è stata bloccata dai filtri di sicurezza di Gemini.",
    blockRecitation:
      "La risposta è stata bloccata perché riproduceva contenuti protetti.",
    blockProhibited:
      "La risposta è stata bloccata in quanto contenuto vietato.",
    blockBlocklist:
      "La risposta è stata bloccata da un elenco di termini vietati.",
    blockMaxTokens:
      "La risposta ha raggiunto il limite di token in output prima di terminare.",
    requestBlockedTitle: "Richiesta bloccata",
    blockedGeneric: "Bloccato: {reason}",
    noSummaryTitle: "Nessun riepilogo restituito",
    noSummaryGeneric: "Il modello non ha restituito testo{suffix}.",
    unreadableResponseTitle: "Risposta illeggibile",
    unreadableResponseDetail: "L'API non ha restituito un corpo leggibile.",
  },

  pt: {
    settings: "Configurações",
    history: "Histórico",
    summaryViewTitle: "Resumo",
    back: "Voltar",
    apiKeyLabel: "Chave de API do Gemini",
    apiKeyHint:
      "Armazenada apenas neste navegador e enviada somente à API do Google. Obtenha uma em",
    show: "Mostrar",
    hide: "Ocultar",
    saveKey: "Salvar chave",
    clear: "Limpar",
    enterKeyFirst: "Insira uma chave primeiro.",
    keySaved: "Chave salva.",
    keyCleared: "Chave removida.",
    summaryLanguage: "Idioma",
    autoDetected: "Automático (detectado: {lang})",
    languageHint:
      "Aplica-se a novos resumos. Os resumos em cache mantêm o idioma em que foram criados.",
    languageSaved: "Idioma salvo.",
    viewHistory: "Ver histórico",
    clearCachedSummaries: "Limpar resumos em cache",
    cacheCleared: "Resumos em cache removidos.",
    checkingTab: "Verificando a aba atual…",
    noVideoTitle: "Nenhum vídeo do YouTube aqui",
    noVideoNotice:
      "Abra um vídeo do YouTube (youtube.com/watch, /shorts ou youtu.be) e clique no ícone novamente.",
    youtubeVideoFallback: "Vídeo do YouTube",
    addApiKeyNotice: "Adicione sua chave de API do Gemini para começar.",
    addApiKeyToSummarize: "Adicione sua chave de API para resumir.",
    noApiKeyTitle: "Nenhuma chave de API definida",
    noApiKeyDetailPopup:
      "Adicione sua chave de API do Gemini nas configurações (ícone de engrenagem, no canto superior direito) e tente novamente.",
    noApiKeyDetailInPage:
      "Clique no ícone do YouTube Quick Summary na barra de ferramentas, abra as configurações (ícone de engrenagem) e adicione sua chave de API do Gemini.",
    summarize: "Resumir",
    summarizing: "Resumindo…",
    cachedRelative: "Em cache {time}",
    resummarize: "Resumir novamente",
    watchingVideo: "Assistindo ao vídeo…",
    watchingVideoSub:
      "O Gemini processa o vídeo inteiro, então isso pode demorar um pouco.",
    unexpectedError: "Erro inesperado",
    failedToStart: "Falha ao iniciar",
    tryAgain: "Tentar novamente",
    summarizedJustNow: "Resumido agora mesmo",
    searchPlaceholder: "Buscar títulos e resumos…",
    untitledVideo: "Vídeo sem título",
    unknownDate: "data desconhecida",
    noMatches: "Nada corresponde a essa busca.",
    noSummariesYet:
      "Ainda não há resumos. Resuma um vídeo e ele aparecerá aqui.",
    openOnYoutube: "Abrir no YouTube",
    delete: "Excluir",
    deleteConfirm: "Clique novamente para excluir",
    cachedUnknownTime: "Em cache em um horário desconhecido",
    justNow: "agora mesmo",
    minutesAgo: "há {n} min",
    hoursAgo: "há {n} h",
    daysAgo: "há {n} d",
    closeModal: "Fechar",
    notAYoutubeVideo: "Não é um vídeo do YouTube",
    notAYoutubeVideoDetail:
      "Não foi possível determinar a qual vídeo esse menu pertence.",
    extensionUnavailable: "Extensão indisponível",
    extensionUnavailableDetail:
      "A extensão foi recarregada ou atualizada. Atualize esta página e tente novamente.",
    invalidApiKeyTitle: "Chave de API inválida",
    invalidApiKeyDetail:
      "Verifique a chave nas configurações e salve-a novamente.",
    unsupportedVideoTitle: "O Gemini não conseguiu ler este vídeo",
    unsupportedVideoDetail:
      "Vídeos privados, não listados, com restrição de idade, bloqueados por região e exclusivos para membros não são compatíveis — apenas vídeos públicos.",
    requestRejectedTitle: "Solicitação rejeitada pela API",
    requestRejectedFallback: "A API retornou 400 sem detalhes.",
    apiNotEnabledTitle: "A API não está habilitada para esta chave",
    apiKeyRejectedTitle: "Chave de API rejeitada",
    apiKeyRejectedFallback:
      "A chave foi recusada. Confirme se é uma chave de API do Gemini do Google AI Studio.",
    modelNotFoundTitle: "Modelo não encontrado",
    modelNotFoundDetail:
      '"{model}" foi rejeitado por ser desconhecido. O modelo pode ter sido renomeado ou descontinuado.',
    rateLimitTitle: "Limite de taxa ou cota excedidos",
    rateLimitDetail:
      "O nível gratuito limita a entrada de vídeo do YouTube a 8 horas por dia. Aguarde e tente novamente, ou verifique sua cota no Google AI Studio.",
    serverErrorTitle: "A API do Google teve um problema",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Isso geralmente é temporário — tente novamente.",
    requestFailedTitle: "Falha na solicitação (HTTP {status})",
    requestFailedFallback: "Nenhum detalhe retornado.",
    timedOutTitle: "Tempo esgotado",
    timedOutDetail:
      "Sem resposta após {seconds}s. Vídeos longos podem exceder esse limite — tente um mais curto ou tente novamente.",
    connectionLostTitle: "Conexão perdida",
    connectionLostDetail: "O resumo parou no meio do caminho. ({message})",
    networkErrorTitle: "Erro de rede",
    networkErrorDetail:
      "Não foi possível acessar a API do Google. Verifique sua conexão. ({message})",
    blockSafety:
      "A resposta foi bloqueada pelos filtros de segurança do Gemini.",
    blockRecitation:
      "A resposta foi bloqueada por reproduzir conteúdo protegido.",
    blockProhibited: "A resposta foi bloqueada por ser conteúdo proibido.",
    blockBlocklist:
      "A resposta foi bloqueada por uma lista de termos proibidos.",
    blockMaxTokens:
      "A resposta atingiu o limite de tokens de saída antes de terminar.",
    requestBlockedTitle: "Solicitação bloqueada",
    blockedGeneric: "Bloqueado: {reason}",
    noSummaryTitle: "Nenhum resumo retornado",
    noSummaryGeneric: "O modelo não retornou texto{suffix}.",
    unreadableResponseTitle: "Resposta ilegível",
    unreadableResponseDetail: "A API não retornou um corpo legível.",
  },

  nl: {
    settings: "Instellingen",
    history: "Geschiedenis",
    summaryViewTitle: "Samenvatting",
    back: "Terug",
    apiKeyLabel: "Gemini API-sleutel",
    apiKeyHint:
      "Wordt alleen lokaal in deze browser opgeslagen en uitsluitend naar Google's API verzonden. Haal er een op",
    show: "Tonen",
    hide: "Verbergen",
    saveKey: "Sleutel opslaan",
    clear: "Wissen",
    enterKeyFirst: "Voer eerst een sleutel in.",
    keySaved: "Sleutel opgeslagen.",
    keyCleared: "Sleutel gewist.",
    summaryLanguage: "Taal",
    autoDetected: "Automatisch (gedetecteerd: {lang})",
    languageHint:
      "Geldt voor nieuwe samenvattingen. Gecachte samenvattingen behouden de taal waarin ze zijn gemaakt.",
    languageSaved: "Taal opgeslagen.",
    viewHistory: "Geschiedenis bekijken",
    clearCachedSummaries: "Gecachte samenvattingen wissen",
    cacheCleared: "Gecachte samenvattingen gewist.",
    checkingTab: "Huidig tabblad wordt gecontroleerd…",
    noVideoTitle: "Geen YouTube-video hier",
    noVideoNotice:
      "Open een YouTube-video (youtube.com/watch, /shorts of youtu.be) en klik opnieuw op het pictogram.",
    youtubeVideoFallback: "YouTube-video",
    addApiKeyNotice: "Voeg je Gemini API-sleutel toe om te beginnen.",
    addApiKeyToSummarize: "Voeg je API-sleutel toe om samen te vatten.",
    noApiKeyTitle: "Geen API-sleutel ingesteld",
    noApiKeyDetailPopup:
      "Voeg je Gemini API-sleutel toe in instellingen (tandwielpictogram, rechtsboven) en probeer het opnieuw.",
    noApiKeyDetailInPage:
      "Klik op het YouTube Quick Summary-pictogram in de werkbalk, open instellingen (tandwielpictogram) en voeg je Gemini API-sleutel toe.",
    summarize: "Samenvatten",
    summarizing: "Bezig met samenvatten…",
    cachedRelative: "Gecachet {time}",
    resummarize: "Opnieuw samenvatten",
    watchingVideo: "Video wordt bekeken…",
    watchingVideoSub: "Gemini verwerkt de hele video, dus dit kan even duren.",
    unexpectedError: "Onverwachte fout",
    failedToStart: "Starten mislukt",
    tryAgain: "Opnieuw proberen",
    summarizedJustNow: "Zojuist samengevat",
    searchPlaceholder: "Titels en samenvattingen zoeken…",
    untitledVideo: "Video zonder titel",
    unknownDate: "onbekende datum",
    noMatches: "Niets komt overeen met die zoekopdracht.",
    noSummariesYet:
      "Nog geen samenvattingen. Vat een video samen en die verschijnt hier.",
    openOnYoutube: "Openen op YouTube",
    delete: "Verwijderen",
    deleteConfirm: "Klik nogmaals om te verwijderen",
    cachedUnknownTime: "Gecachet op een onbekend tijdstip",
    justNow: "zojuist",
    minutesAgo: "{n} min geleden",
    hoursAgo: "{n} u geleden",
    daysAgo: "{n} d geleden",
    closeModal: "Sluiten",
    notAYoutubeVideo: "Geen YouTube-video",
    notAYoutubeVideoDetail: "Kon niet bepalen bij welke video dit menu hoort.",
    extensionUnavailable: "Extensie niet beschikbaar",
    extensionUnavailableDetail:
      "De extensie is opnieuw geladen of bijgewerkt. Vernieuw deze pagina en probeer het opnieuw.",
    invalidApiKeyTitle: "Ongeldige API-sleutel",
    invalidApiKeyDetail:
      "Controleer de sleutel in instellingen en sla deze opnieuw op.",
    unsupportedVideoTitle: "Gemini kon deze video niet lezen",
    unsupportedVideoDetail:
      "Privé-, niet-vermelde, leeftijdsbeperkte, regionaal geblokkeerde en alleen-voor-leden-video's worden niet ondersteund — alleen openbare.",
    requestRejectedTitle: "Verzoek afgewezen door de API",
    requestRejectedFallback: "De API gaf 400 terug zonder details.",
    apiNotEnabledTitle: "API niet ingeschakeld voor deze sleutel",
    apiKeyRejectedTitle: "API-sleutel geweigerd",
    apiKeyRejectedFallback:
      "De sleutel werd geweigerd. Controleer of het een Gemini API-sleutel van Google AI Studio is.",
    modelNotFoundTitle: "Model niet gevonden",
    modelNotFoundDetail:
      '"{model}" werd afgewezen als onbekend. Het model is mogelijk hernoemd of ingetrokken.',
    rateLimitTitle: "Snelheidslimiet of quotum overschreden",
    rateLimitDetail:
      "De gratis laag beperkt YouTube-video-invoer tot 8 uur per dag. Wacht en probeer het opnieuw, of controleer je quotum in Google AI Studio.",
    serverErrorTitle: "Google's API had een probleem",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Dit is meestal tijdelijk — probeer het opnieuw.",
    requestFailedTitle: "Verzoek mislukt (HTTP {status})",
    requestFailedFallback: "Geen details geretourneerd.",
    timedOutTitle: "Time-out",
    timedOutDetail:
      "Geen reactie na {seconds}s. Lange video's kunnen deze limiet overschrijden — probeer een kortere video, of probeer het opnieuw.",
    connectionLostTitle: "Verbinding verbroken",
    connectionLostDetail: "De samenvatting stopte halverwege. ({message})",
    networkErrorTitle: "Netwerkfout",
    networkErrorDetail:
      "Kon Google's API niet bereiken. Controleer je verbinding. ({message})",
    blockSafety:
      "Het antwoord werd geblokkeerd door Gemini's veiligheidsfilters.",
    blockRecitation:
      "Het antwoord werd geblokkeerd omdat het beschermde inhoud reproduceerde.",
    blockProhibited: "Het antwoord werd geblokkeerd als verboden inhoud.",
    blockBlocklist:
      "Het antwoord werd geblokkeerd door een lijst met verboden termen.",
    blockMaxTokens:
      "Het antwoord bereikte de uitvoertokenlimiet voordat het klaar was.",
    requestBlockedTitle: "Verzoek geblokkeerd",
    blockedGeneric: "Geblokkeerd: {reason}",
    noSummaryTitle: "Geen samenvatting geretourneerd",
    noSummaryGeneric: "Het model gaf geen tekst terug{suffix}.",
    unreadableResponseTitle: "Onleesbaar antwoord",
    unreadableResponseDetail: "De API gaf geen leesbare inhoud terug.",
  },

  ru: {
    settings: "Настройки",
    history: "История",
    summaryViewTitle: "Сводка",
    back: "Назад",
    apiKeyLabel: "API-ключ Gemini",
    apiKeyHint:
      "Хранится только в этом браузере и отправляется только в API Google. Получить ключ можно на",
    show: "Показать",
    hide: "Скрыть",
    saveKey: "Сохранить ключ",
    clear: "Очистить",
    enterKeyFirst: "Сначала введите ключ.",
    keySaved: "Ключ сохранён.",
    keyCleared: "Ключ удалён.",
    summaryLanguage: "Язык",
    autoDetected: "Авто (определён: {lang})",
    languageHint:
      "Применяется к новым сводкам. Кэшированные сохраняют язык, на котором были созданы.",
    languageSaved: "Язык сохранён.",
    viewHistory: "Просмотреть историю",
    clearCachedSummaries: "Очистить кэшированные сводки",
    cacheCleared: "Кэшированные сводки очищены.",
    checkingTab: "Проверка текущей вкладки…",
    noVideoTitle: "Здесь нет видео YouTube",
    noVideoNotice:
      "Откройте видео YouTube (youtube.com/watch, /shorts или youtu.be) и снова нажмите на значок.",
    youtubeVideoFallback: "Видео YouTube",
    addApiKeyNotice: "Добавьте API-ключ Gemini, чтобы начать.",
    addApiKeyToSummarize: "Добавьте API-ключ, чтобы создать сводку.",
    noApiKeyTitle: "API-ключ не задан",
    noApiKeyDetailPopup:
      "Добавьте API-ключ Gemini в настройках (значок шестерёнки вверху справа) и попробуйте снова.",
    noApiKeyDetailInPage:
      "Нажмите на значок YouTube Quick Summary на панели инструментов, откройте настройки (значок шестерёнки) и добавьте API-ключ Gemini.",
    summarize: "Создать сводку",
    summarizing: "Создание сводки…",
    cachedRelative: "В кэше {time}",
    resummarize: "Пересоздать сводку",
    watchingVideo: "Просмотр видео…",
    watchingVideoSub:
      "Gemini обрабатывает всё видео целиком, поэтому это может занять некоторое время.",
    unexpectedError: "Непредвиденная ошибка",
    failedToStart: "Не удалось запустить",
    tryAgain: "Повторить",
    summarizedJustNow: "Сводка создана только что",
    searchPlaceholder: "Поиск по заголовкам и сводкам…",
    untitledVideo: "Видео без названия",
    unknownDate: "дата неизвестна",
    noMatches: "По этому запросу ничего не найдено.",
    noSummariesYet:
      "Пока нет сводок. Создайте сводку для видео, и оно появится здесь.",
    openOnYoutube: "Открыть на YouTube",
    delete: "Удалить",
    deleteConfirm: "Нажмите ещё раз, чтобы удалить",
    cachedUnknownTime: "Закэшировано в неизвестное время",
    justNow: "только что",
    minutesAgo: "{n} мин назад",
    hoursAgo: "{n} ч назад",
    daysAgo: "{n} дн назад",
    closeModal: "Закрыть",
    notAYoutubeVideo: "Это не видео YouTube",
    notAYoutubeVideoDetail:
      "Не удалось определить, к какому видео относится это меню.",
    extensionUnavailable: "Расширение недоступно",
    extensionUnavailableDetail:
      "Расширение было перезагружено или обновлено. Обновите страницу и попробуйте снова.",
    invalidApiKeyTitle: "Недействительный API-ключ",
    invalidApiKeyDetail: "Проверьте ключ в настройках и сохраните его снова.",
    unsupportedVideoTitle: "Gemini не смог прочитать это видео",
    unsupportedVideoDetail:
      "Приватные, скрытые, видео с возрастным ограничением, заблокированные по региону и доступные только участникам не поддерживаются — только публичные.",
    requestRejectedTitle: "Запрос отклонён API",
    requestRejectedFallback: "API вернул ошибку 400 без подробностей.",
    apiNotEnabledTitle: "API не включён для этого ключа",
    apiKeyRejectedTitle: "API-ключ отклонён",
    apiKeyRejectedFallback:
      "Ключ был отклонён. Убедитесь, что это API-ключ Gemini из Google AI Studio.",
    modelNotFoundTitle: "Модель не найдена",
    modelNotFoundDetail:
      "«{model}» отклонена как неизвестная. Возможно, модель переименована или отключена.",
    rateLimitTitle: "Превышен лимит запросов или квота",
    rateLimitDetail:
      "Бесплатный уровень ограничивает ввод видео YouTube 8 часами в день. Подождите и повторите попытку или проверьте квоту в Google AI Studio.",
    serverErrorTitle: "В API Google произошла проблема",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. Обычно это временно — попробуйте снова.",
    requestFailedTitle: "Запрос не выполнен (HTTP {status})",
    requestFailedFallback: "Подробности не получены.",
    timedOutTitle: "Истекло время ожидания",
    timedOutDetail:
      "Нет ответа после {seconds} с. Длинные видео могут превышать этот лимит — попробуйте более короткое видео или повторите попытку.",
    connectionLostTitle: "Соединение потеряно",
    connectionLostDetail: "Создание сводки прервалось на середине. ({message})",
    networkErrorTitle: "Ошибка сети",
    networkErrorDetail:
      "Не удалось подключиться к API Google. Проверьте подключение. ({message})",
    blockSafety: "Ответ заблокирован фильтрами безопасности Gemini.",
    blockRecitation:
      "Ответ заблокирован из-за воспроизведения защищённого контента.",
    blockProhibited: "Ответ заблокирован как запрещённый контент.",
    blockBlocklist: "Ответ заблокирован списком запрещённых терминов.",
    blockMaxTokens:
      "Ответ достиг лимита выходных токенов, не успев завершиться.",
    requestBlockedTitle: "Запрос заблокирован",
    blockedGeneric: "Заблокировано: {reason}",
    noSummaryTitle: "Сводка не получена",
    noSummaryGeneric: "Модель не вернула текст{suffix}.",
    unreadableResponseTitle: "Нечитаемый ответ",
    unreadableResponseDetail: "API не вернул читаемое тело ответа.",
  },

  ar: {
    settings: "الإعدادات",
    history: "السجلّ",
    summaryViewTitle: "الملخص",
    back: "رجوع",
    apiKeyLabel: "مفتاح واجهة برمجة Gemini",
    apiKeyHint:
      "يُحفظ محليًا في هذا المتصفح فقط ويُرسَل إلى واجهة برمجة تطبيقات Google فقط. احصل على واحد من",
    show: "إظهار",
    hide: "إخفاء",
    saveKey: "حفظ المفتاح",
    clear: "مسح",
    enterKeyFirst: "أدخل مفتاحًا أولًا.",
    keySaved: "تم حفظ المفتاح.",
    keyCleared: "تم مسح المفتاح.",
    summaryLanguage: "اللغة",
    autoDetected: "تلقائي (تم اكتشاف: {lang})",
    languageHint:
      "ينطبق على الملخصات الجديدة. الملخصات المخزّنة مؤقتًا تحتفظ باللغة التي أُنشئت بها.",
    languageSaved: "تم حفظ اللغة.",
    viewHistory: "عرض السجلّ",
    clearCachedSummaries: "مسح الملخصات المخزّنة مؤقتًا",
    cacheCleared: "تم مسح الملخصات المخزّنة مؤقتًا.",
    checkingTab: "جارٍ التحقق من التبويب الحالي…",
    noVideoTitle: "لا يوجد فيديو يوتيوب هنا",
    noVideoNotice:
      "افتح فيديو يوتيوب (youtube.com/watch أو /shorts أو youtu.be) ثم انقر على الأيقونة مرة أخرى.",
    youtubeVideoFallback: "فيديو يوتيوب",
    addApiKeyNotice: "أضف مفتاح واجهة برمجة Gemini للبدء.",
    addApiKeyToSummarize: "أضف مفتاح واجهة برمجة التطبيقات للتلخيص.",
    noApiKeyTitle: "لم يتم تعيين مفتاح واجهة برمجة تطبيقات",
    noApiKeyDetailPopup:
      "أضف مفتاح واجهة برمجة Gemini في الإعدادات (أيقونة الترس، أعلى اليمين)، ثم حاول مرة أخرى.",
    noApiKeyDetailInPage:
      "انقر على أيقونة YouTube Quick Summary في شريط الأدوات، وافتح الإعدادات (أيقونة الترس) وأضف مفتاح واجهة برمجة Gemini.",
    summarize: "تلخيص",
    summarizing: "جارٍ التلخيص…",
    cachedRelative: "تم التخزين المؤقت {time}",
    resummarize: "إعادة التلخيص",
    watchingVideo: "جارٍ مشاهدة الفيديو…",
    watchingVideoSub:
      "يعالج Gemini الفيديو كاملًا، لذا قد يستغرق ذلك بعض الوقت.",
    unexpectedError: "خطأ غير متوقع",
    failedToStart: "فشل البدء",
    tryAgain: "أعد المحاولة",
    summarizedJustNow: "تم التلخيص للتو",
    searchPlaceholder: "ابحث في العناوين والملخصات…",
    untitledVideo: "فيديو بلا عنوان",
    unknownDate: "تاريخ غير معروف",
    noMatches: "لا توجد نتائج مطابقة لهذا البحث.",
    noSummariesYet: "لا توجد ملخصات بعد. لخّص فيديو وسيظهر هنا.",
    openOnYoutube: "افتح على يوتيوب",
    delete: "حذف",
    deleteConfirm: "انقر مرة أخرى للحذف",
    cachedUnknownTime: "تم التخزين المؤقت في وقت غير معروف",
    justNow: "الآن",
    minutesAgo: "قبل {n} د",
    hoursAgo: "قبل {n} س",
    daysAgo: "قبل {n} ي",
    closeModal: "إغلاق",
    notAYoutubeVideo: "ليس فيديو يوتيوب",
    notAYoutubeVideoDetail: "تعذّر تحديد الفيديو الذي تنتمي إليه هذه القائمة.",
    extensionUnavailable: "الإضافة غير متاحة",
    extensionUnavailableDetail:
      "تمت إعادة تحميل الإضافة أو تحديثها. أعد تحميل هذه الصفحة وحاول مرة أخرى.",
    invalidApiKeyTitle: "مفتاح واجهة برمجة تطبيقات غير صالح",
    invalidApiKeyDetail: "تحقق من المفتاح في الإعدادات، ثم احفظه مرة أخرى.",
    unsupportedVideoTitle: "لم يتمكن Gemini من قراءة هذا الفيديو",
    unsupportedVideoDetail:
      "الفيديوهات الخاصة وغير المدرجة والمقيّدة بالعمر والمحظورة إقليميًا والمخصصة للأعضاء فقط غير مدعومة — العامة فقط.",
    requestRejectedTitle: "تم رفض الطلب من واجهة برمجة التطبيقات",
    requestRejectedFallback:
      "أعادت واجهة برمجة التطبيقات الرمز 400 دون تفاصيل.",
    apiNotEnabledTitle: "واجهة برمجة التطبيقات غير مفعّلة لهذا المفتاح",
    apiKeyRejectedTitle: "تم رفض مفتاح واجهة برمجة التطبيقات",
    apiKeyRejectedFallback:
      "تم رفض المفتاح. تأكد من أنه مفتاح واجهة برمجة Gemini من Google AI Studio.",
    modelNotFoundTitle: "النموذج غير موجود",
    modelNotFoundDetail:
      '"{model}" تم رفضه لأنه غير معروف. ربما تمت إعادة تسمية النموذج أو إيقافه.',
    rateLimitTitle: "تم تجاوز حد المعدل أو الحصة",
    rateLimitDetail:
      "تحدّ الفئة المجانية إدخال فيديو يوتيوب بـ 8 ساعات يوميًا. انتظر وأعد المحاولة، أو تحقق من حصتك في Google AI Studio.",
    serverErrorTitle: "واجهة برمجة تطبيقات Google واجهت مشكلة",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. عادةً ما يكون هذا مؤقتًا — حاول مرة أخرى.",
    requestFailedTitle: "فشل الطلب (HTTP {status})",
    requestFailedFallback: "لم يتم إرجاع أي تفاصيل.",
    timedOutTitle: "انتهت المهلة",
    timedOutDetail:
      "لا استجابة بعد {seconds} ثانية. قد تتجاوز الفيديوهات الطويلة هذا الحد — جرّب فيديو أقصر أو أعد المحاولة.",
    connectionLostTitle: "انقطع الاتصال",
    connectionLostDetail: "توقف الملخص في منتصف الطريق. ({message})",
    networkErrorTitle: "خطأ في الشبكة",
    networkErrorDetail:
      "تعذّر الوصول إلى واجهة برمجة تطبيقات Google. تحقق من اتصالك. ({message})",
    blockSafety: "تم حظر الرد بواسطة مرشحات الأمان في Gemini.",
    blockRecitation: "تم حظر الرد لأنه استنسخ محتوى محميًا.",
    blockProhibited: "تم حظر الرد باعتباره محتوى محظورًا.",
    blockBlocklist: "تم حظر الرد بواسطة قائمة مصطلحات محظورة.",
    blockMaxTokens: "بلغ الرد حد الرموز المخرجة قبل أن ينتهي.",
    requestBlockedTitle: "تم حظر الطلب",
    blockedGeneric: "محظور: {reason}",
    noSummaryTitle: "لم يتم إرجاع أي ملخص",
    noSummaryGeneric: "لم يُرجع النموذج أي نص{suffix}.",
    unreadableResponseTitle: "استجابة غير قابلة للقراءة",
    unreadableResponseDetail:
      "لم تُرجع واجهة برمجة التطبيقات محتوى قابلاً للقراءة.",
  },

  hi: {
    settings: "सेटिंग्स",
    history: "इतिहास",
    summaryViewTitle: "सारांश",
    back: "वापस",
    apiKeyLabel: "Gemini API कुंजी",
    apiKeyHint:
      "यह केवल इस ब्राउज़र में सहेजी जाती है और केवल Google के API को भेजी जाती है। एक कुंजी यहाँ प्राप्त करें",
    show: "दिखाएं",
    hide: "छिपाएं",
    saveKey: "कुंजी सहेजें",
    clear: "साफ़ करें",
    enterKeyFirst: "पहले एक कुंजी दर्ज करें।",
    keySaved: "कुंजी सहेजी गई।",
    keyCleared: "कुंजी हटाई गई।",
    summaryLanguage: "भाषा",
    autoDetected: "स्वतः (पहचानी गई: {lang})",
    languageHint:
      "यह नए सारांशों पर लागू होता है। कैश किए गए सारांश उसी भाषा में रहते हैं जिसमें वे बनाए गए थे।",
    languageSaved: "भाषा सहेजी गई।",
    viewHistory: "इतिहास देखें",
    clearCachedSummaries: "कैश किए गए सारांश साफ़ करें",
    cacheCleared: "कैश किए गए सारांश साफ़ कर दिए गए।",
    checkingTab: "मौजूदा टैब जाँचा जा रहा है…",
    noVideoTitle: "यहाँ कोई YouTube वीडियो नहीं है",
    noVideoNotice:
      "एक YouTube वीडियो खोलें (youtube.com/watch, /shorts या youtu.be) और आइकन पर फिर से क्लिक करें।",
    youtubeVideoFallback: "YouTube वीडियो",
    addApiKeyNotice: "शुरू करने के लिए अपनी Gemini API कुंजी जोड़ें।",
    addApiKeyToSummarize: "सारांश बनाने के लिए अपनी API कुंजी जोड़ें।",
    noApiKeyTitle: "कोई API कुंजी सेट नहीं है",
    noApiKeyDetailPopup:
      "सेटिंग्स में (ऊपर दाईं ओर गियर आइकन) अपनी Gemini API कुंजी जोड़ें, फिर पुनः प्रयास करें।",
    noApiKeyDetailInPage:
      "टूलबार में YouTube Quick Summary आइकन पर क्लिक करें, सेटिंग्स (गियर आइकन) खोलें और अपनी Gemini API कुंजी जोड़ें।",
    summarize: "सारांश बनाएं",
    summarizing: "सारांश बनाया जा रहा है…",
    cachedRelative: "कैश किया गया {time}",
    resummarize: "फिर से सारांश बनाएं",
    watchingVideo: "वीडियो देखा जा रहा है…",
    watchingVideoSub:
      "Gemini पूरे वीडियो को प्रोसेस करता है, इसलिए इसमें कुछ समय लग सकता है।",
    unexpectedError: "अप्रत्याशित त्रुटि",
    failedToStart: "शुरू करने में विफल",
    tryAgain: "पुनः प्रयास करें",
    summarizedJustNow: "अभी-अभी सारांशित किया गया",
    searchPlaceholder: "शीर्षक और सारांश खोजें…",
    untitledVideo: "शीर्षक रहित वीडियो",
    unknownDate: "अज्ञात तिथि",
    noMatches: "इस खोज से कुछ भी मेल नहीं खाता।",
    noSummariesYet:
      "अभी तक कोई सारांश नहीं है। किसी वीडियो का सारांश बनाएं और यह यहाँ दिखाई देगा।",
    openOnYoutube: "YouTube पर खोलें",
    delete: "हटाएं",
    deleteConfirm: "हटाने के लिए फिर से क्लिक करें",
    cachedUnknownTime: "अज्ञात समय पर कैश किया गया",
    justNow: "अभी-अभी",
    minutesAgo: "{n} मि पहले",
    hoursAgo: "{n} घं पहले",
    daysAgo: "{n} दि पहले",
    closeModal: "बंद करें",
    notAYoutubeVideo: "यह YouTube वीडियो नहीं है",
    notAYoutubeVideoDetail:
      "यह पता नहीं चल सका कि यह मेनू किस वीडियो से संबंधित है।",
    extensionUnavailable: "एक्सटेंशन उपलब्ध नहीं है",
    extensionUnavailableDetail:
      "एक्सटेंशन को रीलोड या अपडेट किया गया था। इस पेज को रीफ्रेश करें और फिर से प्रयास करें।",
    invalidApiKeyTitle: "अमान्य API कुंजी",
    invalidApiKeyDetail: "सेटिंग्स में कुंजी जाँचें, फिर उसे फिर से सहेजें।",
    unsupportedVideoTitle: "Gemini इस वीडियो को पढ़ नहीं सका",
    unsupportedVideoDetail:
      "निजी, असूचीबद्ध, आयु-प्रतिबंधित, क्षेत्र-अवरुद्ध और केवल-सदस्यों के लिए वीडियो समर्थित नहीं हैं — केवल सार्वजनिक वीडियो।",
    requestRejectedTitle: "API द्वारा अनुरोध अस्वीकृत",
    requestRejectedFallback: "API ने बिना किसी विवरण के 400 लौटाया।",
    apiNotEnabledTitle: "इस कुंजी के लिए API सक्षम नहीं है",
    apiKeyRejectedTitle: "API कुंजी अस्वीकृत",
    apiKeyRejectedFallback:
      "कुंजी अस्वीकृत कर दी गई। पुष्टि करें कि यह Google AI Studio की Gemini API कुंजी है।",
    modelNotFoundTitle: "मॉडल नहीं मिला",
    modelNotFoundDetail:
      '"{model}" को अज्ञात मानकर अस्वीकृत कर दिया गया। हो सकता है मॉडल का नाम बदल दिया गया हो या इसे हटा दिया गया हो।',
    rateLimitTitle: "दर सीमा या कोटा पार हो गया",
    rateLimitDetail:
      "मुफ़्त स्तर YouTube वीडियो इनपुट को प्रतिदिन 8 घंटे तक सीमित करता है। प्रतीक्षा करें और पुनः प्रयास करें, या Google AI Studio में अपना कोटा जाँचें।",
    serverErrorTitle: "Google के API में समस्या हुई",
    serverErrorDetail:
      "HTTP {status}{reasonPart}। यह आमतौर पर अस्थायी होता है — फिर से प्रयास करें।",
    requestFailedTitle: "अनुरोध विफल (HTTP {status})",
    requestFailedFallback: "कोई विवरण नहीं लौटाया गया।",
    timedOutTitle: "समय समाप्त",
    timedOutDetail:
      "{seconds} सेकंड के बाद कोई प्रतिक्रिया नहीं। लंबे वीडियो इस सीमा को पार कर सकते हैं — छोटा वीडियो आज़माएं, या पुनः प्रयास करें।",
    connectionLostTitle: "कनेक्शन खो गया",
    connectionLostDetail: "सारांश बीच में ही रुक गया। ({message})",
    networkErrorTitle: "नेटवर्क त्रुटि",
    networkErrorDetail:
      "Google के API तक नहीं पहुँच सका। अपना कनेक्शन जाँचें। ({message})",
    blockSafety:
      "Gemini के सुरक्षा फ़िल्टर द्वारा प्रतिक्रिया अवरुद्ध कर दी गई।",
    blockRecitation:
      "संरक्षित सामग्री को पुनः प्रस्तुत करने के कारण प्रतिक्रिया अवरुद्ध कर दी गई।",
    blockProhibited:
      "प्रतिबंधित सामग्री होने के कारण प्रतिक्रिया अवरुद्ध कर दी गई।",
    blockBlocklist: "शब्द ब्लॉकलिस्ट द्वारा प्रतिक्रिया अवरुद्ध कर दी गई।",
    blockMaxTokens:
      "समाप्त होने से पहले प्रतिक्रिया आउटपुट टोकन सीमा तक पहुँच गई।",
    requestBlockedTitle: "अनुरोध अवरुद्ध",
    blockedGeneric: "अवरुद्ध: {reason}",
    noSummaryTitle: "कोई सारांश नहीं लौटाया गया",
    noSummaryGeneric: "मॉडल ने कोई टेक्स्ट नहीं लौटाया{suffix}।",
    unreadableResponseTitle: "अपठनीय प्रतिक्रिया",
    unreadableResponseDetail: "API ने पठनीय भाग नहीं लौटाया।",
  },

  ja: {
    settings: "設定",
    history: "履歴",
    summaryViewTitle: "要約",
    back: "戻る",
    apiKeyLabel: "Gemini APIキー",
    apiKeyHint:
      "このブラウザにのみ保存され、Google のAPIにのみ送信されます。取得先:",
    show: "表示",
    hide: "非表示",
    saveKey: "キーを保存",
    clear: "消去",
    enterKeyFirst: "先にキーを入力してください。",
    keySaved: "キーを保存しました。",
    keyCleared: "キーを消去しました。",
    summaryLanguage: "言語",
    autoDetected: "自動（検出された言語: {lang}）",
    languageHint:
      "新しい要約に適用されます。キャッシュ済みの要約は作成時の言語のままです。",
    languageSaved: "言語を保存しました。",
    viewHistory: "履歴を表示",
    clearCachedSummaries: "キャッシュ済みの要約を消去",
    cacheCleared: "キャッシュ済みの要約を消去しました。",
    checkingTab: "現在のタブを確認しています…",
    noVideoTitle: "YouTube動画がありません",
    noVideoNotice:
      "YouTube動画（youtube.com/watch、/shorts、youtu.be）を開いてから、アイコンをもう一度クリックしてください。",
    youtubeVideoFallback: "YouTube動画",
    addApiKeyNotice: "開始するには、Gemini APIキーを追加してください。",
    addApiKeyToSummarize: "要約するにはAPIキーを追加してください。",
    noApiKeyTitle: "APIキーが設定されていません",
    noApiKeyDetailPopup:
      "設定（右上の歯車アイコン）でGemini APIキーを追加し、もう一度お試しください。",
    noApiKeyDetailInPage:
      "ツールバーのYouTube Quick Summaryアイコンをクリックし、設定（歯車アイコン）を開いてGemini APIキーを追加してください。",
    summarize: "要約する",
    summarizing: "要約中…",
    cachedRelative: "{time}にキャッシュ済み",
    resummarize: "再要約",
    watchingVideo: "動画を視聴中…",
    watchingVideoSub:
      "Geminiは動画全体を処理するため、しばらく時間がかかることがあります。",
    unexpectedError: "予期しないエラー",
    failedToStart: "起動に失敗しました",
    tryAgain: "再試行",
    summarizedJustNow: "たった今要約しました",
    searchPlaceholder: "タイトルと要約を検索…",
    untitledVideo: "タイトルなしの動画",
    unknownDate: "日付不明",
    noMatches: "この検索に一致するものはありません。",
    noSummariesYet:
      "まだ要約がありません。動画を要約するとここに表示されます。",
    openOnYoutube: "YouTubeで開く",
    delete: "削除",
    deleteConfirm: "もう一度クリックすると削除されます",
    cachedUnknownTime: "不明な時刻にキャッシュされました",
    justNow: "たった今",
    minutesAgo: "{n}分前",
    hoursAgo: "{n}時間前",
    daysAgo: "{n}日前",
    closeModal: "閉じる",
    notAYoutubeVideo: "YouTube動画ではありません",
    notAYoutubeVideoDetail:
      "このメニューがどの動画に属するか特定できませんでした。",
    extensionUnavailable: "拡張機能を利用できません",
    extensionUnavailableDetail:
      "拡張機能が再読み込みまたは更新されました。このページを更新してもう一度お試しください。",
    invalidApiKeyTitle: "無効なAPIキー",
    invalidApiKeyDetail: "設定でキーを確認し、もう一度保存してください。",
    unsupportedVideoTitle: "Geminiはこの動画を読み取れませんでした",
    unsupportedVideoDetail:
      "非公開、限定公開、年齢制限あり、地域制限あり、メンバー限定の動画はサポートされていません。公開されている動画のみ対応しています。",
    requestRejectedTitle: "APIにリクエストを拒否されました",
    requestRejectedFallback: "APIは詳細なしで400を返しました。",
    apiNotEnabledTitle: "このキーではAPIが有効になっていません",
    apiKeyRejectedTitle: "APIキーが拒否されました",
    apiKeyRejectedFallback:
      "キーが拒否されました。Google AI StudioのGemini APIキーであることを確認してください。",
    modelNotFoundTitle: "モデルが見つかりません",
    modelNotFoundDetail:
      "「{model}」は不明として拒否されました。モデル名が変更されたか、廃止された可能性があります。",
    rateLimitTitle: "レート制限または割り当てを超過しました",
    rateLimitDetail:
      "無料枠ではYouTube動画の入力は1日8時間までに制限されています。しばらく待って再試行するか、Google AI Studioで割り当てを確認してください。",
    serverErrorTitle: "GoogleのAPIで問題が発生しました",
    serverErrorDetail:
      "HTTP {status}{reasonPart}。通常は一時的な問題です。もう一度お試しください。",
    requestFailedTitle: "リクエストが失敗しました（HTTP {status}）",
    requestFailedFallback: "詳細は返されませんでした。",
    timedOutTitle: "タイムアウトしました",
    timedOutDetail:
      "{seconds}秒経っても応答がありません。長い動画ではこの制限を超えることがあります。短い動画を試すか、再試行してください。",
    connectionLostTitle: "接続が切断されました",
    connectionLostDetail: "要約が途中で停止しました。（{message}）",
    networkErrorTitle: "ネットワークエラー",
    networkErrorDetail:
      "GoogleのAPIに接続できませんでした。接続を確認してください。（{message}）",
    blockSafety: "Geminiの安全フィルターによって応答がブロックされました。",
    blockRecitation:
      "保護されたコンテンツを再現したため応答がブロックされました。",
    blockProhibited: "禁止されたコンテンツとして応答がブロックされました。",
    blockBlocklist: "用語ブロックリストによって応答がブロックされました。",
    blockMaxTokens: "応答は完了する前に出力トークンの上限に達しました。",
    requestBlockedTitle: "リクエストがブロックされました",
    blockedGeneric: "ブロック: {reason}",
    noSummaryTitle: "要約が返されませんでした",
    noSummaryGeneric: "モデルはテキストを返しませんでした{suffix}。",
    unreadableResponseTitle: "読み取れない応答",
    unreadableResponseDetail: "APIは読み取り可能な本文を返しませんでした。",
  },

  ko: {
    settings: "설정",
    history: "기록",
    summaryViewTitle: "요약",
    back: "뒤로",
    apiKeyLabel: "Gemini API 키",
    apiKeyHint:
      "이 브라우저에만 저장되며 Google API로만 전송됩니다. 여기서 발급받으세요:",
    show: "표시",
    hide: "숨기기",
    saveKey: "키 저장",
    clear: "지우기",
    enterKeyFirst: "먼저 키를 입력하세요.",
    keySaved: "키가 저장되었습니다.",
    keyCleared: "키가 삭제되었습니다.",
    summaryLanguage: "언어",
    autoDetected: "자동 (감지됨: {lang})",
    languageHint:
      "새 요약에 적용됩니다. 캐시된 요약은 생성 당시의 언어를 유지합니다.",
    languageSaved: "언어가 저장되었습니다.",
    viewHistory: "기록 보기",
    clearCachedSummaries: "캐시된 요약 지우기",
    cacheCleared: "캐시된 요약을 지웠습니다.",
    checkingTab: "현재 탭 확인 중…",
    noVideoTitle: "여기에는 YouTube 동영상이 없습니다",
    noVideoNotice:
      "YouTube 동영상(youtube.com/watch, /shorts 또는 youtu.be)을 열고 아이콘을 다시 클릭하세요.",
    youtubeVideoFallback: "YouTube 동영상",
    addApiKeyNotice: "시작하려면 Gemini API 키를 추가하세요.",
    addApiKeyToSummarize: "요약하려면 API 키를 추가하세요.",
    noApiKeyTitle: "API 키가 설정되지 않았습니다",
    noApiKeyDetailPopup:
      "설정(오른쪽 상단 톱니바퀴 아이콘)에서 Gemini API 키를 추가한 후 다시 시도하세요.",
    noApiKeyDetailInPage:
      "툴바의 YouTube Quick Summary 아이콘을 클릭하고 설정(톱니바퀴 아이콘)을 연 다음 Gemini API 키를 추가하세요.",
    summarize: "요약",
    summarizing: "요약 중…",
    cachedRelative: "{time} 캐시됨",
    resummarize: "다시 요약",
    watchingVideo: "동영상 보는 중…",
    watchingVideoSub:
      "Gemini가 전체 동영상을 처리하므로 시간이 다소 걸릴 수 있습니다.",
    unexpectedError: "예기치 않은 오류",
    failedToStart: "시작하지 못했습니다",
    tryAgain: "다시 시도",
    summarizedJustNow: "방금 요약됨",
    searchPlaceholder: "제목 및 요약 검색…",
    untitledVideo: "제목 없는 동영상",
    unknownDate: "알 수 없는 날짜",
    noMatches: "검색과 일치하는 항목이 없습니다.",
    noSummariesYet:
      "아직 요약이 없습니다. 동영상을 요약하면 여기에 표시됩니다.",
    openOnYoutube: "YouTube에서 열기",
    delete: "삭제",
    deleteConfirm: "삭제하려면 다시 클릭하세요",
    cachedUnknownTime: "알 수 없는 시간에 캐시됨",
    justNow: "방금 전",
    minutesAgo: "{n}분 전",
    hoursAgo: "{n}시간 전",
    daysAgo: "{n}일 전",
    closeModal: "닫기",
    notAYoutubeVideo: "YouTube 동영상이 아닙니다",
    notAYoutubeVideoDetail:
      "이 메뉴가 어느 동영상에 속하는지 확인할 수 없습니다.",
    extensionUnavailable: "확장 프로그램을 사용할 수 없습니다",
    extensionUnavailableDetail:
      "확장 프로그램이 다시 로드되었거나 업데이트되었습니다. 이 페이지를 새로고침한 후 다시 시도하세요.",
    invalidApiKeyTitle: "잘못된 API 키",
    invalidApiKeyDetail: "설정에서 키를 확인한 후 다시 저장하세요.",
    unsupportedVideoTitle: "Gemini가 이 동영상을 읽을 수 없습니다",
    unsupportedVideoDetail:
      "비공개, 목록에 없음, 연령 제한, 지역 차단, 회원 전용 동영상은 지원되지 않습니다. 공개 동영상만 지원됩니다.",
    requestRejectedTitle: "API가 요청을 거부했습니다",
    requestRejectedFallback: "API가 세부 정보 없이 400을 반환했습니다.",
    apiNotEnabledTitle: "이 키에 대해 API가 활성화되지 않았습니다",
    apiKeyRejectedTitle: "API 키가 거부되었습니다",
    apiKeyRejectedFallback:
      "키가 거부되었습니다. Google AI Studio의 Gemini API 키인지 확인하세요.",
    modelNotFoundTitle: "모델을 찾을 수 없습니다",
    modelNotFoundDetail:
      '"{model}"이(가) 알 수 없는 모델로 거부되었습니다. 모델 이름이 변경되었거나 지원이 종료되었을 수 있습니다.',
    rateLimitTitle: "속도 제한 또는 할당량 초과",
    rateLimitDetail:
      "무료 등급은 YouTube 동영상 입력을 하루 8시간으로 제한합니다. 기다렸다가 다시 시도하거나 Google AI Studio에서 할당량을 확인하세요.",
    serverErrorTitle: "Google API에 문제가 발생했습니다",
    serverErrorDetail:
      "HTTP {status}{reasonPart}. 일반적으로 일시적인 문제입니다. 다시 시도하세요.",
    requestFailedTitle: "요청 실패 (HTTP {status})",
    requestFailedFallback: "반환된 세부 정보가 없습니다.",
    timedOutTitle: "시간 초과",
    timedOutDetail:
      "{seconds}초 후에도 응답이 없습니다. 긴 동영상은 이 한도를 초과할 수 있습니다. 더 짧은 동영상을 시도하거나 다시 시도하세요.",
    connectionLostTitle: "연결이 끊겼습니다",
    connectionLostDetail: "요약이 중간에 중단되었습니다. ({message})",
    networkErrorTitle: "네트워크 오류",
    networkErrorDetail:
      "Google API에 연결할 수 없습니다. 연결을 확인하세요. ({message})",
    blockSafety: "Gemini의 안전 필터에 의해 응답이 차단되었습니다.",
    blockRecitation: "보호된 콘텐츠를 재현하여 응답이 차단되었습니다.",
    blockProhibited: "금지된 콘텐츠로 응답이 차단되었습니다.",
    blockBlocklist: "차단 용어 목록에 의해 응답이 차단되었습니다.",
    blockMaxTokens: "응답이 완료되기 전에 출력 토큰 한도에 도달했습니다.",
    requestBlockedTitle: "요청이 차단되었습니다",
    blockedGeneric: "차단됨: {reason}",
    noSummaryTitle: "요약이 반환되지 않았습니다",
    noSummaryGeneric: "모델이 텍스트를 반환하지 않았습니다{suffix}.",
    unreadableResponseTitle: "읽을 수 없는 응답",
    unreadableResponseDetail: "API가 읽을 수 있는 본문을 반환하지 않았습니다.",
  },

  zh: {
    settings: "设置",
    history: "历史记录",
    summaryViewTitle: "摘要",
    back: "返回",
    apiKeyLabel: "Gemini API 密钥",
    apiKeyHint: "仅保存在此浏览器中，且仅发送到 Google 的 API。获取地址：",
    show: "显示",
    hide: "隐藏",
    saveKey: "保存密钥",
    clear: "清除",
    enterKeyFirst: "请先输入密钥。",
    keySaved: "密钥已保存。",
    keyCleared: "密钥已清除。",
    summaryLanguage: "语言",
    autoDetected: "自动（检测到：{lang}）",
    languageHint: "适用于新的摘要。已缓存的摘要将保留创建时所用的语言。",
    languageSaved: "语言已保存。",
    viewHistory: "查看历史记录",
    clearCachedSummaries: "清除缓存的摘要",
    cacheCleared: "缓存的摘要已清除。",
    checkingTab: "正在检查当前标签页…",
    noVideoTitle: "此处没有 YouTube 视频",
    noVideoNotice:
      "打开一个 YouTube 视频（youtube.com/watch、/shorts 或 youtu.be），然后再次点击图标。",
    youtubeVideoFallback: "YouTube 视频",
    addApiKeyNotice: "添加你的 Gemini API 密钥以开始使用。",
    addApiKeyToSummarize: "添加你的 API 密钥以生成摘要。",
    noApiKeyTitle: "尚未设置 API 密钥",
    noApiKeyDetailPopup:
      "在设置中（右上角齿轮图标）添加你的 Gemini API 密钥，然后重试。",
    noApiKeyDetailInPage:
      "点击工具栏中的 YouTube Quick Summary 图标，打开设置（齿轮图标），添加你的 Gemini API 密钥。",
    summarize: "生成摘要",
    summarizing: "正在生成摘要…",
    cachedRelative: "已缓存于{time}",
    resummarize: "重新生成摘要",
    watchingVideo: "正在观看视频…",
    watchingVideoSub: "Gemini 会处理整个视频，因此可能需要一些时间。",
    unexpectedError: "意外错误",
    failedToStart: "启动失败",
    tryAgain: "重试",
    summarizedJustNow: "刚刚生成摘要",
    searchPlaceholder: "搜索标题和摘要…",
    untitledVideo: "无标题视频",
    unknownDate: "日期未知",
    noMatches: "没有与该搜索匹配的内容。",
    noSummariesYet: "还没有摘要。为视频生成摘要后会显示在这里。",
    openOnYoutube: "在 YouTube 中打开",
    delete: "删除",
    deleteConfirm: "再次点击以删除",
    cachedUnknownTime: "缓存时间未知",
    justNow: "刚刚",
    minutesAgo: "{n} 分钟前",
    hoursAgo: "{n} 小时前",
    daysAgo: "{n} 天前",
    closeModal: "关闭",
    notAYoutubeVideo: "不是 YouTube 视频",
    notAYoutubeVideoDetail: "无法确定该菜单属于哪个视频。",
    extensionUnavailable: "扩展程序不可用",
    extensionUnavailableDetail:
      "扩展程序已重新加载或更新。请刷新此页面并重试。",
    invalidApiKeyTitle: "API 密钥无效",
    invalidApiKeyDetail: "请在设置中检查密钥，然后重新保存。",
    unsupportedVideoTitle: "Gemini 无法读取此视频",
    unsupportedVideoDetail:
      "不支持私享、未列出、有年龄限制、区域受限以及仅限会员观看的视频——仅支持公开视频。",
    requestRejectedTitle: "请求被 API 拒绝",
    requestRejectedFallback: "API 返回了 400 错误，但未提供详细信息。",
    apiNotEnabledTitle: "此密钥未启用该 API",
    apiKeyRejectedTitle: "API 密钥被拒绝",
    apiKeyRejectedFallback:
      "密钥被拒绝。请确认这是来自 Google AI Studio 的 Gemini API 密钥。",
    modelNotFoundTitle: "未找到模型",
    modelNotFoundDetail:
      '"{model}" 因未知而被拒绝。该模型可能已被重命名或停用。',
    rateLimitTitle: "已超出速率限制或配额",
    rateLimitDetail:
      "免费套餐将 YouTube 视频输入限制为每天 8 小时。请稍后重试，或在 Google AI Studio 中查看你的配额。",
    serverErrorTitle: "Google 的 API 出现问题",
    serverErrorDetail:
      "HTTP {status}{reasonPart}。这通常是暂时性问题——请重试。",
    requestFailedTitle: "请求失败（HTTP {status}）",
    requestFailedFallback: "未返回详细信息。",
    timedOutTitle: "已超时",
    timedOutDetail:
      "{seconds} 秒后仍无响应。较长的视频可能会超出此限制——请尝试较短的视频，或重试。",
    connectionLostTitle: "连接已断开",
    connectionLostDetail: "摘要生成中途停止。({message})",
    networkErrorTitle: "网络错误",
    networkErrorDetail:
      "无法连接到 Google 的 API。请检查你的网络连接。({message})",
    blockSafety: "该回复已被 Gemini 的安全过滤器屏蔽。",
    blockRecitation: "该回复因复现受保护内容而被屏蔽。",
    blockProhibited: "该回复因属于禁止内容而被屏蔽。",
    blockBlocklist: "该回复已被术语屏蔽列表屏蔽。",
    blockMaxTokens: "该回复在完成前已达到输出令牌上限。",
    requestBlockedTitle: "请求已被屏蔽",
    blockedGeneric: "已屏蔽：{reason}",
    noSummaryTitle: "未返回摘要",
    noSummaryGeneric: "模型未返回任何文本{suffix}。",
    unreadableResponseTitle: "响应无法读取",
    unreadableResponseDetail: "API 未返回可读取的内容。",
  },
};

/* Looks up STRINGS[lang][key], falling back to STRINGS.en for a language
 * that's missing entirely or missing just that key (see the big comment
 * above STRINGS) — never a raw key or an exception. `vars` does simple
 * {token} substitution; values are inserted as-is, not re-escaped, since
 * everything lands via textContent/data-i18n, never innerHTML. */
function t(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let str = table[key];
  if (str === undefined) str = STRINGS.en[key];
  if (str === undefined) return key;

  if (vars) {
    for (const k in vars) {
      str = str.split(`{${k}}`).join(vars[k]);
    }
  }
  return str;
}
