export function normalizePhoneNumber(phone: string): string {
  const trimmedPhone = phone.trim()

  if (!trimmedPhone) {
    return ''
  }

  const startedWithPlus = trimmedPhone.startsWith('+')
  const digits = trimmedPhone.replace(/\D/g, '')

  if (!digits) {
    return ''
  }

  if (digits.startsWith('00') && digits.length > 2) {
    return `+${digits.slice(2)}`
  }

  if (/^0\d{9}$/.test(digits)) {
    return `+94${digits.slice(1)}`
  }

  if (/^7\d{8}$/.test(digits)) {
    return `+94${digits}`
  }

  if (/^94\d{9}$/.test(digits)) {
    return `+${digits}`
  }

  if (startedWithPlus) {
    return `+${digits}`
  }

  return digits
}
