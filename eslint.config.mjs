import js from "@eslint/js";
import globals from "globals";

// Project-defined globals shared across non-module browser scripts
const projectGlobals = {
  // CDN libraries
  L: 'readonly', supabase: 'readonly', Html5Qrcode: 'readonly',
  Html5QrcodeScannerState: 'readonly', BarcodeDetector: 'readonly',
  // config.js
  SUPABASE_ENVS: 'readonly', resolveSupabaseEnv: 'readonly',
  SUPABASE_ENV: 'readonly', SUPABASE_URL: 'readonly', SUPABASE_KEY: 'readonly',
  GAME_VERSION: 'readonly', db: 'readonly',
  myPseudo: 'writable', myScore: 'writable', myFoundCount: 'writable',
  gameMap: 'writable', treasures: 'writable', mapMarkers: 'writable',
  proximityR: 'writable', fixedTotal: 'writable', modeMap: 'writable',
  modeCompass: 'writable', activeTab: 'writable', deviceHeading: 'writable',
  sensorHeading: 'writable', headingSource: 'writable',
  headingAutoOffset: 'writable', headingOffsetSampleCount: 'writable',
  compassInterval: 'writable', batterySaverMode: 'writable',
  compassRenderQueued: 'writable', compassLastRenderAt: 'writable',
  compassRawHeading: 'writable', compassLastEventSource: 'writable',
  compassEventCount: 'writable', compassEventRate: 'writable',
  compassLastRateTick: 'writable', compassDebugInterval: 'writable',
  compassLastRawAt: 'writable', orientationListenersAttached: 'writable',
  compassVisualAngle: 'writable', mapVisualAngle: 'writable',
  mapCenter: 'writable', activeQuests: 'writable', gameStart: 'writable',
  gameCode: 'writable', playerLat: 'writable', playerLng: 'writable',
  playerAccuracy: 'writable', gpsCourseHeading: 'writable',
  gpsCourseSpeed: 'writable', gpsCourseLastAt: 'writable',
  gpsCourseLastPoint: 'writable', gpsHistory: 'writable',
  nearestFixed: 'writable', nearestUnique: 'writable',
  FLASH_CAPTURE_M: 'writable', FLASH_HINT_M: 'writable',
  lbInterval: 'writable', geoWatch: 'writable', geoWatchdog: 'writable',
  geoLastFixAt: 'writable', geoLastStartAt: 'writable',
  geoLastErrorCode: 'writable', geoLastErrorAt: 'writable',
  geoPreferHighAccuracy: 'writable', geoNoFixHintTimer: 'writable',
  geoGestureKickBound: 'writable', playerMarker: 'writable',
  accuracyCircle: 'writable', lastHapticZone: 'writable',
  directionLayers: 'writable', compassArrowMode: 'writable',
  mapFollowing: 'writable', lastArrowLat: 'writable', lastArrowLng: 'writable',
  lastArrowHeading: 'writable', ARROW_PALETTE: 'readonly',
  MAX_FIXED_ARROWS: 'readonly', myToken: 'writable',
  activeGameMode: 'writable', revealedFixedClues: 'writable',
  tutorialSeen: 'writable', savedHeadingOffset: 'writable',
  _normHeading: 'readonly', _smoothHeading: 'readonly', _nextVisualAngle: 'readonly',
  // map-init.js
  isIOSDevice: 'readonly', isAndroidDevice: 'readonly',
  updateGpsSettleHint: 'readonly', updateGpsLoadingPanel: 'readonly',
  initMap: 'readonly', applyExploreMapLock: 'readonly',
  getPhotoUrls: 'readonly', escHtml: 'readonly', safeImgUrl: 'readonly',
  jsSingleQuoted: 'readonly', renderMarkers: 'readonly',
  // gps.js
  haversine: 'readonly', destinationPoint: 'readonly', tLabel: 'readonly',
  distLabel: 'readonly', haptic: 'readonly', updateRadar: 'readonly',
  showFlashHint: 'readonly', hideFlashHint: 'readonly',
  captureFixed: 'readonly', captureUnique: 'readonly',
  _onGeoSuccess: 'readonly', _onGeoError: 'readonly',
  requestGpsKick: 'readonly', startGeoWatch: 'readonly', recenterMap: 'readonly',
  bearingTo: 'readonly',
  // compass.js
  _setHeading: 'readonly', _getScreenOrientationAngle: 'readonly',
  _headingFromAlpha: 'readonly', refreshEffectiveHeading: 'readonly',
  applyMapHeadingRotation: 'readonly', scheduleCompassRender: 'readonly',
  startOrientationWatch: 'readonly', _showCompassToast: 'readonly',
  requestCompassPermission: 'readonly', _attachOrientationListeners: 'readonly',
  updateProgressBar: 'readonly', startCompassInterval: 'readonly',
  stopCompassInterval: 'readonly', toggleBatterySaver: 'readonly',
  _clearArrows: 'readonly', _updateRadarBg: 'readonly',
  updateCompassCorner: 'readonly', updateCompass: 'readonly',
  toggleCompassArrows: 'readonly', toggleCompassDebug: 'readonly',
  resetCompassCalibration: 'readonly',
  // auth.js
  bgMap: 'writable', sha256: 'readonly', logoutPlayer: 'readonly',
  initEnvUI: 'readonly', hideLanding: 'readonly',
  startGame: 'readonly', continueAsGuest: 'readonly',
  // game-init.js
  initGame: 'readonly', processCheckin: 'readonly', _doCheckin: 'readonly',
  _lastCheckinId: 'writable', _checkinError: 'readonly', _retryCheckin: 'readonly',
  updateHeader: 'readonly', updateModeUI: 'readonly',
  updateTutorialEntryPoints: 'readonly', setGameMode: 'readonly',
  onHeaderPseudoClick: 'readonly', openQuickTutorial: 'readonly',
  closeQuickTutorial: 'readonly', tutorialEnableGps: 'readonly',
  tutorialEnableCompass: 'readonly', maybeOpenQuickTutorial: 'readonly',
  loadTreasures: 'readonly', showFlashTakenToast: 'readonly',
  // qr.js
  qrExpectedId: 'writable', qrDecodeLocked: 'writable', qrTorchOn: 'writable',
  html5QrInst: 'writable', _nativeStream: 'writable',
  _nativePollId: 'writable', _nativeRefocusId: 'writable',
  openQRScanner: 'readonly', startLiveQRScan: 'readonly',
  _startNativeScan: 'readonly', _startHtml5Scan: 'readonly',
  stopLiveQRScan: 'readonly', toggleQRTorch: 'readonly',
  _resetQRInput: 'readonly', handleQRPhoto: 'readonly',
  _qrHandleResult: 'readonly', closeQRScanner: 'readonly',
  captureFixedById: 'readonly',
  // find.js
  _processingFind: 'writable', _inFlightCaptures: 'readonly',
  processFindById: 'readonly', _doProcessFind: 'readonly',
  showFoundResult: 'readonly', closeFound: 'readonly',
  openPhotoViewer: 'readonly', closePhotoViewer: 'readonly',
  uiIconSvg: 'readonly', uiIcon: 'readonly', setFoundIcon: 'readonly',
  formatDuration: 'readonly', pseudoGradient: 'readonly',
  // leaderboard.js
  loadLeaderboard: 'readonly', startLbPolling: 'readonly',
  _lbActiveTab: 'writable', switchLbTab: 'readonly',
  // ui.js
  showTab: 'readonly', toggleMoreMenu: 'readonly', _fmtDuration: 'readonly',
  _qcData: 'writable', showQuestComplete: 'readonly', closeQuestComplete: 'readonly',
  shareQuestResult: 'readonly', closeMoreMenu: 'readonly',
  showTabFromMore: 'readonly', showPause: 'readonly', loadCarnet: 'readonly',
  _nearestTreasure: 'writable', updateNearestCard: 'readonly',
  onNearestCardClick: 'readonly', revealFixedClueFromSheet: 'readonly',
  openTreasureSheet: 'readonly', closeTreasureSheet: 'readonly',
  recenterOn: 'readonly', loadBalises: 'readonly', loadMoi: 'readonly',
};

export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    rules: {
      // Non-module project: top-level declarations are intentionally global.
      // sourceType:'script' puts them in global scope so vars:'local' ignores them.
      'no-unused-vars': ['error', { vars: 'local', args: 'after-used' }]
    },
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node, ...projectGlobals }
    }
  }
];
