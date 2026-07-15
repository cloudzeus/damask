import { getIntegration, isIntegrationConfigured, maskSecret, type CheckResult } from '@/lib/settings'
import { SoftoneCard } from './cards/softone-card'
import { MailgunCard } from './cards/mailgun-card'
import { BunnyCard } from './cards/bunny-card'
import { DeepseekCard } from './cards/deepseek-card'
import { ClaudeCard } from './cards/claude-card'
import { GoogleTagsCard } from './cards/google-tags-card'
import { FacebookCard } from './cards/facebook-card'

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

export async function IntegrationsTab() {
  const [softone, mailgun, bunny, deepseek, claude, gtags, facebook] = await Promise.all([
    getIntegration('softone'),
    getIntegration('mailgun'),
    getIntegration('bunny'),
    getIntegration('deepseek'),
    getIntegration('claude'),
    getIntegration('gtags'),
    getIntegration('facebook'),
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
      <GoogleTagsCard
        initial={{ gtagId: str(gtags.gtagId), gtmId: str(gtags.gtmId), siteVerification: str(gtags.siteVerification) }}
        configured={isIntegrationConfigured('gtags', gtags)}
      />
      <FacebookCard
        initial={{ pixelId: str(facebook.pixelId), appId: str(facebook.appId) }}
        configured={isIntegrationConfigured('facebook', facebook)}
      />
    </div>
  )
}
