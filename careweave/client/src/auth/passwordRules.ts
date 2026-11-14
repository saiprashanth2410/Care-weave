export const MIN_PASSWORD = 8

/** Why a new password cannot be used, or '' when it can. */
export function passwordProblem(password: string, confirm: string): string {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password !== confirm) return 'The two passwords do not match.'
  return ''
}
