export interface IntegrationConfig {
  compute: {
    dismissed: boolean;
    provider: 'railway' | 'digitalocean';
    thresholdCpu: number;
    thresholdRam: number;
    cooldownMinutes: number;
  };
  security: {
    dismissed: boolean;
    scanEnabled: boolean;
  };
  intelligence: {
    dismissed: boolean;
    gatewayKey: string;
  };
  observability: {
    dismissed: boolean;
    heliconeKey: string;
    costLimit: number;
    showCounter: boolean;
  };
}

export const DEFAULT_CONFIG: IntegrationConfig = {
  compute: { dismissed: false, provider: 'railway', thresholdCpu: 80, thresholdRam: 85, cooldownMinutes: 60 },
  security: { dismissed: false, scanEnabled: true },
  intelligence: { dismissed: false, gatewayKey: '' },
  observability: { dismissed: false, heliconeKey: '', costLimit: 5.0, showCounter: true },
};
