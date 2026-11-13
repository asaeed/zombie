import {writeFileSync} from 'node:fs';
const {POSTHOG_PROJECT_TOKEN: token, POSTHOG_HOST: apiHost, POSTHOG_ASSET_HOST: assetHost} = process.env;
if (!token || !apiHost || !assetHost) throw new Error('Set POSTHOG_PROJECT_TOKEN, POSTHOG_HOST and POSTHOG_ASSET_HOST');
for (const value of [apiHost, assetHost]) {
  if (new URL(value).protocol !== 'https:') throw new Error('Analytics hosts must use HTTPS');
}
writeFileSync(new URL('../analytics-config.json', import.meta.url), JSON.stringify({token, apiHost, assetHost}));
