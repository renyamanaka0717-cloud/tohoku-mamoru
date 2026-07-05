import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.brainbox.app',
  appName: 'BrainBox',
  webDir: 'out',
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
