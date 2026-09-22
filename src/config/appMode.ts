export function isOfficeMode(): boolean {
  return import.meta.env.VITE_APP_MODE === 'office'
}
