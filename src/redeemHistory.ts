import { saveMadePhotoIfAbsent } from './photoStore'
import { loadTokens, markInPhoto, rememberOpenedToken } from './wallet'

/** Called only after the reader and SDK validate the secret. It never contacts a node or signs. */
export async function rememberRedeemPhoto(
  address: string, token: string, photo: Blob, width: number, height: number,
): Promise<boolean> {
  const previous = loadTokens().find((x) => x.id === address)
  const keySaved = rememberOpenedToken(address, token)
  if (previous && !keySaved) return false
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 || !photo.size) return false
  // Preserve the first stored PNG for this account, especially an original made on Hide.
  const photoSaved = await saveMadePhotoIfAbsent(address, {
    photo, width, height, amount: previous?.amount ?? 0,
    origin: previous ? previous.origin ?? 'created' : 'opened',
  })
  if (keySaved && photoSaved) markInPhoto(address)
  return keySaved && photoSaved
}
