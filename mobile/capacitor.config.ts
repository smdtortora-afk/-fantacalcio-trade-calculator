import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smdtortora.fantascam',
  appName: 'FANTASCAM',
  webDir: 'www',
  backgroundColor: '#090511',
  server: {
    androidScheme: 'https'
  },
  ios: {
    // La shell e' a schermo intero e gestisce le safe area via env(): con
    // 'automatic' la webview rientrerebbe una seconda volta.
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#090511'
  },
  android: {
    backgroundColor: '#090511',
    allowMixedContent: false,
    captureInput: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    // L'app e' sempre scura: icone chiare nella status bar anche quando il
    // telefono e' in tema chiaro (il default segue il sistema).
    SystemBars: {
      style: 'DARK'
    },
    // Lo splash nativo resta finche' l'intro e' pronta a partire: lo nasconde
    // il codice in www/index.html, non il sistema, cosi' non c'e' stacco
    // fra launch screen e primo fotogramma del video.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#090511',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false
    }
  }
};

export default config;
