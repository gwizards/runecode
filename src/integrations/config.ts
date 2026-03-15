export const INTEGRATIONS = {
  compute: {
    railway: { url: 'https://railway.app?referralCode=RUNECODE', name: 'Railway' },
    digitalocean: { url: 'https://m.do.co/c/RUNECODE', name: 'DigitalOcean', credit: '$200' },
  },
  security: {
    infisical: { url: 'https://infisical.com?ref=runecode', name: 'Infisical' },
  },
  intelligence: {
    gateway: { url: 'https://aimlapi.com?ref=runecode', name: 'AI/ML API' },
  },
  observability: {
    helicone: { url: 'https://helicone.ai?ref=runecode', name: 'Helicone' },
  },
} as const;
