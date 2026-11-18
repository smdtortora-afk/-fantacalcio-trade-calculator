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
    contentInset: 'automatic',
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
    }
  }
};

export default config;
