import { SealedProvider } from './sealed-provider'
import { PandaDocProvider } from './pandadoc-provider'
import type { SignatureProvider } from './types'

export * from './types'
export { SealedProvider } from './sealed-provider'
export { PandaDocProvider } from './pandadoc-provider'

const registry: Record<string, () => SignatureProvider> = {
  sealed: () => new SealedProvider(),
  pandadoc: () => new PandaDocProvider(),
}

/**
 * Resolve the active backend.
 *
 * To plug in your own signature application: add a class implementing
 * `SignatureProvider`, register it here, and set SIGNATURE_PROVIDER. Nothing
 * in the recruitment vertical changes.
 */
export function getSignatureProvider(key?: string): SignatureProvider {
  const name = key ?? process.env.SIGNATURE_PROVIDER ?? 'sealed'
  const factory = registry[name]
  if (!factory) {
    throw new Error(
      `unknown signature provider "${name}" (registered: ${Object.keys(registry).join(', ')})`,
    )
  }
  return factory()
}

/** Resolve the provider an existing envelope was created with. */
export async function providerForEnvelope(
  providerKey: string,
): Promise<SignatureProvider> {
  return getSignatureProvider(providerKey)
}
