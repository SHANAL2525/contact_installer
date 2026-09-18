export type ContactValidationResult = {
  isValid: boolean
  message: string | null
}

export function validateContactPhone(
  originalPhone: string,
  normalizedPhone: string,
): ContactValidationResult {
  if (!originalPhone.trim()) {
    return { isValid: false, message: 'Phone number is empty.' }
  }

  if (/[a-z]/i.test(originalPhone)) {
    return { isValid: false, message: 'Phone number contains letters.' }
  }

  const digits = normalizedPhone.replace(/\D/g, '')

  if (digits.length < 8) {
    return { isValid: false, message: 'Phone number is too short.' }
  }

  if (digits.length > 15) {
    return { isValid: false, message: 'Phone number is too long.' }
  }

  if (/^(\d)\1+$/.test(digits)) {
    return { isValid: false, message: 'Phone number is not usable.' }
  }

  return { isValid: true, message: null }
}
