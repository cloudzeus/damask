import { getIntegration, isIntegrationConfigured, maskSecret, type CheckResult } from '@/lib/settings'
import { getVivaSettings, isVivaEnvConfigured, type VivaEnvConfig } from '@/lib/viva'
import { SoftoneCard } from './cards/softone-card'
import { MailgunCard } from './cards/mailgun-card'
import { BunnyCard } from './cards/bunny-card'
import { DeepseekCard } from './cards/deepseek-card'
import { ClaudeCard } from './cards/claude-card'
import { GeminiCard } from './cards/gemini-card'
import { GoogleTagsCard } from './cards/google-tags-card'
import { FacebookCard } from './cards/facebook-card'
import { VivaCard, type VivaEnvCardData } from './cards/viva-card'
import { MapsCard } from './cards/maps-card'

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function checkOf(merged: Record<string, unknown>): CheckResult | null {
  const candidate = merged._lastCheck
  if (candidate && typeof candidate === 'object' && 'ok' in candidate && 'message' in candidate && 'at' in candidate) {
    return candidate as CheckResult
  }
  return null
}

function vivaEnvCardData(config: VivaEnvConfig): VivaEnvCardData {
  return {
    values: {
      clientId: str(config.clientId), sourceCode: str(config.sourceCode),
      webhookVerificationKey: str(config.webhookVerificationKey), merchantId: str(config.merchantId),
    },
    maskedClientSecret: maskSecret(config.clientSecret),
    maskedApiKey: maskSecret(config.apiKey),
    configured: isVivaEnvConfigured(config),
    lastCheck: config._lastCheck ?? null,
  }
}

export async function IntegrationsTab() {
  const [softone, mailgun, bunny, deepseek, claude, gemini, gtags, facebook, viva, maps] = await Promise.all([
    getIntegration('softone'),
    getIntegration('mailgun'),
    getIntegration('bunny'),
    getIntegration('deepseek'),
    getIntegration('claude'),
    getIntegration('gemini'),
    getIntegration('gtags'),
    getIntegration('facebook'),
    getVivaSettings(),
    getIntegration('maps'),
  ])

  return (
    <div className="stagger grid grid-cols-1 gap-3 xl:grid-cols-2">
      <SoftoneCard
        initial={{
          serial: str(softone.serial), username: str(softone.username), appId: str(softone.appId),
          company: str(softone.company), branch: str(softone.branch), module: str(softone.module), refid: str(softone.refid),
        }}
        maskedPassword={maskSecret(softone.password)}
        configured={isIntegrationConfigured('softone', softone)}
        lastCheck={checkOf(softone)}
      />
      <MailgunCard
        initial={{
          domain: str(mailgun.domain), region: str(mailgun.region, 'US') || 'US',
          fromEmail: str(mailgun.fromEmail), fromName: str(mailgun.fromName),
        }}
        maskedApiKey={maskSecret(mailgun.apiKey)}
        configured={isIntegrationConfigured('mailgun', mailgun)}
        lastCheck={checkOf(mailgun)}
      />
      <BunnyCard
        initial={{
          storageZone: str(bunny.storageZone),
          storageApi: str(bunny.storageApi, 'https://storage.bunnycdn.com') || 'https://storage.bunnycdn.com',
          s3Endpoint: str(bunny.s3Endpoint), pullZoneUrl: str(bunny.pullZoneUrl),
        }}
        maskedStoragePassword={maskSecret(bunny.storagePassword)}
        configured={isIntegrationConfigured('bunny', bunny)}
        lastCheck={checkOf(bunny)}
      />
      <DeepseekCard
        initial={{
          apiUrl: str(deepseek.apiUrl, 'https://api.deepseek.com/v1/chat/completions') || 'https://api.deepseek.com/v1/chat/completions',
          model: str(deepseek.model, 'deepseek-chat') || 'deepseek-chat',
        }}
        maskedApiKey={maskSecret(deepseek.apiKey)}
        configured={isIntegrationConfigured('deepseek', deepseek)}
        lastCheck={checkOf(deepseek)}
      />
      <ClaudeCard
        initial={{ model: str(claude.model, 'claude-fable-5') || 'claude-fable-5' }}
        maskedApiKey={maskSecret(claude.apiKey)}
        configured={isIntegrationConfigured('claude', claude)}
        lastCheck={checkOf(claude)}
      />
      <GeminiCard
        initial={{
          model: str(gemini.model, 'gemini-2.5-flash') || 'gemini-2.5-flash',
          fallbackModels: str(gemini.fallbackModels, 'gemini-2.5-flash-lite') || 'gemini-2.5-flash-lite',
        }}
        maskedApiKey={maskSecret(gemini.apiKey)}
        configured={isIntegrationConfigured('gemini', gemini)}
        lastCheck={checkOf(gemini)}
      />
      <GoogleTagsCard
        initial={{ gtagId: str(gtags.gtagId), gtmId: str(gtags.gtmId), siteVerification: str(gtags.siteVerification) }}
        configured={isIntegrationConfigured('gtags', gtags)}
      />
      <FacebookCard
        initial={{ pixelId: str(facebook.pixelId), appId: str(facebook.appId) }}
        configured={isIntegrationConfigured('facebook', facebook)}
      />
      <VivaCard
        initialEnvironment={viva.environment}
        bankInstructionsInitial={viva.bankInstructions}
        demo={vivaEnvCardData(viva.demo)}
        production={vivaEnvCardData(viva.production)}
      />
      <MapsCard
        maskedKeys={{
          googleMapsApiKey: maskSecret(maps.googleMapsApiKey),
          maptilerApiKey: maskSecret(maps.maptilerApiKey),
          geocodeApiKey: maskSecret(maps.geocodeApiKey),
          gemiApiKey: maskSecret(maps.gemiApiKey),
        }}
        configured={isIntegrationConfigured('maps', maps)}
        lastCheck={checkOf(maps)}
      />
    </div>
  )
}
