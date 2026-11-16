import { applyTheme, getThemePreference } from './theme'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

describe('theme', () => {
  it('defaults to system', () => {
    expect(getThemePreference()).toBe('system')
  })
  it('applies and persists dark', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(getThemePreference()).toBe('dark')
  })
  it('system clears the stored choice', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBeNull()
  })
})
