import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tripflow.app',
  appName: 'TripFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
