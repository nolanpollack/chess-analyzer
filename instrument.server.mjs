import * as Sentry from '@sentry/tanstackstart-react'

const sentryDsn = import.meta.env?.VITE_SENTRY_DSN ?? process.env.VITE_SENTRY_DSN

if (!sentryDsn) {
  console.warn('VITE_SENTRY_DSN is not defined. Sentry is not running.')
} else {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}
